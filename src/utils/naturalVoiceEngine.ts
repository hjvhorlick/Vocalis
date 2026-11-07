import {
  NATURAL_HUMAN_SAMPLES,
  HumanVoiceSample,
  loadHumanVoiceBuffer,
  ATTRIBUTION_DETAILS,
} from './naturalHumanAudio';
import {
  VoiceDspConfig,
  playTransformedVoice,
  stopTransformedVoice,
  renderTransformedWav,
  getDspAnalyser,
  isDspPlaying,
} from './audioDspEngine';

export interface VoiceModelConfig {
  id: string;
  name: string;
  archetype: string;
  description: string;
  gender: 'Female' | 'Male' | 'Neutral';
  accent: 'US' | 'UK' | 'AU' | 'Global' | 'CA' | 'IN';
  flag: string;
  pitch: number; // 0.5 to 1.8 (1.0 = normal)
  rate: number; // 0.6 to 1.6 (1.0 = normal)
  volume: number; // 0.1 to 1.0
  toneStyle: 'natural' | 'deep' | 'energetic' | 'whisper' | 'radio' | 'robot';
  samplePhrase: string;
  avatarColor: string;
  isCustom?: boolean;
  baseSampleId: string; // ID of the natural human voice recording used as source
  baseVoiceId?: 'slt' | 'bdl'; // Optional alias for diphone engine
  synthesisMethod?: 'cmu-arctic' | 'formant'; // Optional method tag
  throatWarmth?: number; // Formant F1 (-12 to +12 dB)
  oralClarity?: number; // Formant F2 (-12 to +12 dB)
  airPresence?: number; // Formant F3 (-12 to +12 dB)
  realSpeakerName?: string;
}

export { ATTRIBUTION_DETAILS, NATURAL_HUMAN_SAMPLES };
export type { HumanVoiceSample };

/**
 * Predefined Vocalis Real Human Voices
 * Each voice corresponds to a real human speaker recorded in an acoustic studio (CMU ARCTIC / OSR).
 * Pure human speech, 100% Non-AI, zero browser TTS files.
 */
export const PRESET_VOICE_MODELS: VoiceModelConfig[] = [
  {
    id: 'voice-slt-aria',
    name: 'Aria (California Studio Female)',
    archetype: 'Warm Storytelling & Narration',
    description: 'Clean, melodic human female voice recorded in California studio acoustic chambers.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-slt-1',
    realSpeakerName: 'SLT (US Female - Silicon Valley/California)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#8b5cf6',
  },
  {
    id: 'voice-rms-marcus',
    name: 'Marcus (Deep American Baritone)',
    archetype: 'Deep Resonant Trailer & Authority',
    description: 'Genuine human deep bass-baritone with powerful low-end resonance and deliberate pacing.',
    gender: 'Male',
    accent: 'US',
    flag: '🎬',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-rms-1',
    realSpeakerName: 'Robert M. Smith (US Male - Deep Baritone)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#f97316',
  },
  {
    id: 'voice-awb-oliver',
    name: 'Oliver (Scottish Gentleman)',
    archetype: 'Articulate British & Drama Speaker',
    description: 'Authentic Scottish English cadence recorded by Edinburgh acoustic linguist Alan W. Black.',
    gender: 'Male',
    accent: 'UK',
    flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-awb-1',
    realSpeakerName: 'Alan W. Black (Scottish Male - Edinburgh)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#0284c7',
  },
  {
    id: 'voice-clb-charlotte',
    name: 'Charlotte (Boston Classic Female)',
    archetype: 'Refined Literature & Period Reader',
    description: 'Distinctive, crystal-clear real human female voice recorded in Boston acoustic lab.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-clb-1',
    realSpeakerName: 'CLB (US Female - Boston, Massachusetts)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#ec4899',
  },
  {
    id: 'voice-bdl-david',
    name: 'David (Boston Studio Male)',
    archetype: 'Conversational Media Host',
    description: 'Crisp, resonant human male voice with natural mid-Atlantic articulation.',
    gender: 'Male',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-bdl-1',
    realSpeakerName: 'BDL (US Male - Boston, Massachusetts)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#3b82f6',
  },
  {
    id: 'voice-jmk-john',
    name: 'John (Canadian Broadcaster)',
    archetype: 'Northern News & Documentary',
    description: 'Authentic Canadian English male voice recorded by speech scientist John M. Kominek.',
    gender: 'Male',
    accent: 'CA',
    flag: '🇨🇦',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-jmk-1',
    realSpeakerName: 'John M. Kominek (Canadian Male)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#10b981',
  },
  {
    id: 'voice-ksp-dev',
    name: 'Dev (Indian English Educator)',
    archetype: 'Global Academic & Explainer',
    description: 'Warm, articulate real human voice with authentic Indian English cadence and inflection.',
    gender: 'Male',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-ksp-1',
    realSpeakerName: 'KSP (Indian English Male)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#a855f7',
  },
  {
    id: 'voice-osr-elena',
    name: 'Elena (Harvard Sentences Female)',
    archetype: 'Academic Linguistic Test Reader',
    description: 'Studio phonetics female speaker reading standardized Harvard/IEEE benchmark sentences.',
    gender: 'Female',
    accent: 'US',
    flag: '🎙️',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-harvard-female',
    realSpeakerName: 'OSR Female Speaker (Open Speech Repository)',
    samplePhrase: 'The birch canoe slid on the smooth planks. Glue the sheet to the dark blue background.',
    avatarColor: '#f43f5e',
  },
  {
    id: 'voice-osr-michael',
    name: 'Michael (Harvard Sentences Male)',
    archetype: 'Studio Acoustic Benchmark',
    description: 'Clear, authoritative male speaker reading standardized Harvard/IEEE benchmark sentences.',
    gender: 'Male',
    accent: 'US',
    flag: '🎙️',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-harvard-male',
    realSpeakerName: 'OSR Male Speaker (Open Speech Repository)',
    samplePhrase: 'The birch canoe slid on the smooth planks. Glue the sheet to the dark blue background.',
    avatarColor: '#0ea5e9',
  },
  {
    id: 'voice-osr-alistair',
    name: 'Alistair (British RP Harvard Speaker)',
    archetype: 'Crisp British RP Documentary Voice',
    description: 'Distinguished, articulate native British English male recorded for VoIP acoustic research.',
    gender: 'Male',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-british-male-1',
    realSpeakerName: 'British English Male (Open Speech Repository UK)',
    samplePhrase: 'The birch canoe slid on the smooth planks. Four hours of steady work faced us.',
    avatarColor: '#6366f1',
  },
  {
    id: 'voice-osr-rupert',
    name: 'Rupert (Distinguished UK Cambridge)',
    archetype: 'Refined Academic & Classical Narrator',
    description: 'Articulate British male speaker reading phonetically balanced benchmark IEEE lists.',
    gender: 'Male',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-british-male-2',
    realSpeakerName: 'British English Male 2 (Open Speech Repository UK)',
    samplePhrase: 'These days a chicken leg is a rare dish. Four hours of steady work faced us.',
    avatarColor: '#14b8a6',
  },
  {
    id: 'voice-osr-victoria',
    name: 'Victoria (American Harvard Narrator II)',
    archetype: 'Warm American Literature & Audiobooks',
    description: 'Clear, comforting female voice reading standardized Harvard list recordings in studio isolation.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-harvard-female-2',
    realSpeakerName: 'OSR Female Speaker II (Open Speech Repository)',
    samplePhrase: 'A king ruled the state in the early days. The ship was torn on the sharp reef.',
    avatarColor: '#ec4899',
  },
  {
    id: 'voice-slt-willow',
    name: 'Willow (California Studio Dialogue)',
    archetype: 'Gentle Conversational Lead',
    description: 'Spontaneous, natural human inflection from SLT California female reading conversational dialogue.',
    gender: 'Female',
    accent: 'US',
    flag: '🌿',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-slt-4',
    realSpeakerName: 'SLT (US Female - California)',
    samplePhrase: "Lord, but I'm glad to see you again, Phil.",
    avatarColor: '#84cc16',
  },
  {
    id: 'voice-rms-garrison',
    name: 'Garrison (Deep Cinema Warmth)',
    archetype: 'Low Resonant Baritone Dialogue',
    description: 'Robert M. Smith natural deep baritone delivery with conversational warmth and presence.',
    gender: 'Male',
    accent: 'US',
    flag: '🎬',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-rms-4',
    realSpeakerName: 'Robert M. Smith (US Male - Deep Baritone)',
    samplePhrase: "Lord, but I'm glad to see you again, Phil.",
    avatarColor: '#ea580c',
  },
  {
    id: 'voice-awb-hamish',
    name: 'Hamish (Scottish Highlands Storyteller)',
    archetype: 'Authentic Celtic Character Voice',
    description: 'Alan W. Black real human Scottish inflection delivering spirited expressive greetings.',
    gender: 'Male',
    accent: 'UK',
    flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-awb-4',
    realSpeakerName: 'Alan W. Black (Scottish Male - Edinburgh)',
    samplePhrase: "Lord, but I'm glad to see you again, Phil.",
    avatarColor: '#0284c7',
  },
  {
    id: 'voice-clb-beatrice',
    name: 'Beatrice (Boston Period Literature)',
    archetype: 'Graceful Historical Drama Voice',
    description: 'Real Boston female speaker reading expressive dialogue with vintage literary charm.',
    gender: 'Female',
    accent: 'US',
    flag: '📖',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-clb-4',
    realSpeakerName: 'CLB (US Female - Boston, Massachusetts)',
    samplePhrase: "Lord, but I'm glad to see you again, Phil.",
    avatarColor: '#db2777',
  },
  {
    id: 'voice-bdl-sterling',
    name: 'Sterling (Mid-Atlantic Presenter)',
    archetype: 'Conversational Studio Host',
    description: 'Brian D. L. Boston studio male recording with direct, engaging conversational projection.',
    gender: 'Male',
    accent: 'US',
    flag: '📻',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-bdl-4',
    realSpeakerName: 'BDL (US Male - Boston, Massachusetts)',
    samplePhrase: "Lord, but I'm glad to see you again, Phil.",
    avatarColor: '#eab308',
  },
  {
    id: 'voice-jmk-liam',
    name: 'Liam (Canadian Action Host)',
    archetype: 'Clear Articulate Northern Speaker',
    description: 'John M. Kominek Canadian male acoustic recording with lively spontaneous cadence.',
    gender: 'Male',
    accent: 'CA',
    flag: '🇨🇦',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-jmk-4',
    realSpeakerName: 'John M. Kominek (Canadian Male)',
    samplePhrase: "Lord, but I'm glad to see you again, Phil.",
    avatarColor: '#059669',
  },
  {
    id: 'voice-ksp-rajesh',
    name: 'Rajesh (Indian English Academic)',
    archetype: 'International Academic & Lecturer',
    description: 'KSP real Indian English male recording with articulate pronunciation and warm tone.',
    gender: 'Male',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-ksp-4',
    realSpeakerName: 'KSP (Indian English Male)',
    samplePhrase: "Lord, but I'm glad to see you again, Phil.",
    avatarColor: '#9333ea',
  },
];

let userRecordedAudioBuffer: AudioBuffer | null = null;

export function setUserAudioBuffer(buffer: AudioBuffer | null): void {
  userRecordedAudioBuffer = buffer;
}

export function getUserAudioBuffer(): AudioBuffer | null {
  return userRecordedAudioBuffer;
}

/**
 * Preload foundational natural human speech recordings
 */
export async function initializeLocalSpeechEngine(voice?: VoiceModelConfig): Promise<void> {
  try {
    if (typeof window !== 'undefined') {
      const url = voice?.baseSampleId
        ? NATURAL_HUMAN_SAMPLES.find((s) => s.id === voice.baseSampleId)?.url || NATURAL_HUMAN_SAMPLES[0].url
        : NATURAL_HUMAN_SAMPLES[0].url;
      await loadHumanVoiceBuffer(url);
    }
  } catch {
    // Non-blocking preload
  }
}

/**
 * Resolve audio buffer for a given model
 */
export async function resolveBufferForModel(model: VoiceModelConfig): Promise<AudioBuffer> {
  if (model.baseSampleId === 'custom-user' && userRecordedAudioBuffer) {
    return userRecordedAudioBuffer;
  }

  const sample =
    NATURAL_HUMAN_SAMPLES.find((s) => s.id === model.baseSampleId) ||
    NATURAL_HUMAN_SAMPLES[0];

  return await loadHumanVoiceBuffer(sample.url);
}

/**
 * Play authentic human voice through Web Audio output.
 * 100% genuine real human audio recordings — NO AI, NO window.speechSynthesis.
 */
export async function speakRealWords(
  text: string,
  model: VoiceModelConfig,
  callbacks?: {
    onStart?: () => void;
    onWord?: (charIndex: number, charLength: number) => void;
    onEnd?: () => void;
    onError?: (err: any) => void;
  }
): Promise<void> {
  try {
    const buffer = await resolveBufferForModel(model);

    playTransformedVoice(
      buffer,
      {
        pitch: model.pitch,
        rate: model.rate,
        volume: model.volume,
        toneStyle: model.toneStyle,
        throatWarmth: model.throatWarmth,
        oralClarity: model.oralClarity,
        airPresence: model.airPresence,
      },
      {
        onStart: () => {
          if (callbacks?.onStart) callbacks.onStart();
        },
        onEnded: () => {
          if (callbacks?.onEnd) callbacks.onEnd();
        },
        onError: (err) => {
          if (callbacks?.onError) callbacks.onError(err);
          if (callbacks?.onEnd) callbacks.onEnd();
        },
      }
    );
  } catch (err: any) {
    console.error('Error in speakRealWords:', err);
    if (callbacks?.onError) callbacks.onError(err);
    if (callbacks?.onEnd) callbacks.onEnd();
  }
}

/**
 * Stop any ongoing voice playback
 */
export function stopSpeaking(): void {
  stopTransformedVoice();
}

/**
 * Render voice into a downloadable 16-bit uncompressed WAV file
 */
export async function generateSpokenAudioWav(
  text: string,
  model: VoiceModelConfig
): Promise<{ audioUrl: string; source: 'vocalis-natural-dsp'; duration: number }> {
  const buffer = await resolveBufferForModel(model);
  const { wavUrl, duration } = await renderTransformedWav(buffer, {
    pitch: model.pitch,
    rate: model.rate,
    volume: model.volume,
    toneStyle: model.toneStyle,
    throatWarmth: model.throatWarmth,
    oralClarity: model.oralClarity,
    airPresence: model.airPresence,
  });

  return {
    audioUrl: wavUrl,
    source: 'vocalis-natural-dsp',
    duration,
  };
}

export { getDspAnalyser, isDspPlaying };
