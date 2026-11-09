import type { Pronunciations } from '../utils/voicePhonetics';

export interface SoundSegment { phone: string; start: number; end: number }
export interface SoundAlignment { segments: SoundSegment[]; reviewed: boolean }
export interface VoiceUnit {
  phones: string[];
  offset: number; // Sample offset into canonical WAV payload, not byte offset.
  length: number;
  sourcePromptId: string;
}
export interface VoiceBank {
  id: string;
  name: string;
  language: string;
  accent: string;
  createdAt: string;
  exampleText?: string;
  audio: Blob;
  units: VoiceUnit[];
  pronunciations: Pronunciations;
  notices: string[];
  method: 'manual-phoneme-units-v1';
}
export interface VoiceRender {
  audio: Blob;
  duration: number;
  wordTimings: { charIndex: number; charLength: number; start: number; end: number }[];
  selectedUnits: number;
}
