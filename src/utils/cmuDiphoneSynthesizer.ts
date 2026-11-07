import type { VoiceModelConfig } from './naturalVoiceEngine';

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

export function speakerForModel(model: VoiceModelConfig): 'slt' | 'bdl' {
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
    const manifest = await manifestResponse.json() as DiphoneManifest;
    const buffer = await audioResponse.arrayBuffer();
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
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0) - overlap * (chunks.length - 1);
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
  return output;
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

  try {
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
  } catch {
    // If local corpus files are missing or fail integrity checks, retain a
    // deterministic formant fallback rather than calling a remote service.
    for (const phone of phones) {
      const chunk = fallbackPhone(phone, cursor);
      chunks.push(chunk);
      cursor += chunk.length;
      fallbackDiphones++;
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

export function processCmuVoice(samples: Float32Array, model: VoiceModelConfig): Float32Array {
  const stylePitch = model.toneStyle === 'deep' ? 0.92 : model.toneStyle === 'energetic' ? 1.06 : 1;
  const pitch = resample(samples, model.pitch * stylePitch);
  const rateStyle = model.toneStyle === 'deep' ? 0.92 : model.toneStyle === 'energetic' ? 1.1 : 1;
  const stretch = wsolaStretch(pitch, Math.floor(pitch.length / Math.max(0.55, model.rate * rateStyle)));
  return applyStyle(stretch, model.toneStyle);
}

export const CMU_SAMPLE_RATE = SAMPLE_RATE;
