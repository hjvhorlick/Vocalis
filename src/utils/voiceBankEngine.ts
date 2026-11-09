import type { RecordingProject } from '../types/recording';
import type { SoundAlignment, SoundSegment, VoiceBank, VoiceRender, VoiceUnit } from '../types/voiceBank';
import { decodeProjectWav, encodeMonoWav, RECORDING_SAMPLE_RATE as RATE } from './recordingAudio';
import { PHONES, validPhone, PronouncedWord, pronounceText, validatePronunciations } from './voicePhonetics';
import { DICTIONARY_NOTICE } from './dictionaryNotice';

export const MAX_BANK_BYTES = 60 * 1024 * 1024;
export const MAX_UNITS = 6000;

export function validateAlignment(value: unknown, duration: number): SoundAlignment {
  const alignment = value as SoundAlignment;
  if (!alignment || typeof alignment.reviewed !== 'boolean' || !Array.isArray(alignment.segments) || !alignment.segments.length || alignment.segments.length > 300) throw new Error('An alignment must have between 1 and 300 sound segments.');
  let end = 0;
  const segments = alignment.segments.map((segment: SoundSegment) => {
    if (!segment || (!validPhone(segment.phone) && segment.phone !== 'SIL') || !Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0 || segment.start < end - 0.00001 || segment.end > duration + 0.00001 || segment.end - segment.start < 0.0149 || (segment.phone !== 'SIL' && segment.end - segment.start > 2)) throw new Error('Check sound boundaries: no overlaps, 15 ms–2 seconds per sound, all within the recording. SIL may be longer.');
    end = segment.end;
    return { phone: segment.phone, start: segment.start, end: segment.end };
  });
  return { reviewed: alignment.reviewed, segments };
}

export function seedAlignment(phones: string[], duration: number): SoundAlignment {
  // A spacing aid, NOT forced alignment or speech recognition. Review is mandatory.
  return { reviewed: false, segments: phones.map((phone, i) => ({ phone, start: i * duration / phones.length, end: (i + 1) * duration / phones.length })) };
}

export async function buildVoiceBank(project: RecordingProject): Promise<VoiceBank> {
  if (!project.permissionConfirmed) throw new Error('Confirm permission to build a voice from these recordings.');
  if (!/^english\b/i.test(project.language)) throw new Error('Sound-bank synthesis currently supports English phonemes only. Phrase recording still supports other languages.');
  const candidates = new Map<string, { unit: Omit<VoiceUnit, 'offset' | 'length'>; audio: Float32Array; score: number }[]>();
  let reviewed = 0;
  for (const prompt of project.prompts) {
    const recording = project.recordings[prompt.id];
    if (!recording?.alignment?.reviewed) continue;
    const audio = decodeProjectWav(await recording.audio.arrayBuffer());
    const { segments } = validateAlignment(recording.alignment, audio.length / RATE);
    reviewed++;
    for (let i = 0; i < segments.length; i++) {
      for (let length = 1; length <= 3 && i + length <= segments.length; length++) {
        const span = segments.slice(i, i + length);
        if (span.some(segment => segment.phone === 'SIL') || span.some((segment, j) => j > 0 && segment.start - span[j - 1].end > 0.035)) break;
        const samples = audio.slice(Math.round(span[0].start * RATE), Math.round(span.at(-1)!.end * RATE));
        let energy = 0, clipped = 0;
        for (const sample of samples) { energy += sample * sample; if (Math.abs(sample) > 0.99) clipped++; }
        const rms = Math.sqrt(energy / Math.max(1, samples.length));
        if (rms < 0.001) continue;
        const phones = span.map(segment => segment.phone);
        const score = clipped / samples.length * 10 + Math.abs(Math.log(samples.length / RATE / (0.12 * length))) * 0.05;
        const key = phones.join('|');
        const list = candidates.get(key) || [];
        list.push({ unit: { phones, sourcePromptId: prompt.id }, audio: samples, score });
        list.sort((a, b) => a.score - b.score);
        candidates.set(key, list.slice(0, 8));
      }
    }
  }
  if (!reviewed) throw new Error('Mark and review the sound boundaries of at least one recording first.');
  const all = [...candidates.values()].flat();
  if (!all.length) throw new Error('No usable sound units found. Check your labels and recording levels.');
  const size = all.reduce((sum, item) => sum + item.audio.length, 0);
  if (all.length > MAX_UNITS || size * 2 + 44 > MAX_BANK_BYTES) throw new Error('This sound bank is too large. Build a smaller project (up to 6,000 units and 60 MiB of audio).');
  const audio = new Float32Array(size);
  let offset = 0;
  const units = all.map(item => {
    const unit = { ...item.unit, offset, length: item.audio.length };
    audio.set(item.audio, offset); offset += item.audio.length;
    return unit;
  });
  return {
    id: crypto.randomUUID(), name: project.name, language: project.language, accent: project.accent,
    createdAt: new Date().toISOString(), exampleText: project.prompts.find(prompt => project.recordings[prompt.id]?.alignment?.reviewed)?.text, audio: encodeMonoWav(audio), units,
    pronunciations: validatePronunciations(project.pronunciations), method: 'manual-phoneme-units-v1',
    notices: [DICTIONARY_NOTICE, 'Speaker and recording rights remain with their respective owners. A permission acknowledgement is not a transferable license.'],
  };
}

export function bankCoverage(bank: VoiceBank) {
  const present = new Set(bank.units.filter(unit => unit.phones.length === 1).map(unit => unit.phones[0]));
  return { present: PHONES.filter(phone => present.has(phone)), missing: PHONES.filter(phone => !present.has(phone)), units: bank.units.length };
}

function joinCost(a: VoiceUnit | null, b: VoiceUnit, samples: Float32Array): number {
  if (!a) return 0;
  const width = Math.min(96, a.length, b.length);
  let left = 0, right = 0, difference = 0;
  for (let i = 0; i < width; i++) {
    const x = samples[a.offset + a.length - width + i], y = samples[b.offset + i];
    left += x * x; right += y * y; difference += Math.abs(x - y);
  }
  return difference / width + Math.abs(Math.sqrt(left / width) - Math.sqrt(right / width));
}

/** Deterministic beam search over 1–3 phone units. No trained scoring model. */
export function selectVoiceUnits(phones: string[], bank: VoiceBank, samples: Float32Array): VoiceUnit[] {
  if (!phones.length) return [];
  const lookup = new Map<string, VoiceUnit[]>();
  for (const unit of bank.units) {
    const key = unit.phones.join('|');
    const entries = lookup.get(key) || []; entries.push(unit); lookup.set(key, entries);
  }
  type Path = { cost: number; units: VoiceUnit[] };
  const states: Path[][] = Array.from({ length: phones.length + 1 }, () => []);
  states[0] = [{ cost: 0, units: [] }];
  for (let i = 0; i < phones.length; i++) {
    states[i].sort((a, b) => a.cost - b.cost);
    for (const path of states[i].slice(0, 12)) {
      for (let length = 1; length <= 3 && i + length <= phones.length; length++) {
        const options = lookup.get(phones.slice(i, i + length).join('|')) || [];
        for (const unit of options.slice(0, 8)) {
          const next = { cost: path.cost + 0.12 + joinCost(path.units.at(-1) || null, unit, samples) + Math.abs(unit.length / RATE - 0.12 * length) * 0.02, units: [...path.units, unit] };
          const list = states[i + length]; list.push(next);
          if (list.length > 48) { list.sort((a, b) => a.cost - b.cost); list.length = 12; }
        }
      }
    }
  }
  const best = states[phones.length].sort((a, b) => a.cost - b.cost)[0];
  if (!best) throw new Error(`This bank cannot cover: ${phones.join(' ')}. Record and label the missing sounds first.`);
  return best.units;
}

export function joinSoundChunks(chunks: Float32Array[], overlap = 120): Float32Array {
  const output = new Float32Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let cursor = 0;
  for (const chunk of chunks) {
    const blend = Math.min(overlap, cursor, Math.floor(chunk.length / 2));
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

export async function renderBankWords(words: PronouncedWord[], bank: VoiceBank): Promise<VoiceRender> {
  if (!words.length || words.length > 250) throw new Error('Use a short test sentence (at most 250 words).');
  if (words.some(word => !word.phones.length || !word.phones.every(validPhone))) throw new Error('Cannot render a word without a valid pronunciation.');
  const source = decodeProjectWav(await bank.audio.arrayBuffer());
  const coverage = bankCoverage(bank);
  const missing = [...new Set(words.flatMap(word => word.phones).filter(phone => !coverage.present.includes(phone)))];
  if (missing.length) throw new Error(`Missing sounds: ${missing.join(', ')}. No other speaker will be substituted. Record and label these sounds, then rebuild.`);
  const pieces: Float32Array[] = [], wordTimings: VoiceRender['wordTimings'] = [];
  let count = 0, selectedUnits = 0;
  for (const word of words) {
    const selected = selectVoiceUnits(word.phones, bank, source);
    const audio = joinSoundChunks(selected.map(unit => source.subarray(unit.offset, unit.offset + unit.length)));
    const start = count / RATE;
    // Small edge fades prevent clicks without pretending to reconstruct natural prosody.
    for (let i = 0; i < Math.min(48, audio.length / 2); i++) { audio[i] *= i / 48; audio[audio.length - 1 - i] *= i / 48; }
    pieces.push(audio); count += audio.length; selectedUnits += selected.length;
    wordTimings.push({ charIndex: word.start, charLength: word.end - word.start, start, end: count / RATE });
    const pause = new Float32Array(Math.round(RATE * word.pause)); pieces.push(pause); count += pause.length;
    if (count > RATE * 120) throw new Error('Rendered speech exceeds two minutes. Use shorter text.');
  }
  const output = new Float32Array(count);
  let offset = 0;
  for (const piece of pieces) { output.set(piece, offset); offset += piece.length; }
  return { audio: encodeMonoWav(output), duration: count / RATE, wordTimings, selectedUnits };
}

export async function renderVoiceBank(text: string, bank: VoiceBank): Promise<VoiceRender> {
  const { words, unknown } = await pronounceText(text, bank.pronunciations);
  if (unknown.length) throw new Error(`Unknown pronunciation: ${unknown.join(', ')}. Add a pronunciation in Build & test, then rebuild the bank.`);
  return renderBankWords(words, bank);
}
