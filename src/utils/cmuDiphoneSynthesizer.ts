import type { VoiceModelConfig } from './naturalVoiceEngine';
import { analysePcm } from './voiceAnalysis';
import { ORIGINAL_VOICE_PACK_SHA256 } from './originalVoicePackHashes';

type DiphoneManifest = {
  format: string;
  speakerId: 'slt' | 'bdl';
  sampleRate: number;
  units: Record<string, { offset: number; length: number }>;
};

type VoicePack = { manifest: DiphoneManifest; samples: Int16Array };
type FallbackPhone = (phone: string, absoluteOffset: number) => Float32Array;

const SAMPLE_RATE = 16000;
const packs = new Map<string, Promise<VoicePack>>();

async function sha256ArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function speakerForModel(model: VoiceModelConfig): 'slt' | 'bdl' {
  if (model.baseVoiceId) return model.baseVoiceId;
  if (model.gender === 'Male') return 'bdl';
  if (model.gender === 'Female') return 'slt';
  return model.baseVoiceId || 'slt';
}

async function loadVoicePack(speaker: 'slt' | 'bdl'): Promise<VoicePack> {
  const cached = packs.get(speaker);
  if (cached) return cached;
  const request = (async () => {
    const root = `/voicepacks/cmu-arctic/${speaker}`;
    const [manifestResponse, audioResponse] = await Promise.all([
      fetch(`${root}/manifest.json`),
      fetch(`${root}/diphones.bin`),
    ]);
    if (!manifestResponse.ok || !audioResponse.ok) throw new Error(`Could not load the CMU ARCTIC ${speaker.toUpperCase()} voice pack.`);
    const manifestBytes = await manifestResponse.arrayBuffer();
    const buffer = await audioResponse.arrayBuffer();
    const manifestPath = `cmu-arctic/${speaker}/manifest.json`;
    const audioPath = `cmu-arctic/${speaker}/diphones.bin`;
    if (await sha256ArrayBuffer(manifestBytes) !== ORIGINAL_VOICE_PACK_SHA256[manifestPath] || await sha256ArrayBuffer(buffer) !== ORIGINAL_VOICE_PACK_SHA256[audioPath]) {
      throw new Error('CMU voice-pack verification failed. Rendering is blocked because protected pack bytes changed.');
    }
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as DiphoneManifest;
    if (manifest.format !== 'vocalis-cmu-diphones-v1' || manifest.speakerId !== speaker || manifest.sampleRate !== SAMPLE_RATE || buffer.byteLength % 2 || !manifest.units || typeof manifest.units !== 'object') throw new Error('Invalid packaged CMU voice manifest.');
    for (const entry of Object.values(manifest.units)) {
      if (!entry || !Number.isSafeInteger(entry.offset) || entry.offset < 0 || entry.offset % 2 || !Number.isSafeInteger(entry.length) || entry.length < 1 || entry.offset + entry.length * 2 > buffer.byteLength) throw new Error('CMU voice unit points outside the packaged audio.');
    }
    return { manifest, samples: new Int16Array(buffer) };
  })();
  packs.set(speaker, request);
  try {
    return await request;
  } catch (error) {
    packs.delete(speaker);
    throw error;
  }
}

export function prepareCmuVoice(model: VoiceModelConfig): Promise<void> {
  return loadVoicePack(speakerForModel(model)).then(() => undefined);
}

function crossfadeJoin(chunks: Float32Array[]): Float32Array {
  if (!chunks.length) return new Float32Array(0);
  if (chunks.length === 1) return chunks[0];
  const overlap = Math.floor(SAMPLE_RATE * 0.006);
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Float32Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    if (cursor === 0) {
      output.set(chunk);
      cursor = chunk.length;
      continue;
    }
    const blend = Math.min(overlap, cursor, chunk.length);
    const start = cursor - blend;
    for (let i = 0; i < blend; i++) {
      const mix = (i + 1) / (blend + 1);
      output[start + i] = output[start + i] * (1 - mix) + chunk[i] * mix;
    }
    output.set(chunk.subarray(blend), cursor);
    cursor += chunk.length - blend;
  }
  return output.slice(0, cursor);
}

export async function renderCmuDiphones(
  phones: string[],
  model: VoiceModelConfig,
  fallbackPhone: FallbackPhone,
  absoluteOffset: number,
): Promise<{ samples: Float32Array; speaker: 'slt' | 'bdl'; usedDiphones: number; fallbackDiphones: number }> {
  const speaker = speakerForModel(model);
  const chunks: Float32Array[] = [];
  let usedDiphones = 0;
  let fallbackDiphones = 0;
  let cursor = absoluteOffset;

  {
    const pack = await loadVoicePack(speaker);
    const stream = ['pau', ...phones.map((phone) => phone.toLowerCase()), 'pau'];
    for (let i = 0; i < stream.length - 1; i++) {
      const entry = pack.manifest.units[`${stream[i]}|${stream[i + 1]}`];
      if (entry) {
        const raw = pack.samples.subarray(entry.offset / 2, entry.offset / 2 + entry.length);
        const chunk = new Float32Array(raw.length);
        for (let sample = 0; sample < raw.length; sample++) chunk[sample] = raw[sample] / 32768;
        chunks.push(chunk);
        cursor += chunk.length;
        usedDiphones++;
      } else {
        const chunk = fallbackPhone(stream[i + 1].toUpperCase(), cursor);
        chunks.push(chunk);
        cursor += chunk.length;
        fallbackDiphones++;
      }
    }
  }

  return { samples: crossfadeJoin(chunks), speaker, usedDiphones, fallbackDiphones };
}

function resample(input: Float32Array, pitchFactor: number): Float32Array {
  const factor = Math.max(0.5, Math.min(2, pitchFactor));
  const length = Math.max(1, Math.floor(input.length / factor));
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const position = i * factor;
    const left = Math.floor(position);
    const right = Math.min(input.length - 1, left + 1);
    const fraction = position - left;
    output[i] = input[left] * (1 - fraction) + input[right] * fraction;
  }
  return output;
}

function wsolaStretch(input: Float32Array, targetLength: number): Float32Array {
  const outputLength = Math.max(1, targetLength);
  if (input.length < 512 || Math.abs(outputLength / input.length - 1) < 0.035) {
    const direct = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const position = i * input.length / outputLength;
      const left = Math.min(input.length - 1, Math.floor(position));
      const right = Math.min(input.length - 1, left + 1);
      const fraction = position - left;
      direct[i] = input[left] * (1 - fraction) + input[right] * fraction;
    }
    return direct;
  }

  const windowSize = 640;
  const synthesisHop = 320;
  const overlap = windowSize - synthesisHop;
  const stretch = outputLength / input.length;
  const analysisHop = synthesisHop / stretch;
  const searchRadius = 96;
  const output = new Float32Array(outputLength + windowSize);
  const weights = new Float32Array(output.length);
  let sourceStart = 0;
  let outputStart = 0;

  while (outputStart < outputLength) {
    if (outputStart === 0) {
      sourceStart = 0;
    } else {
      const expected = Math.round(sourceStart + analysisHop);
      const compareLength = Math.min(overlap, outputStart, input.length - expected);
      let best = Math.max(0, Math.min(input.length - windowSize, expected));
      let bestScore = -Infinity;
      const searchStart = Math.max(0, expected - searchRadius);
      const searchEnd = Math.min(input.length - windowSize, expected + searchRadius);
      const step = 8;
      for (let candidate = searchStart; candidate <= searchEnd; candidate += step) {
        let dot = 0;
        let normA = 0;
        let normB = 0;
        const outBase = outputStart;
        for (let j = 0; j < compareLength; j += 4) {
          const a = output[outBase + j];
          const b = input[candidate + j];
          dot += a * b;
          normA += a * a;
          normB += b * b;
        }
        const score = dot / Math.sqrt(normA * normB + 1e-9);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      sourceStart = best;
    }

    const available = Math.min(windowSize, input.length - sourceStart, output.length - outputStart);
    for (let i = 0; i < available; i++) {
      const fade = i < overlap && outputStart > 0 ? i / overlap : 1;
      output[outputStart + i] += input[sourceStart + i] * fade;
      weights[outputStart + i] += fade;
    }
    outputStart += synthesisHop;
  }

  const trimmed = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) trimmed[i] = weights[i] ? output[i] / weights[i] : 0;
  return trimmed;
}

function applyStyle(input: Float32Array, style: VoiceModelConfig['toneStyle']): Float32Array {
  if (style === 'natural' || style === 'deep' || style === 'energetic') return input;
  const output = new Float32Array(input.length);
  let previous = 0;
  let phase = 0;
  for (let i = 0; i < input.length; i++) {
    const sample = input[i];
    if (style === 'radio') {
      const highPassed = sample - previous * 0.91;
      previous = sample;
      output[i] = Math.tanh(highPassed * 5) * 0.75;
    } else if (style === 'robot') {
      output[i] = sample * (0.72 + 0.28 * Math.sin(phase));
      phase += 2 * Math.PI * 34 / SAMPLE_RATE;
    } else {
      // A softened, brighter and quieter timbre; unlike a true whispered
      // recording this is a post-processed speaking voice, not breath synthesis.
      const highPassed = sample - previous * 0.96;
      previous = sample;
      output[i] = sample * 0.42 + highPassed * 0.42;
    }
  }
  return output;
}

/**
 * Pitch-shift only the voiced regions identified by the local autocorrelation
 * analysis. Fricatives, stops and silence are copied through as-is; boundaries
 * are crossfaded to avoid abrupt joins. Duration stays unchanged here.
 */
export function transformVoicedPitch(samples: Float32Array, sampleRate: number, pitchFactor: number): Float32Array {
  const bounded = Math.max(0.75, Math.min(1.3, pitchFactor));
  if (Math.abs(bounded - 1) < 0.002 || samples.length < 512) return samples.slice();
  const analysis = analysePcm(samples, sampleRate, { frameMs: 25, hopMs: 5 });
  const voicedMask = new Uint8Array(samples.length);
  const frameLength = Math.round(sampleRate * analysis.frameMs / 1000);
  const hopLength = Math.round(sampleRate * analysis.hopMs / 1000);
  analysis.frames.forEach((frame, index) => {
    if (!frame.voiced) return;
    const start = index * hopLength;
    voicedMask.fill(1, start, Math.min(samples.length, start + frameLength));
  });
  const output = samples.slice();
  const fade = Math.max(8, Math.round(sampleRate * 0.008));
  let regionStart = 0;
  while (regionStart < voicedMask.length) {
    while (regionStart < voicedMask.length && !voicedMask[regionStart]) regionStart++;
    let regionEnd = regionStart;
    while (regionEnd < voicedMask.length && voicedMask[regionEnd]) regionEnd++;
    if (regionEnd - regionStart >= 512) {
      const transformed = transformPitchAndRate(samples.slice(regionStart, regionEnd), bounded, 1);
      for (let index = 0; index < transformed.length; index++) {
        const atBoundary = Math.min(index / fade, (transformed.length - 1 - index) / fade, 1);
        const mix = Math.max(0, atBoundary);
        output[regionStart + index] = samples[regionStart + index] * (1 - mix) + transformed[index] * mix;
      }
    }
    regionStart = regionEnd + 1;
  }
  return output;
}

/**
 * Bounded pitch shift followed by WSOLA duration correction. This is deliberately
 * separate from playbackRate so pitch and rate are not advertised as independent
 * when they are actually coupled by resampling.
 */
export function transformPitchAndRate(samples: Float32Array, pitchFactor: number, rateFactor: number): Float32Array {
  const pitched = resample(samples, pitchFactor);
  const safeRate = Math.max(0.7, Math.min(1.3, rateFactor));
  return wsolaStretch(pitched, Math.floor(samples.length / safeRate));
}

function stabilizeRenderedSpeech(input: Float32Array): Float32Array {
  let peak = 0;
  for (const sample of input) if (Number.isFinite(sample)) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0.92 ? 0.92 / peak : 1;
  const output = new Float32Array(input.length);
  const fade = Math.min(Math.floor(input.length / 2), Math.max(8, Math.round(SAMPLE_RATE * 0.003)));
  for (let index = 0; index < input.length; index++) {
    const scaled = (Number.isFinite(input[index]) ? input[index] : 0) * gain;
    const protectedSample = Math.abs(scaled) > 0.97 ? Math.tanh(scaled * 1.2) / Math.tanh(1.2) : scaled;
    let edge = 1;
    if (index < fade) edge = 0.5 - 0.5 * Math.cos(Math.PI * index / Math.max(1, fade));
    else if (index >= input.length - fade) edge = 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, input.length - 1 - index) / Math.max(1, fade));
    output[index] = protectedSample * edge;
  }
  return output;
}

export function processCmuVoice(samples: Float32Array, model: VoiceModelConfig): Float32Array {
  const stylePitch = model.toneStyle === 'deep' ? 0.92 : model.toneStyle === 'energetic' ? 1.06 : 1;
  const rateStyle = model.toneStyle === 'deep' ? 0.92 : model.toneStyle === 'energetic' ? 1.1 : 1;
  const voicedPitch = transformVoicedPitch(samples, SAMPLE_RATE, model.pitch * stylePitch);
  return stabilizeRenderedSpeech(applyStyle(transformPitchAndRate(voicedPitch, 1, model.rate * rateStyle), model.toneStyle));
}

export const CMU_SAMPLE_RATE = SAMPLE_RATE;
