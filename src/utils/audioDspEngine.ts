import { getSharedAudioContext } from './naturalHumanAudio';

export interface VoiceDspConfig {
  pitch: number; // 0.5 to 1.8 (1.0 = normal)
  rate: number; // 0.6 to 1.6 (1.0 = normal)
  volume: number; // 0.1 to 1.0
  toneStyle: 'natural' | 'deep' | 'energetic' | 'whisper' | 'radio' | 'robot';
  throatWarmth?: number; // -12 to +12 dB (F1 resonance)
  oralClarity?: number; // -12 to +12 dB (F2 resonance)
  airPresence?: number; // -12 to +12 dB (F3 resonance)
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
 * Configure acoustic DSP nodes (EQ, formants, distortion, ring mod)
 */
function buildDspGraph(
  ctx: BaseAudioContext,
  source: AudioBufferSourceNode,
  config: VoiceDspConfig
): { finalNode: AudioNode; analyser?: AnalyserNode } {
  // 1. Pitch & Speed playbackRate
  const playbackFactor = Math.max(0.4, Math.min(2.5, config.pitch * config.rate));
  source.playbackRate.value = playbackFactor;

  // 2. Formant Filters (F1: Throat, F2: Oral, F3: Air)
  const f1Filter = ctx.createBiquadFilter();
  f1Filter.type = 'peaking';
  f1Filter.frequency.value = 450;
  f1Filter.Q.value = 1.2;
  f1Filter.gain.value = config.throatWarmth ?? 0;

  const f2Filter = ctx.createBiquadFilter();
  f2Filter.type = 'peaking';
  f2Filter.frequency.value = 1800;
  f2Filter.Q.value = 1.4;
  f2Filter.gain.value = config.oralClarity ?? 0;

  const f3Filter = ctx.createBiquadFilter();
  f3Filter.type = 'peaking';
  f3Filter.frequency.value = 4200;
  f3Filter.Q.value = 1.0;
  f3Filter.gain.value = config.airPresence ?? 0;

  // Connect base EQ chain
  source.connect(f1Filter);
  f1Filter.connect(f2Filter);
  f2Filter.connect(f3Filter);

  let currentLastNode: AudioNode = f3Filter;

  // 3. Acoustic Character Tone Styles
  if (config.toneStyle === 'deep') {
    const bassBoost = ctx.createBiquadFilter();
    bassBoost.type = 'lowshelf';
    bassBoost.frequency.value = 160;
    bassBoost.gain.value = 6;
    currentLastNode.connect(bassBoost);
    currentLastNode = bassBoost;
  } else if (config.toneStyle === 'energetic') {
    const presenceLift = ctx.createBiquadFilter();
    presenceLift.type = 'peaking';
    presenceLift.frequency.value = 3200;
    presenceLift.Q.value = 1.0;
    presenceLift.gain.value = 5;
    currentLastNode.connect(presenceLift);
    currentLastNode = presenceLift;
  } else if (config.toneStyle === 'whisper') {
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 600;
    const airLift = ctx.createBiquadFilter();
    airLift.type = 'highshelf';
    airLift.frequency.value = 5000;
    airLift.gain.value = 8;
    currentLastNode.connect(highpass);
    highpass.connect(airLift);
    currentLastNode = airLift;
  } else if (config.toneStyle === 'radio') {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 450;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;

    const shaper = ctx.createWaveShaper();
    (shaper as any).curve = makeVintageSaturationCurve(256);
    shaper.oversample = '4x';

    currentLastNode.connect(hp);
    hp.connect(lp);
    lp.connect(shaper);
    currentLastNode = shaper;
  } else if (config.toneStyle === 'robot') {
    if (ctx instanceof AudioContext) {
      const ringOsc = ctx.createOscillator();
      ringOsc.type = 'sine';
      ringOsc.frequency.value = 60;

      const ringGain = ctx.createGain();
      ringGain.gain.value = 0.5;

      const carrierGain = ctx.createGain();
      carrierGain.gain.value = 0.5;

      ringOsc.connect(ringGain.gain);
      currentLastNode.connect(carrierGain);
      carrierGain.connect(ringGain);
      ringOsc.start();
      currentLastNode = ringGain;
    }
  }

  // 4. Master Volume Gain
  const masterGain = ctx.createGain();
  masterGain.gain.value = Math.max(0, Math.min(1.5, config.volume));
  currentLastNode.connect(masterGain);

  let analyser: AnalyserNode | undefined;
  if (ctx instanceof AudioContext) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);
  }

  return { finalNode: masterGain, analyser };
}

function makeVintageSaturationCurve(samples: number): Float32Array {
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  const k = 45;
  for (let i = 0; i < samples; ++i) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

/**
 * Play transformed voice in real time through user's speakers
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
    const ctx = getSharedAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    const { analyser } = buildDspGraph(ctx, source, config);
    activeAnalyserNode = analyser || null;
    activeSourceNode = source;
    isAudioPlaying = true;

    source.onended = () => {
      isAudioPlaying = false;
      activeSourceNode = null;
      if (callbacks?.onEnded) callbacks.onEnded();
    };

    if (callbacks?.onStart) callbacks.onStart();
    source.start(0);
  } catch (err: any) {
    isAudioPlaying = false;
    activeSourceNode = null;
    if (callbacks?.onError) callbacks.onError(err);
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
 * 48 kHz; Web Audio resamples on playback, so the buffer keeps its own rate and
 * nothing is interpolated twice.
 */
export function samplesToAudioBuffer(samples: Float32Array, sampleRate: number): AudioBuffer {
  const ctx = getSharedAudioContext();
  const length = Math.max(1, samples.length);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  buffer.copyToChannel(Float32Array.from(samples.subarray(0, length)), 0);
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
    callbacks?.onStart?.();
    source.start(0);
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
 * Render transformed voice offline into a downloadable 16-bit uncompressed WAV file
 */
export async function renderTransformedWav(
  audioBuffer: AudioBuffer,
  config: VoiceDspConfig
): Promise<{ wavBlob: Blob; wavUrl: string; duration: number }> {
  const playbackFactor = Math.max(0.4, Math.min(2.5, config.pitch * config.rate));
  const renderedDuration = audioBuffer.duration / playbackFactor + 0.3;
  const sampleRate = audioBuffer.sampleRate;
  const totalFrames = Math.ceil(renderedDuration * sampleRate);

  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    totalFrames,
    sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;

  const { finalNode } = buildDspGraph(offlineCtx, source, config);
  finalNode.connect(offlineCtx.destination);

  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  const wavBlob = audioBufferToWavBlob(renderedBuffer);
  const wavUrl = URL.createObjectURL(wavBlob);

  return {
    wavBlob,
    wavUrl,
    duration: renderedDuration,
  };
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
