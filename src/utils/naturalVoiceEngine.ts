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

/**
 * Preloads the foundational natural human speech recordings
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

export interface VoiceModelConfig {
  id: string;
  name: string;
  archetype: string;
  description: string;
  gender: 'Female' | 'Male' | 'Neutral';
  accent: 'US' | 'UK' | 'AU' | 'Global';
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
}

export { ATTRIBUTION_DETAILS, NATURAL_HUMAN_SAMPLES };
export type { HumanVoiceSample };

/**
 * Predefined Vocalis Voice Conversions
 * All voices are shaped from tested, free, attributed natural human voice recordings (CMU ARCTIC)
 * using real-time Web Audio DSP (pitch transposition, formant vocal tract filters, and acoustic styling).
 */
export const PRESET_VOICE_MODELS: VoiceModelConfig[] = [
  {
    id: 'narrator-aria',
    name: 'Aria (Storyteller)',
    archetype: 'Warm Audiobook & Documentary Narrator',
    description: 'Melodic storytelling voice with smooth cadence and comforting acoustic warmth.',
    gender: 'Female',
    accent: 'US',
    flag: '🎙️',
    pitch: 1.0,
    rate: 0.95,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-slt-1',
    throatWarmth: 3,
    oralClarity: 2,
    airPresence: 1,
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#8b5cf6',
  },
  {
    id: 'titan-marcus',
    name: 'Marcus (Deep Cinema)',
    archetype: 'Deep Trailer & Authority Baritone',
    description: 'Resonant, authoritative deep bass-baritone with powerful low-end chest resonance.',
    gender: 'Male',
    accent: 'US',
    flag: '🎬',
    pitch: 0.72,
    rate: 0.9,
    volume: 1.0,
    toneStyle: 'deep',
    baseSampleId: 'cmu-bdl-1',
    throatWarmth: 7,
    oralClarity: -1,
    airPresence: -2,
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#f97316',
  },
  {
    id: 'oliver-british',
    name: 'Oliver (Distinguished Baritone)',
    archetype: 'Crisp Scholarly & Drama Voice',
    description: 'Distinguished, articulate acoustic presence with focused throat resonance.',
    gender: 'Male',
    accent: 'UK',
    flag: '🎩',
    pitch: 0.88,
    rate: 0.96,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-bdl-2',
    throatWarmth: 4,
    oralClarity: 2,
    airPresence: 1,
    samplePhrase: 'For the twentieth time that evening the two men shook hands.',
    avatarColor: '#0284c7',
  },
  {
    id: 'charlotte-uk',
    name: 'Charlotte (Period Classic)',
    archetype: 'Refined Literature & Graceful Reader',
    description: 'Graceful, crystal-clear acoustic articulation with heightened oral formant presence.',
    gender: 'Female',
    accent: 'UK',
    flag: '📖',
    pitch: 1.1,
    rate: 0.96,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-slt-2',
    throatWarmth: 1,
    oralClarity: 4,
    airPresence: 3,
    samplePhrase: 'For the twentieth time that evening the two men shook hands.',
    avatarColor: '#ec4899',
  },
  {
    id: 'jax-podcast',
    name: 'Jax (High-Energy Host)',
    archetype: 'Upbeat Tech & Media Presenter',
    description: 'Brisk, punchy delivery with elevated vocal pitch and crisp speech clarity.',
    gender: 'Male',
    accent: 'US',
    flag: '⚡',
    pitch: 1.12,
    rate: 1.15,
    volume: 1.0,
    toneStyle: 'energetic',
    baseSampleId: 'cmu-bdl-1',
    throatWarmth: -1,
    oralClarity: 5,
    airPresence: 4,
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#3b82f6',
  },
  {
    id: 'willow-calm',
    name: 'Willow (Mindfulness & Whisper)',
    archetype: 'Gentle Meditation & Soft Presence',
    description: 'Soft, delicate, breathy vocal contour shaped with acoustic air presence filters.',
    gender: 'Female',
    accent: 'US',
    flag: '🌿',
    pitch: 0.94,
    rate: 0.85,
    volume: 0.9,
    toneStyle: 'whisper',
    baseSampleId: 'cmu-slt-1',
    throatWarmth: -4,
    oralClarity: 1,
    airPresence: 8,
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#84cc16',
  },
  {
    id: 'radio-sterling',
    name: 'Sterling (1930s Broadcast Radio)',
    archetype: 'Vintage Transmitter Announcer',
    description: 'Classic mid-Atlantic broadcast character with analog telephone bandpass filtering.',
    gender: 'Male',
    accent: 'US',
    flag: '📻',
    pitch: 1.08,
    rate: 1.2,
    volume: 1.0,
    toneStyle: 'radio',
    baseSampleId: 'cmu-bdl-1',
    throatWarmth: -3,
    oralClarity: 6,
    airPresence: -6,
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#eab308',
  },
  {
    id: 'unit-7-droid',
    name: 'Unit-7 (Cyber Droid)',
    archetype: 'Metallic Sci-Fi Assistant',
    description: 'Quantized metallic resonance synthesized via real-time carrier ring-modulation.',
    gender: 'Neutral',
    accent: 'Global',
    flag: '🤖',
    pitch: 0.88,
    rate: 1.05,
    volume: 1.0,
    toneStyle: 'robot',
    baseSampleId: 'cmu-bdl-1',
    throatWarmth: 2,
    oralClarity: -3,
    airPresence: 4,
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#06b6d4',
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
 * Play converted voice through real-time Web Audio DSP graph.
 * 100% genuine acoustic transformation — NO AI, NO window.speechSynthesis.
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
 * Render converted voice into a downloadable 16-bit uncompressed WAV file
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
