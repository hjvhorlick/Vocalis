import { validateAlignment } from './voiceBankEngine';
import { validatePronunciations } from './voicePhonetics';
import type { SoundAlignment } from '../types/voiceBank';
import type { ReadingPrompt, RecordingProject } from '../types/recording';
import { decodeProjectWav, inspectRecording, MAX_RECORDING_SECONDS, RECORDING_SAMPLE_RATE } from './recordingAudio';

export const PROJECT_FORMAT = 'vocalis-recording-project';
export const PHRASE_VOICE_FORMAT = 'vocalis-recorded-phrase-voice';
export const MAX_ARCHIVE_BYTES = 120 * 1024 * 1024;
export const MAX_PROMPTS = 100;
const MAX_CLIP_BYTES = 44 + RECORDING_SAMPLE_RATE * MAX_RECORDING_SECONDS * 2;

type ArchiveClip = { promptId: string; recordedAt: string; wavBase64: string; alignment?: SoundAlignment };

export function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export async function exportRecordingArchive(project: RecordingProject, voiceOnly = false): Promise<Blob> {
  if (!project.permissionConfirmed) throw new Error('Confirm permission to use these recordings before exporting.');
  const prompts = voiceOnly ? project.prompts.filter(prompt => project.recordings[prompt.id]) : project.prompts;
  if (voiceOnly && !prompts.length) throw new Error('Keep at least one sentence before building a phrase voice.');
  const sourceBytes = Object.values(project.recordings).reduce((sum, recording) => sum + recording.audio.size, 0);
  if (sourceBytes * 1.34 > MAX_ARCHIVE_BYTES - 100000) throw new Error('This project is too large to export. Use smaller recording projects.');
  const recordings: ArchiveClip[] = [];
  for (const prompt of prompts) {
    const recording = project.recordings[prompt.id];
    if (recording) recordings.push({ promptId: prompt.id, recordedAt: recording.recordedAt, wavBase64: toBase64(await recording.audio.arrayBuffer()), ...(!voiceOnly && recording.alignment ? { alignment: validateAlignment(recording.alignment, recording.quality.duration) } : {}) });
  }
  return new Blob([JSON.stringify({
    format: voiceOnly ? PHRASE_VOICE_FORMAT : PROJECT_FORMAT,
    version: voiceOnly ? 1 : 2,
    pronunciations: validatePronunciations(project.pronunciations),
    synthesis: 'recorded-phrases-only',
    audio: { encoding: 'PCM_S16LE', sampleRate: RECORDING_SAMPLE_RATE, channels: 1 },
    project: { id: project.id, name: project.name, language: project.language, accent: project.accent, createdAt: project.createdAt, updatedAt: project.updatedAt },
    rights: { permissionAcknowledged: true, notice: 'Permission acknowledgement is not a license grant. Obtain speaker and recording rights separately. No third-party rights are assigned by this file.' },
    prompts, recordings,
  })], { type: 'application/json' });
}

function shortText(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error(`Invalid ${label} in this file.`);
  return value;
}

export async function importRecordingArchive(file: Blob): Promise<RecordingProject> {
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error('File is too large. The maximum is 120 MB.');
  let data: any;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('This is not a valid Vocalis project or phrase voice file.'); }
  if (!data || ![PROJECT_FORMAT, PHRASE_VOICE_FORMAT].includes(data.format) || !(data.version === 1 || (data.format === PROJECT_FORMAT && data.version === 2)) || data.synthesis !== 'recorded-phrases-only') {
    throw new Error('Unsupported format or version. Open a Vocalis .vproject or recorded-phrase .vvoice file. Sound-bank files open under Build & test.');
  }
  if (data.audio?.encoding !== 'PCM_S16LE' || data.audio?.sampleRate !== RECORDING_SAMPLE_RATE || data.audio?.channels !== 1) throw new Error('Unsupported audio specification.');
  if (!data.project || !Array.isArray(data.prompts) || !data.prompts.length || data.prompts.length > MAX_PROMPTS || !Array.isArray(data.recordings) || data.recordings.length > data.prompts.length) {
    throw new Error('Invalid project contents.');
  }
  const ids = new Set<string>();
  const prompts: ReadingPrompt[] = data.prompts.map((prompt: any) => {
    if (!prompt || typeof prompt.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(prompt.id) || Object.hasOwn(Object.prototype, prompt.id) || ids.has(prompt.id)) throw new Error('Invalid or duplicate sentence ID.');
    ids.add(prompt.id);
    return { id: prompt.id, text: shortText(prompt.text, 500, 'sentence'), category: shortText(prompt.category, 80, 'category') };
  });
  const now = new Date().toISOString();
  const project: RecordingProject = {
    id: crypto.randomUUID(), name: shortText(data.project.name, 80, 'voice name'),
    language: shortText(data.project.language, 60, 'language'),
    accent: typeof data.project.accent === 'string' ? data.project.accent.slice(0, 80) : '',
    // Never import consent as if the current user personally gave it.
    permissionConfirmed: false, createdAt: now, updatedAt: now, prompts, recordings: {}, pronunciations: validatePronunciations(data.pronunciations),
  };
  for (const clip of data.recordings) {
    if (!clip || !ids.has(clip.promptId) || Object.hasOwn(project.recordings, clip.promptId) || typeof clip.wavBase64 !== 'string' || clip.wavBase64.length > Math.ceil(MAX_CLIP_BYTES / 3) * 4) {
      throw new Error('Invalid or duplicate recording.');
    }
    let binary: string;
    try { binary = atob(clip.wavBase64); } catch { throw new Error('Corrupt recording data.'); }
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (bytes.length > MAX_CLIP_BYTES) throw new Error('A recording exceeds the 30-second limit.');
    const samples = decodeProjectWav(bytes.buffer);
    const quality = inspectRecording(samples);
    if (!quality.usable) throw new Error('This file contains an empty, silent, or too-short recording.');
    project.recordings[clip.promptId] = {
      promptId: clip.promptId, audio: new Blob([bytes], { type: 'audio/wav' }), quality,
      ...(clip.alignment !== undefined ? { alignment: validateAlignment(clip.alignment, quality.duration) } : {}),
      recordedAt: typeof clip.recordedAt === 'string' && Number.isFinite(Date.parse(clip.recordedAt)) ? clip.recordedAt : now,
    };
  }
  if (data.format === PHRASE_VOICE_FORMAT && (data.recordings.length !== prompts.length || !data.recordings.length)) throw new Error('A phrase voice must contain audio for every sentence.');
  return project;
}
