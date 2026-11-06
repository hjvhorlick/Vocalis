export interface NoteInfo {
  name: string;        // e.g. "C", "C#", "D"
  fullName: string;    // e.g. "C4", "A#3"
  octave: number;      // e.g. 4
  midi: number;        // e.g. 60
  frequency: number;   // e.g. 261.63
}

export interface PitchDetectionResult {
  frequency: number;       // in Hz (0 if unvoiced/silent)
  clarity: number;         // 0 to 1 confidence
  volume: number;          // RMS 0 to 1
  volumeDb: number;        // dB relative to max
  note: NoteInfo | null;
  cents: number;           // -50 to +50 cents deviation from exact note
  isInTune: boolean;       // within ±10 cents
  vibratoRate?: number;    // Hz (typically 4.5-6.5)
  vibratoDepth?: number;   // cents
}

export interface VoiceClassification {
  type: 'Bass' | 'Baritone' | 'Tenor' | 'Contralto' | 'Mezzo-Soprano' | 'Soprano';
  lowNote: string;
  highNote: string;
  lowMidi: number;
  highMidi: number;
  description: string;
  color: string;
}

export interface ScaleExercise {
  id: string;
  name: string;
  description: string;
  category: 'beginner' | 'intermediate' | 'advanced';
  intervals: number[];     // Semitone offsets from root: e.g. [0, 2, 4, 5, 7, 5, 4, 2, 0] for 5-tone
  durations: number[];     // Relative duration multipliers (e.g. 1, 1, 1, 2)
  syllables: string[];     // Suggested syllables: e.g. ["Yah", "Yah", "Yah", ...]
}

export interface VocalRangeData {
  lowestNote: NoteInfo | null;
  highestNote: NoteInfo | null;
  rangeSemitones: number;
  classification: VoiceClassification | null;
  testedAt: number;
}

export interface StabilitySessionResult {
  targetNote: string;
  targetFreq: number;
  durationSeconds: number;
  pitchAccuracyScore: number;  // 0 - 100%
  stabilityJitterCents: number; // average variation in cents
  vibratoRateHz: number;
}
