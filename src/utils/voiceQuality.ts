import type { VoiceQualityReport } from '../types/voiceAsset';
import { analysePcm } from './voiceAnalysis';

function percentile(values: number[], position: number): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.max(0, Math.floor((ordered.length - 1) * position)))];
}

/** Objective guardrails, not a replacement for the listener's naturalness review. */
export function inspectPcmQuality(samples: Float32Array, sampleRate: number): VoiceQualityReport {
  let peak = 0;
  let squared = 0;
  let clippingSamples = 0;
  const deltas: number[] = [];
  for (let index = 0; index < samples.length; index++) {
    const value = samples[index];
    peak = Math.max(peak, Math.abs(value));
    squared += value * value;
    if (Math.abs(value) >= 0.999) clippingSamples++;
    if (index) deltas.push(Math.abs(value - samples[index - 1]));
  }
  const rms = Math.sqrt(squared / Math.max(1, samples.length));
  // Quality guard uses a 10 ms hop for bounded export latency; the visible POC
  // analysis worker uses its finer default 5 ms hop for acoustic inspection.
  const analysis = analysePcm(samples, sampleRate, { hopMs: 10 });
  const discontinuityScore = percentile(deltas, 0.995) / Math.max(1e-7, percentile(deltas, 0.5));
  const warnings: string[] = [];
  if (peak > 0.995 || clippingSamples) warnings.push('Peak/clipping guard: reduce mix level before accepting this candidate.');
  if (rms < 0.008) warnings.push('Very low average level: check source gain and intelligibility.');
  if (discontinuityScore > 80) warnings.push('Large sample discontinuities detected: listen for clicks or edit joins.');
  if (analysis.voicedFrameRatio < 0.12) warnings.push('Low voiced-frame coverage: pitch/formant assessment may be unreliable.');
  return {
    peakDbfs: 20 * Math.log10(Math.max(1e-8, peak)),
    rmsDbfs: 20 * Math.log10(Math.max(1e-8, rms)),
    clippingSamples,
    durationSeconds: samples.length / sampleRate,
    voicedFrameRatio: analysis.voicedFrameRatio,
    discontinuityScore,
    warnings,
  };
}

export function inspectAudioBufferQuality(buffer: AudioBuffer): VoiceQualityReport {
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    for (let index = 0; index < mono.length; index++) mono[index] += source[index] / buffer.numberOfChannels;
  }
  return inspectPcmQuality(mono, buffer.sampleRate);
}
