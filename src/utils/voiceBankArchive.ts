import type { VoiceBank, VoiceUnit } from '../types/voiceBank';
import { decodeProjectWav, RECORDING_SAMPLE_RATE } from './recordingAudio';
import { MAX_BANK_BYTES, MAX_UNITS } from './voiceBankEngine';
import { MAX_ARCHIVE_BYTES, toBase64 } from './recordingArchive';
import { validPhone, validatePronunciations } from './voicePhonetics';

export const UNIT_VOICE_FORMAT = 'vocalis-unit-voice';
async function checksum(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function exportVoiceBank(bank: VoiceBank): Promise<Blob> {
  const buffer = await bank.audio.arrayBuffer();
  if (buffer.byteLength > MAX_BANK_BYTES) throw new Error('Voice bank exceeds the 60 MiB audio limit.');
  return new Blob([JSON.stringify({
    format: UNIT_VOICE_FORMAT, version: 1, method: bank.method,
    speaker: { name: bank.name, language: bank.language, accent: bank.accent },
    createdAt: bank.createdAt, exampleText: bank.exampleText,
    audio: { sampleRate: RECORDING_SAMPLE_RATE, channels: 1, encoding: 'PCM_S16LE', sha256: await checksum(buffer), wavBase64: toBase64(buffer) },
    units: bank.units, pronunciations: bank.pronunciations, notices: bank.notices,
  })], { type: 'application/json' });
}

export async function importVoiceBank(file: Blob): Promise<VoiceBank> {
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error('Voice file exceeds 120 MiB.');
  let data: any;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('Invalid sound-bank JSON.'); }
  if (!data || data.format !== UNIT_VOICE_FORMAT || data.version !== 1 || data.method !== 'manual-phoneme-units-v1') throw new Error('Expected a Vocalis v1 sound-bank .vvoice file. Phrase packs open in the recording project toolbar.');
  if (!data.speaker || typeof data.speaker.name !== 'string' || !data.speaker.name.trim() || data.speaker.name.length > 80 || typeof data.speaker.language !== 'string' || !/^english\b/i.test(data.speaker.language) || data.speaker.language.length > 60 || typeof data.speaker.accent !== 'string' || data.speaker.accent.length > 80) throw new Error('Invalid speaker metadata. This sound-bank version supports English only.');
  if (!data.audio || data.audio.sampleRate !== RECORDING_SAMPLE_RATE || data.audio.channels !== 1 || data.audio.encoding !== 'PCM_S16LE' || typeof data.audio.wavBase64 !== 'string' || data.audio.wavBase64.length > Math.ceil(MAX_BANK_BYTES / 3) * 4 || !/^[a-f0-9]{64}$/.test(data.audio.sha256)) throw new Error('Invalid voice audio specification.');
  let bytes: Uint8Array<ArrayBuffer>;
  try { bytes = Uint8Array.from(atob(data.audio.wavBase64), char => char.charCodeAt(0)); } catch { throw new Error('Invalid voice audio encoding.'); }
  if (bytes.byteLength > MAX_BANK_BYTES) throw new Error('Voice audio exceeds 60 MiB.');
  if (await checksum(bytes.buffer) !== data.audio.sha256) throw new Error('Voice audio checksum failed. This file is damaged or was modified.');
  const samples = decodeProjectWav(bytes.buffer);
  if (!Array.isArray(data.units) || !data.units.length || data.units.length > MAX_UNITS) throw new Error('Invalid voice unit index.');
  const units: VoiceUnit[] = data.units.map((unit: any) => {
    if (!unit || !Array.isArray(unit.phones) || !unit.phones.length || unit.phones.length > 3 || !unit.phones.every(validPhone) || !Number.isSafeInteger(unit.offset) || !Number.isSafeInteger(unit.length) || unit.offset < 0 || unit.length < 350 || unit.length > RECORDING_SAMPLE_RATE * 6.1 || unit.offset + unit.length > samples.length || typeof unit.sourcePromptId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(unit.sourcePromptId)) throw new Error('A voice unit has invalid labels or out-of-range audio offsets.');
    return { phones: [...unit.phones], offset: unit.offset, length: unit.length, sourcePromptId: unit.sourcePromptId };
  });
  const variants = new Map<string, number>();
  for (const unit of units) { const key = unit.phones.join('|'); const count = (variants.get(key) || 0) + 1; if (count > 8) throw new Error('Too many candidates for one sound sequence.'); variants.set(key, count); }
  if (!Array.isArray(data.notices) || !data.notices.length || data.notices.length > 20 || !data.notices.every((notice: unknown) => typeof notice === 'string' && notice.length <= 20000)) throw new Error('Missing or invalid rights notices.');
  return {
    id: crypto.randomUUID(), name: data.speaker.name, language: data.speaker.language, accent: data.speaker.accent,
    createdAt: new Date().toISOString(), exampleText: typeof data.exampleText === 'string' ? data.exampleText.slice(0, 500) : undefined, audio: new Blob([bytes], { type: 'audio/wav' }), units,
    pronunciations: validatePronunciations(data.pronunciations), notices: data.notices, method: 'manual-phoneme-units-v1',
  };
}
