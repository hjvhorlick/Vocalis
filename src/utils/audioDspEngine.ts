import { getSharedAudioContext } from './naturalHumanAudio';
import { transformPitchAndRate, transformVoicedPitch } from './cmuDiphoneSynthesizer';
import { warpSpectralEnvelope } from './spectralEnvelopeWarp';

export interface VoiceDspConfig {
  pitch: number; // validated 0.75 to 1.30 (1.0 = normal)
  rate: number; // validated 0.70 to 1.30 (1.0 = normal)
  volume: number; // 0.1 to 1.0
  toneStyle: 'natural' | 'deep' | 'energetic' | 'whisper' | 'radio' | 'robot';
  throatWarmth?: number; // -12 to +12 dB (F1 resonance)
  oralClarity?: number; // -12 to +12 dB (F2 resonance)
  airPresence?: number; // -12 to +12 dB high-frequency EQ
  /** Broadband low-to-high balance in dB, via complementary shelf filters. */
  spectralTilt?: number;
  /** Bounded 0.85–1.15 spectral-envelope frequency warp; 1 leaves envelope unchanged. */
  formantShift?: number;
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
 * Gives offline transforms predictable headroom before the final limiter. It
 * avoids hard integer clipping while leaving ordinary, low-level speech samples
 * bit-for-bit untouched. A tiny cosine edge fade also prevents a processed clip
 * from beginning or ending on a discontinuity.
 */
export function stabilizeDspPcm(input: Float32Array, sampleRate: number): Float32Array {
  if (!input.length) return input.slice();
  let peak = 0;
  for (const sample of input) if (Number.isFinite(sample)) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0.92 ? 0.92 / peak : 1;
  const output = new Float32Array(input.length);
  const fadeSamples = Math.min(Math.floor(input.length / 2), Math.max(8, Math.round(sampleRate * 0.003)));
  for (let index = 0; index < input.length; index++) {
    const sample = Number.isFinite(input[index]) ? input[index] * gain : 0;
    // This is a safety knee, not a character distortion: it acts only near
    // full scale, where a later PCM conversion would otherwise clip abruptly.
    const protectedSample = Math.abs(sample) > 0.97 ? Math.tanh(sample * 1.2) / Math.tanh(1.2) : sample;
    let edge = 1;
    if (index < fadeSamples) edge = 0.5 - 0.5 * Math.cos(Math.PI * index / Math.max(1, fadeSamples));
    else if (index >= input.length - fadeSamples) {
      const remaining = input.length - 1 - index;
      edge = 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, remaining) / Math.max(1, fadeSamples));
    }
    output[index] = protectedSample * edge;
  }
  return output;
}

/**
 * Configure acoustic DSP nodes (EQ, formants, distortion, ring mod)
 */
function buildDspGraph(
  ctx: BaseAudioContext,
  source: AudioBufferSourceNode,
  config: VoiceDspConfig
): { finalNode: AudioNode; analyser?: AnalyserNode } {
  // 1. Never multiply pitch and speed into playbackRate: that couples two
  // controls. Offline derived renders prepare timing with transformPitchAndRate;
  // live/source playback stays at its stored rate.
  source.playbackRate.value = 1;

  // 2. Fixed-frequency spectral filters (not measured formants)
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

  // Complementary shelves create a declared broadband spectral tilt. Unlike the
  // fixed peaking controls above, this changes the overall low-to-high slope.
  const lowTilt = ctx.createBiquadFilter();
  lowTilt.type = 'lowshelf'; lowTilt.frequency.value = 500;
  lowTilt.gain.value = -(config.spectralTilt ?? 0) / 2;
  const highTilt = ctx.createBiquadFilter();
  highTilt.type = 'highshelf'; highTilt.frequency.value = 3000;
  highTilt.gain.value = (config.spectralTilt ?? 0) / 2;
  f3Filter.connect(lowTilt); lowTilt.connect(highTilt);

  let currentLastNode: AudioNode = highTilt;

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

  // 4. Master gain and a gentle delivery limiter. Stacked spectral controls can
  // otherwise push a perfectly valid source above full scale and turn peaks into
  // the crackles users hear. The limiter sits after every colour control in both
  // live preview and offline variant rendering; it never touches the original.
  const masterGain = ctx.createGain();
  masterGain.gain.value = Math.max(0, Math.min(1, config.volume));
  const safetyLimiter = ctx.createDynamicsCompressor();
  safetyLimiter.threshold.value = -3;
  safetyLimiter.knee.value = 6;
  safetyLimiter.ratio.value = 12;
  safetyLimiter.attack.value = 0.003;
  safetyLimiter.release.value = 0.12;
  currentLastNode.connect(masterGain);
  masterGain.connect(safetyLimiter);

  let analyser: AnalyserNode | undefined;
  if (ctx instanceof AudioContext) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    safetyLimiter.connect(analyser);
    analyser.connect(ctx.destination);
  }

  return { finalNode: safetyLimiter, analyser };
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
      if (activeSourceNode !== source) return;
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
      activeSourceNode.stop();
      activeSourceNode.disconnect();
    } catch {
      // ignore
    }
    activeSourceNode = null;
  }
  isAudioPlaying = false;
}

/**
 * Render transformed voice offline into a downloadable 16-bit uncompressed WAV file
 */
export async function renderTransformedWav(
  audioBuffer: AudioBuffer,
  config: VoiceDspConfig
): Promise<{ wavBlob: Blob; wavUrl: string; duration: number }> {
  const sampleRate = audioBuffer.sampleRate;
  // Do not use source.playbackRate here: it necessarily couples pitch and
  // duration. The bounded resample + WSOLA pipeline applies them separately.
  const transformedChannels = Array.from({ length: audioBuffer.numberOfChannels }, (_, channel) => {
    const source = audioBuffer.getChannelData(channel);
    // Spectral-envelope warping moves broad resonance regions while preserving
    // carrier phase; it is a bounded formant-colour control, not static EQ.
    const envelopeWarped = warpSpectralEnvelope(source, config.formantShift ?? 1);
    const voicedPitchShifted = transformVoicedPitch(envelopeWarped, sampleRate, config.pitch);
    // Rate may scale the full phrase; pitch has already bypassed unvoiced frames.
    return stabilizeDspPcm(transformPitchAndRate(voicedPitchShifted, 1, config.rate), sampleRate);
  });
  const transformedLength = Math.max(1, ...transformedChannels.map(channel => channel.length));
  const totalFrames = transformedLength + Math.ceil(sampleRate * 0.3);
  const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels, totalFrames, sampleRate);
  const transformedBuffer = offlineCtx.createBuffer(audioBuffer.numberOfChannels, transformedLength, sampleRate);
  transformedChannels.forEach((channel, channelIndex) => {
    transformedBuffer.getChannelData(channelIndex).set(channel.subarray(0, transformedLength));
  });

  const source = offlineCtx.createBufferSource();
  source.buffer = transformedBuffer;
  const neutralTimingConfig: VoiceDspConfig = { ...config, pitch: 1, rate: 1 };
  const { finalNode } = buildDspGraph(offlineCtx, source, neutralTimingConfig);
  finalNode.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  const wavBlob = audioBufferToWavBlob(renderedBuffer);
  const wavUrl = URL.createObjectURL(wavBlob);
  return { wavBlob, wavUrl, duration: renderedBuffer.duration };
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
