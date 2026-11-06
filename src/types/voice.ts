export interface FormantProfile {
  f1: number; // Hz (first formant - jaw opening)
  f2: number; // Hz (second formant - tongue front/back)
  f3: number; // Hz (third formant - lip/dental)
  f4: number; // Hz (fourth formant)
  b1: number; // Bandwidth 1
  b2: number; // Bandwidth 2
  b3: number; // Bandwidth 3
}

export interface AcousticVoicePersona {
  id: string;
  name: string;
  archetype: string;
  description: string;
  gender: 'Female' | 'Male' | 'Neutral' | 'Synthetic';
  
  // Physical Glottal source parameters
  basePitchHz: number;        // F0: 60Hz - 400Hz
  pitchRangeSemitones: number; // Pitch variation range
  glottalWaveform: 'sawtooth' | 'pulse' | 'sine' | 'triangle';
  glottalOpenQuotient: number; // 0.2 (pressed/tight) to 0.8 (soft/breathy)
  vocalFryJitter: number;      // 0 to 100% (creakiness / roughness)
  vibratoRateHz: number;       // 3.0 to 8.0 Hz
  vibratoDepthCents: number;   // 0 to 60 cents
  
  // Vocal Tract & Formant modeling
  tractLengthScale: number;    // 0.7x (child/sprite) to 1.3x (giant/bass)
  warmth: number;              // 0 to 100% (low-end chest resonance)
  customFormants?: FormantProfile;
  nasalResonance: number;      // 0 to 100%
  breathinessNoise: number;    // 0 to 100% (aspiration turbulence)
  
  // Pacing & Inflection
  cadenceSpeed: number;        // 0.6x to 1.6x
  intonationStyle: 'natural' | 'question' | 'emphatic' | 'monotone' | 'melodic';
  
  // Acoustic FX Filter
  fxMode: 'clean' | 'radio' | 'telephone' | 'robot' | 'cathedral';
  reverbDecay: number;         // 0 to 100%
  
  samplePhrase: string;
  color: string;
  isCustom?: boolean;
}

export interface PhonemeDef {
  symbol: string;
  ipa: string;
  type: 'vowel' | 'consonant_voiced' | 'consonant_unvoiced';
  f1: number;
  f2: number;
  f3: number;
  noiseAmount: number;
  baseDurationMs: number;
}

export interface GeneratedTake {
  id: string;
  title: string;
  audioUrl: string;
  voiceName: string;
  durationSeconds: number;
  createdAt: number;
  textSnippet: string;
}

export interface DialogueBeat {
  id: string;
  speakerId: string;
  speakerName: string;
  text: string;
  intonation: 'natural' | 'question' | 'emphatic' | 'monotone';
}
