import type { RecordingQuality } from '../types/recording';

export const RECORDING_SAMPLE_RATE = 24000;
export const MAX_RECORDING_SECONDS = 30;

export function inspectRecording(samples: Float32Array, rate = RECORDING_SAMPLE_RATE): RecordingQuality {
  let peak = 0, energy = 0, clipped = 0;
  for (const value of samples) {
    const magnitude = Math.abs(value);
    peak = Math.max(peak, magnitude);
    energy += value * value;
    if (magnitude >= 0.99) clipped++;
  }
  const duration = samples.length / rate;
  const rms = Math.sqrt(energy / Math.max(1, samples.length));
  const clippedFraction = clipped / Math.max(1, samples.length);
  const warnings: string[] = [];
  if (duration < 0.5) warnings.push('Too short. Read the complete sentence before stopping.');
  if (rms < 0.003) warnings.push('Almost silent. Check your microphone and try again.');
  else if (rms < 0.015) warnings.push('A little quiet. Move closer to the microphone.');
  if (clippedFraction > 0.001) warnings.push('Possible distortion. Lower the microphone level or move further away.');
  if (duration >= MAX_RECORDING_SECONDS - 0.1) warnings.push('The recording reached the time limit. Check that the sentence is complete.');
  return { duration, rms, peak, clippedFraction, warnings, usable: duration >= 0.5 && rms >= 0.003 };
}

export function encodeMonoWav(samples: Float32Array, sampleRate = RECORDING_SAMPLE_RATE): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Strict reader for our own canonical mono PCM files, not arbitrary WAV imports. */
export function decodeProjectWav(buffer: ArrayBuffer): Float32Array {
  if (buffer.byteLength < 44 || buffer.byteLength % 2 !== 0) throw new Error('Invalid WAV recording.');
  const view = new DataView(buffer);
  const text = (start: number, length: number) => String.fromCharCode(...new Uint8Array(buffer, start, length));
  if (text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE' || text(12, 4) !== 'fmt ' || text(36, 4) !== 'data' ||
      view.getUint32(4, true) !== buffer.byteLength - 8 || view.getUint32(16, true) !== 16 ||
      view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 ||
      view.getUint32(24, true) !== RECORDING_SAMPLE_RATE || view.getUint32(28, true) !== RECORDING_SAMPLE_RATE * 2 ||
      view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16 ||
      view.getUint32(40, true) !== buffer.byteLength - 44) throw new Error('Unsupported recording. Expected Vocalis 24 kHz mono PCM WAV.');
  const samples = new Float32Array((buffer.byteLength - 44) / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(44 + i * 2, true) / 32768;
  return samples;
}

export async function prepareRecording(blob: Blob): Promise<{ audio: Blob; quality: RecordingQuality }> {
  // Offline decoding/resampling: no server, recognition model, or microphone upload.
  const decoder = new OfflineAudioContext(1, 1, RECORDING_SAMPLE_RATE);
  const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
  if (decoded.duration > MAX_RECORDING_SECONDS + 0.5) throw new Error('The audio is longer than 30 seconds. Trim it to one sentence before importing.');
  const length = Math.min(Math.ceil(decoded.duration * RECORDING_SAMPLE_RATE), MAX_RECORDING_SECONDS * RECORDING_SAMPLE_RATE);
  const context = new OfflineAudioContext(1, Math.max(1, length), RECORDING_SAMPLE_RATE);
  const source = context.createBufferSource();
  source.buffer = decoded;
  source.connect(context.destination);
  source.start();
  const rendered = await context.startRendering();
  const samples = rendered.getChannelData(0);
  return { audio: encodeMonoWav(samples), quality: inspectRecording(samples) };
}

/** Assemble whole, approved sentences; never implies arbitrary-text synthesis. */
export async function assemblePhrases(clips: Blob[]): Promise<Blob> {
  if (!clips.length || clips.length > 20) throw new Error('Choose between 1 and 20 recorded phrases.');
  const chunks = await Promise.all(clips.map(async clip => decodeProjectWav(await clip.arrayBuffer())));
  const gap = Math.round(RECORDING_SAMPLE_RATE * 0.18);
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0) + gap * (chunks.length - 1);
  if (length > RECORDING_SAMPLE_RATE * 180) throw new Error('Keep the assembled audio under three minutes.');
  const output = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    // Only soften the outermost 5 ms; retain the speaker's original delivery.
    const fade = Math.min(120, Math.floor(chunk.length / 2));
    for (let i = 0; i < fade; i++) {
      output[offset + i] *= i / fade;
      output[offset + chunk.length - 1 - i] *= i / fade;
    }
    offset += chunk.length + gap;
  }
  return encodeMonoWav(output);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'my-voice';
}
