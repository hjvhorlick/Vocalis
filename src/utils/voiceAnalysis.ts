/**
 * Local, deterministic voiced-frame analysis for the variant proof-of-concept.
 * It uses normalised autocorrelation for F0/voicing and LPC spectral-envelope
 * peaks for indicative F1–F3 regions. It never mutates the supplied samples.
 */
export type AcousticFrame = {
  timeSeconds: number;
  voiced: boolean;
  rmsDbfs: number;
  f0Hz?: number;
  periodicity: number;
  aperiodicity: number;
  harmonicityDb?: number;
  formantPeaksHz: number[];
};

export type AcousticAnalysis = {
  sampleRate: number;
  frameMs: number;
  hopMs: number;
  frames: AcousticFrame[];
  voicedFrameRatio: number;
  medianF0Hz?: number;
  medianFormantsHz: number[];
};

const clamp = (value: number, lower: number, upper: number) => Math.max(lower, Math.min(upper, value));

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function hamming(index: number, length: number) {
  return 0.54 - 0.46 * Math.cos(2 * Math.PI * index / Math.max(1, length - 1));
}

function normalisedAutocorrelation(frame: Float32Array, sampleRate: number): { lag: number; periodicity: number; rms: number } {
  let energy = 0;
  for (const value of frame) energy += value * value;
  const rms = Math.sqrt(energy / Math.max(1, frame.length));
  if (rms < 0.003) return { lag: 0, periodicity: 0, rms };
  const minLag = Math.max(1, Math.floor(sampleRate / 420));
  const maxLag = Math.min(frame.length - 2, Math.ceil(sampleRate / 60));
  let bestLag = 0;
  let best = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let numerator = 0, leftEnergy = 0, rightEnergy = 0;
    for (let index = 0; index < frame.length - lag; index++) {
      const left = frame[index];
      const right = frame[index + lag];
      numerator += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const correlation = numerator / Math.sqrt(Math.max(1e-12, leftEnergy * rightEnergy));
    if (correlation > best) { best = correlation; bestLag = lag; }
  }
  return { lag: bestLag, periodicity: Math.max(0, best), rms };
}

function lpcCoefficients(frame: Float32Array, order: number): Float64Array | undefined {
  const signal = new Float64Array(frame.length);
  let previous = 0;
  for (let index = 0; index < frame.length; index++) {
    const current = frame[index] * hamming(index, frame.length);
    signal[index] = current - previous * 0.97;
    previous = current;
  }
  const autocorrelation = new Float64Array(order + 1);
  for (let lag = 0; lag <= order; lag++) {
    for (let index = lag; index < signal.length; index++) autocorrelation[lag] += signal[index] * signal[index - lag];
  }
  if (autocorrelation[0] < 1e-9) return undefined;
  const coefficients = new Float64Array(order + 1);
  coefficients[0] = 1;
  let error = autocorrelation[0];
  for (let iteration = 1; iteration <= order; iteration++) {
    let sum = autocorrelation[iteration];
    for (let index = 1; index < iteration; index++) sum += coefficients[index] * autocorrelation[iteration - index];
    const reflection = -sum / Math.max(1e-12, error);
    if (!Number.isFinite(reflection) || Math.abs(reflection) >= 0.999) return undefined;
    const next = coefficients.slice();
    next[iteration] = reflection;
    for (let index = 1; index < iteration; index++) next[index] = coefficients[index] + reflection * coefficients[iteration - index];
    coefficients.set(next);
    error *= 1 - reflection * reflection;
    if (error < 1e-10) break;
  }
  return coefficients;
}

function lpcEnvelopePeaks(frame: Float32Array, sampleRate: number): number[] {
  const coefficients = lpcCoefficients(frame, Math.min(16, Math.max(8, Math.floor(sampleRate / 1000) + 2)));
  if (!coefficients) return [];
  const stepHz = 25;
  const points: { hz: number; db: number }[] = [];
  for (let hz = 150; hz <= Math.min(5_000, sampleRate / 2 - stepHz); hz += stepHz) {
    const omega = 2 * Math.PI * hz / sampleRate;
    let real = 1, imaginary = 0;
    for (let index = 1; index < coefficients.length; index++) {
      real += coefficients[index] * Math.cos(omega * index);
      imaginary -= coefficients[index] * Math.sin(omega * index);
    }
    points.push({ hz, db: -20 * Math.log10(Math.max(1e-10, Math.sqrt(real * real + imaginary * imaginary))) });
  }
  const candidates: { hz: number; db: number }[] = [];
  for (let index = 1; index < points.length - 1; index++) {
    if (points[index].db > points[index - 1].db && points[index].db >= points[index + 1].db) candidates.push(points[index]);
  }
  candidates.sort((a, b) => b.db - a.db);
  const selected: number[] = [];
  for (const candidate of candidates) {
    if (selected.every(hz => Math.abs(hz - candidate.hz) >= 180)) selected.push(candidate.hz);
    if (selected.length === 3) break;
  }
  return selected.sort((a, b) => a - b);
}

export function analysePcm(samples: Float32Array, sampleRate: number, options: { frameMs?: number; hopMs?: number } = {}): AcousticAnalysis {
  const frameMs = options.frameMs ?? 25;
  const hopMs = options.hopMs ?? 5;
  const frameLength = Math.max(64, Math.round(sampleRate * frameMs / 1000));
  const hopLength = Math.max(1, Math.round(sampleRate * hopMs / 1000));
  const frames: AcousticFrame[] = [];
  for (let start = 0; start + frameLength <= samples.length; start += hopLength) {
    const frame = samples.slice(start, start + frameLength);
    const autocorrelation = normalisedAutocorrelation(frame, sampleRate);
    const voiced = autocorrelation.periodicity >= 0.48 && autocorrelation.rms >= 0.003;
    const periodicity = voiced ? autocorrelation.periodicity : 0;
    frames.push({
      timeSeconds: start / sampleRate,
      voiced,
      rmsDbfs: 20 * Math.log10(Math.max(1e-8, autocorrelation.rms)),
      f0Hz: voiced && autocorrelation.lag ? sampleRate / autocorrelation.lag : undefined,
      periodicity,
      aperiodicity: 1 - periodicity,
      harmonicityDb: voiced ? 20 * Math.log10(Math.max(1e-5, periodicity)) : undefined,
      formantPeaksHz: voiced ? lpcEnvelopePeaks(frame, sampleRate) : [],
    });
  }
  const voiced = frames.filter(frame => frame.voiced);
  const medianFormantsHz = [0, 1, 2].map(index => median(voiced.map(frame => frame.formantPeaksHz[index]).filter((value): value is number => Number.isFinite(value)))).filter((value): value is number => value !== undefined);
  return {
    sampleRate,
    frameMs,
    hopMs,
    frames,
    voicedFrameRatio: frames.length ? voiced.length / frames.length : 0,
    medianF0Hz: median(voiced.map(frame => frame.f0Hz!).filter(Number.isFinite)),
    medianFormantsHz,
  };
}

export function analyseAudioBuffer(buffer: AudioBuffer): AcousticAnalysis {
  // Mono analysis is intentional: it describes the voice source, not room stereo.
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    for (let index = 0; index < mono.length; index++) mono[index] += source[index] / buffer.numberOfChannels;
  }
  return analysePcm(mono, buffer.sampleRate);
}

/** Exposed for quality checks to keep aperiodicity/F0 measurements reproducible. */
export function analysisWarnings(analysis: AcousticAnalysis): string[] {
  const warnings: string[] = [];
  if (analysis.voicedFrameRatio < 0.12) warnings.push('Very little voiced speech was detected; pitch and formant controls are not reliable for this source.');
  if (analysis.medianF0Hz && (analysis.medianF0Hz < 65 || analysis.medianF0Hz > 400)) warnings.push('Detected F0 is outside the validated speech-control range.');
  if (!analysis.medianFormantsHz.length) warnings.push('No stable LPC spectral-envelope peaks were found. Keep formant transformation disabled.');
  return warnings;
}
