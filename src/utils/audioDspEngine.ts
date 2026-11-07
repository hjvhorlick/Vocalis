import { getSharedAudioContext } from './naturalHumanAudio';
import { transformRecordedVoice } from './voiceTransform';

export interface VoiceDspConfig {
  pitch: number; // 0.5 to 1.8 (1.0 = normal)
  rate: number; // 0.6 to 1.6 (1.0 = normal)
  volume: number; // 0.1 to 1.0
  toneStyle: 'natural' | 'deep' | 'energetic' | 'whisper' | 'radio' | 'robot';
  throatWarmth?: number; // -3 to +3 dB (F1 tilt, clamped by voiceTransform)
  oralClarity?: number; // -3 to +3 dB (F2 tilt, clamped by voiceTransform)
  airPresence?: number; // -3 to +3 dB (F3 tilt, clamped by voiceTransform)
  /** Stages switched off by name; a bypassed stage is skipped, not neutralised. */
  bypass?: Partial<
    Record<
      | 'pitch'
      | 'rate'
      | 'volume'
      | 'tone'
      | 'throatWarmth'
      | 'oralClarity'
      | 'airPresence'
      | 'contour'
      | 'joinLevel',
      boolean
    >
  >;
}

let activeSourceNode: AudioBufferSourceNode | null = null;
let activeAnalyserNode: AnalyserNode | null = null;
let isAudioPlaying = false;

export function getDspAnalyser(): AnalyserNode | null {
  return activeAnalyserNode;
}

export function isDspPlaying(): boolean {
  return isAudioPlaying;
}

/**
 * Apply the profile's transformation to a whole buffer.
 *
 * This is the *same* stage generated speech goes through — band-limited pitch,
 * formant-preserved register change, correlation-aligned pace, tone character
 * and the resonance sliders — applied to one real recording. The point of the
 * A/B feature is to hear what the transformation did, so it would be dishonest
 * for it to run a second, different processing chain (which is exactly what the
 * old node graph did: one playback rate drove pitch and tempo together, so the
 * comparison was against a chipmunk version of the sentence, and the robot
 * character existed only on playback and never in the exported file).
 */
export function transformBuffer(buffer: AudioBuffer, config: VoiceDspConfig): AudioBuffer {
  const ctx = getSharedAudioContext();
  const channels = buffer.numberOfChannels;
  const settings = {
    pitch: config.pitch,
    rate: config.rate,
    toneStyle: config.toneStyle,
    throatWarmth: config.throatWarmth,
    oralClarity: config.oralClarity,
    airPresence: config.airPresence,
  };
  const rendered: Float32Array[] = [];
  let longest = 1;
  for (let channel = 0; channel < channels; channel += 1) {
    const source = Float32Array.from(buffer.getChannelData(channel));
    const shaped = transformRecordedVoice(source, settings, buffer.sampleRate);
    rendered.push(shaped);
    longest = Math.max(longest, shaped.length);
  }
  const result = ctx.createBuffer(channels, longest, buffer.sampleRate);
  rendered.forEach((samples, channel) => result.copyToChannel(Float32Array.from(samples), channel));
  const level = config.bypass?.volume ? 1 : Math.max(0, Math.min(1.5, config.volume));
  if (level !== 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const data = result.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) {
        const value = data[index] * level;
        data[index] = value > 1 ? 1 : value < -1 ? -1 : value;
      }
    }
  }
  return result;
}

/**
 * Play the transformed reference recording through the user's speakers.
 *
 * The buffer is transformed first and then played as ordinary samples, so
 * playback and export are the same audio and the same code path as generated
 * speech. Nothing is left running after the render.
 */
export function playTransformedVoice(
  audioBuffer: AudioBuffer,
  config: VoiceDspConfig,
  callbacks?: {
    onStart?: () => void;
    onEnded?: () => void;
    onError?: (err: Error) => void;
  }
): void {
  stopTransformedVoice();
  try {
    const transformed = transformBuffer(audioBuffer, config);
    const samples = Float32Array.from(transformed.getChannelData(0));
    const playback = playRenderedSpeech(samples, transformed.sampleRate, {
      onStart: () => callbacks?.onStart?.(),
      onEnded: () => callbacks?.onEnded?.(),
      onError: (error) => callbacks?.onError?.(error),
    });
    if (!playback) throw new Error('the transformed recording could not be played');
  } catch (err: any) {
    isAudioPlaying = false;
    activeSourceNode = null;
    const asError = err instanceof Error ? err : new Error(String(err));
    callbacks?.onError?.(asError);
    callbacks?.onEnded?.();
  }
}

/**
 * Stop any ongoing audio playback
 */
export function stopTransformedVoice(): void {
  if (activeSourceNode) {
    try {
      // Detach the handler first: stopping must not also report "ended", or a
      // caller that replaces one render with another fires both events.
      activeSourceNode.onended = null;
      activeSourceNode.stop();
    } catch {
      // already stopped
    }
    try {
      activeSourceNode.disconnect();
    } catch {
      // already disconnected
    }
    activeSourceNode = null;
  }
  if (activeAnalyserNode) {
    try {
      activeAnalyserNode.disconnect();
    } catch {
      // already disconnected
    }
    activeAnalyserNode = null;
  }
  isAudioPlaying = false;
}

// ---------------------------------------------------------------------------
// Playback of speech the Vocalis engine has already rendered
// ---------------------------------------------------------------------------

/**
 * Wrap engine samples in an AudioBuffer.
 *
 * The engine renders at 16 kHz and the audio context usually runs at 44.1 or
 * 48 kHz. The rate conversion is done here by `resampleToRate` before the buffer is
 * built, so it is one band-limited conversion with a known kernel instead of the
 * browser's linear interpolation.
 */
/** Taps either side of the output sample: 32 gives about 90 dB of image rejection. */
const RESAMPLE_TAPS = 32;

/**
 * Sample-rate conversion with a windowed-sinc kernel.
 *
 * Every engine render is 16 kHz and almost every device runs at 44.1 or 48 kHz, so
 * something has to change the rate on the way to the speakers. Left to the browser
 * that conversion is linear interpolation, which folds images of the speech band
 * back into the audible top end — measured on a real CMU ARCTIC sentence, about
 * 35 dB below the speech, which is the faint buzz on sibilants no switch can turn
 * off because it is not one of our stages. Doing it here, with a 32-tap
 * Hann-windowed sinc, puts that at about 92 dB below: inaudible.
 *
 * The exported WAV is not touched by this. It stays at the engine's own rate; this
 * is only the copy handed to the audio context.
 */
export function resampleToRate(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (!samples.length || fromRate <= 0 || toRate <= 0) return Float32Array.from(samples);
  if (fromRate === toRate) return Float32Array.from(samples);
  const ratio = toRate / fromRate;
  const length = Math.max(1, Math.round(samples.length * ratio));
  const cutoff = Math.min(1, ratio);
  // The kernel has to be as long as the band it is cutting: a third of the band
  // needs three times the taps, or the transition ends up wide enough to let the
  // folded image through, which is the very thing this exists to stop.
  const half = Math.max(RESAMPLE_TAPS, Math.ceil(RESAMPLE_TAPS / cutoff));
  const out = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index / ratio;
    const centre = Math.floor(position);
    let total = 0;
    let weight = 0;
    for (let tap = -half + 1; tap <= half; tap += 1) {
      const source = centre + tap;
      if (source < 0 || source >= samples.length) continue;
      const distance = position - source;
      const window = Math.abs(distance) >= half ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * distance) / half);
      const arg = Math.PI * distance * cutoff;
      const sinc = Math.abs(arg) < 1e-12 ? 1 : Math.sin(arg) / arg;
      const kernel = cutoff * sinc * window;
      total += samples[source] * kernel;
      weight += kernel;
    }
    out[index] = weight > 1e-6 ? total / weight : 0;
  }
  return out;
}

export function samplesToAudioBuffer(samples: Float32Array, sampleRate: number): AudioBuffer {
  const ctx = getSharedAudioContext();
  // Hand the context samples at its own rate, so the conversion is the one above
  // rather than whatever interpolation the browser happens to use.
  const targetRate = ctx.sampleRate > 0 ? ctx.sampleRate : sampleRate;
  const prepared = targetRate === sampleRate ? Float32Array.from(samples) : resampleToRate(samples, sampleRate, targetRate);
  const length = Math.max(1, prepared.length);
  const buffer = ctx.createBuffer(1, length, targetRate);
  buffer.copyToChannel(Float32Array.from(prepared.subarray(0, length)), 0);
  return buffer;
}

export interface RenderedPlayback {
  stop: () => void;
  duration: number;
}

/**
 * Play audio the engine has already rendered.
 *
 * This is the single playback path for generated speech: Speech Studio,
 * Dialogue Studio and any future surface all come through here, so there is one
 * implementation of "make a render audible" and no way for two studios to drift
 * apart. These are the same samples the WAV encoder consumes, which is what
 * makes preview and export identical.
 *
 * A gain node carries the profile volume and an analyser feeds the visualizer.
 */
export function playRenderedSpeech(
  samples: Float32Array,
  sampleRate: number,
  callbacks?: { onStart?: () => void; onEnded?: () => void; onError?: (error: Error) => void },
): RenderedPlayback | null {
  if (!samples.length) {
    callbacks?.onEnded?.();
    return null;
  }
  stopTransformedVoice();
  try {
    const ctx: BaseAudioContext = getSharedAudioContext();
    const buffer = samplesToAudioBuffer(samples, sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    source.connect(gain);
    if (ctx instanceof AudioContext) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      gain.connect(analyser);
      analyser.connect(ctx.destination);
      activeAnalyserNode = analyser;
    } else {
      gain.connect(ctx.destination);
    }
    activeSourceNode = source;
    isAudioPlaying = true;
    source.onended = () => {
      isAudioPlaying = false;
      activeSourceNode = null;
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        // already torn down
      }
      callbacks?.onEnded?.();
    };
    // Browsers start a page's audio context suspended until a gesture unlocks it.
    // Resuming is asynchronous, and a resume that is dropped on the floor is
    // indistinguishable from a broken library: the samples are rendered, nothing
    // is audible, and no error is raised. So wait for the context to actually run,
    // start inside that callback, and report the failure when it cannot.
    let started = false;
    const begin = (): void => {
      if (started) return;
      started = true;
      callbacks?.onStart?.();
      source.start(0);
    };
    const failsToResume = (reason: string): void => {
      isAudioPlaying = false;
      activeSourceNode = null;
      callbacks?.onError?.(
        new Error(
          `the browser is not allowing audio to start (${reason}). Click Audition again — ` +
            'the first click is what unlocks sound.',
        ),
      );
    };
    if (typeof AudioContext !== 'undefined' && ctx instanceof AudioContext && ctx.state !== 'running') {
      ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running') begin();
          else failsToResume(`the audio context stayed ${ctx.state}`);
        })
        .catch((error: unknown) => {
          failsToResume(error instanceof Error ? error.message : String(error));
        });
    } else {
      begin();
    }
    return { stop: () => stopTransformedVoice(), duration: buffer.duration };
  } catch (error) {
    isAudioPlaying = false;
    activeSourceNode = null;
    const asError = error instanceof Error ? error : new Error(String(error));
    callbacks?.onError?.(asError);
    callbacks?.onEnded?.();
    return null;
  }
}

/**
 * Render the transformed reference recording to a downloadable WAV.
 *
 * There is no offline audio graph any more: the transform is arithmetic on the
 * samples, so the file is written from exactly what playback heard — including
 * the robot character, which the old node-based export silently dropped.
 */
export async function renderTransformedWav(
  audioBuffer: AudioBuffer,
  config: VoiceDspConfig
): Promise<{ wavBlob: Blob; wavUrl: string; duration: number }> {
  const transformed = transformBuffer(audioBuffer, config);
  const wavBlob = audioBufferToWavBlob(transformed);
  const wavUrl = URL.createObjectURL(wavBlob);
  return { wavBlob, wavUrl, duration: transformed.duration };
}

/**
 * Convert AudioBuffer into a pristine 16-bit PCM WAV Blob
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2;
  const bufferArray = new ArrayBuffer(44 + length);
  const view = new DataView(bufferArray);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(8, 'WAVE');

  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);

  writeString(36, 'data');
  view.setUint32(40, length, true);

  let offset = 44;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([bufferArray], { type: 'audio/wav' });
}
