import type { SoundAlignment } from './voiceBank';
import type { Pronunciations } from '../utils/voicePhonetics';

export interface ReadingPrompt {
  id: string;
  text: string;
  category: string;
}

export interface RecordingQuality {
  duration: number;
  peak: number;
  rms: number;
  clippedFraction: number;
  warnings: string[];
  usable: boolean;
}

export interface RecordedSentence {
  promptId: string;
  audio: Blob;
  quality: RecordingQuality;
  recordedAt: string;
  alignment?: SoundAlignment;
}

export interface RecordingProject {
  id: string;
  name: string;
  language: string;
  accent: string;
  permissionConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
  prompts: ReadingPrompt[];
  recordings: Record<string, RecordedSentence>;
  pronunciations?: Pronunciations;
}
