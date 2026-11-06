import { prepareCmuVoice } from './cmuDiphoneSynthesizer';
import { preparePronunciationDictionary, savePronunciationSpelling, synthesizeText } from './phonemeSynthesizer';

export interface VoiceModelConfig {
  id: string;
  name: string;
  archetype: string;
  description: string;
  gender: 'Female' | 'Male' | 'Neutral';
  baseVoiceId?: 'slt' | 'bdl';
  /** Mathematical formant synthesis is the default; CMU units remain an experimental alternative. */
  synthesisMethod?: 'formant' | 'cmu-arctic';
  accent: 'US' | 'UK' | 'AU' | 'Global';
  flag: string;
  pitch: number; // 0.5 to 1.8 (1.0 = normal)
  rate: number; // 0.6 to 1.6 (1.0 = normal)
  volume: number; // 0.1 to 1.0
  toneStyle: 'natural' | 'deep' | 'energetic' | 'whisper' | 'radio' | 'robot';
  samplePhrase: string;
  avatarColor: string;
  isCustom?: boolean;
}

export const PRESET_VOICE_MODELS: VoiceModelConfig[] = [
  {
    id: 'narrator-aria',
    name: 'Warm Storyteller',
    archetype: 'Warm Conversational Narrator',
    description: 'Friendly, relaxed delivery for explainers, documentaries, and engaging stories.',
    gender: 'Female',
    synthesisMethod: 'formant',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 0.95,
    volume: 1.0,
    toneStyle: 'natural',
    samplePhrase: 'Beneath the twilight sky, the ancient clock tower chimed seven times.',
    avatarColor: '#8b5cf6',
  },
  {
    id: 'titan-marcus',
    name: 'Deep Cinematic Narrator',
    archetype: 'Low, Measured, Authoritative',
    description: 'A deliberate, weighty delivery for trailers, dramatic openings, and motivation.',
    gender: 'Male',
    synthesisMethod: 'formant',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 0.72,
    rate: 0.88,
    volume: 1.0,
    toneStyle: 'deep',
    samplePhrase: 'In the shadows of a forgotten world, one truth will rise above all.',
    avatarColor: '#f97316',
  },
  {
    id: 'oliver-british',
    name: 'Measured Documentary Narrator',
    archetype: 'Clear, Steady, Professional',
    description: 'A composed, informative delivery for documentaries, guides, and educational narration.',
    gender: 'Male',
    synthesisMethod: 'formant',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 0.96,
    rate: 0.98,
    volume: 1.0,
    toneStyle: 'natural',
    samplePhrase: 'Good evening. Across the rolling hills of the countryside, the expedition began.',
    avatarColor: '#0284c7',
  },
  {
    id: 'charlotte-uk',
    name: 'Refined Literary Narrator',
    archetype: 'Poised, Expressive, Literary',
    description: 'A polished, expressive delivery for literature, podcasts, and long-form stories.',
    gender: 'Female',
    synthesisMethod: 'formant',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.06,
    rate: 0.95,
    volume: 1.0,
    toneStyle: 'natural',
    samplePhrase: 'The carriage arrived just as the morning fog began to lift from the courtyard.',
    avatarColor: '#ec4899',
  },
  {
    id: 'liam-aussie',
    name: 'Charismatic Travel Presenter',
    archetype: 'Crisp, Charismatic, Friendly',
    description: 'An upbeat, open delivery suited to travel, technology, and casual entertainment.',
    gender: 'Male',
    synthesisMethod: 'formant',
    accent: 'AU',
    flag: '🇦🇺',
    pitch: 1.04,
    rate: 1.1,
    volume: 1.0,
    toneStyle: 'energetic',
    samplePhrase: 'G\'day! We are live from the coast tracking one of the greatest ocean swells of the year.',
    avatarColor: '#10b981',
  },
  {
    id: 'chloe-melbourne',
    name: 'Bright Conversational Presenter',
    archetype: 'Clear, Friendly, Engaging',
    description: 'A bright, approachable delivery for tutorials, reviews, guides, and lifestyle content.',
    gender: 'Female',
    synthesisMethod: 'formant',
    accent: 'AU',
    flag: '🇦🇺',
    pitch: 1.14,
    rate: 1.05,
    volume: 1.0,
    toneStyle: 'energetic',
    samplePhrase: 'Welcome aboard! Let\'s dive straight into today\'s top stories and creative highlights.',
    avatarColor: '#14b8a6',
  },
  {
    id: 'jax-podcast',
    name: 'Energetic Presenter',
    archetype: 'Punchy, Dynamic, Assertive',
    description: 'A lively, quick-paced delivery for promos, short clips, and high-energy explainers.',
    gender: 'Male',
    synthesisMethod: 'formant',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.1,
    rate: 1.15,
    volume: 1.0,
    toneStyle: 'energetic',
    samplePhrase: 'Welcome back to the show! Today we are testing next-generation synthetic voice creation.',
    avatarColor: '#3b82f6',
  },
  {
    id: 'willow-calm',
    name: 'Peaceful Wellness Guide',
    archetype: 'Calm, Balanced, Gentle',
    description: 'A gentle, unhurried delivery for relaxation, reflection, and ambient guidance.',
    gender: 'Female',
    synthesisMethod: 'formant',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 0.92,
    rate: 0.8,
    volume: 0.9,
    toneStyle: 'whisper',
    samplePhrase: 'Take a slow, deep breath in, and let your mind drift into complete stillness.',
    avatarColor: '#84cc16',
  },
  {
    id: 'radio-sterling',
    name: 'Vintage Radio Announcer',
    archetype: 'Crisp, Vintage, Broadcast',
    description: 'A quick, bright delivery with a narrow-band radio effect for retro announcements.',
    gender: 'Male',
    synthesisMethod: 'formant',
    accent: 'US',
    flag: '📻',
    pitch: 1.05,
    rate: 1.25,
    volume: 1.0,
    toneStyle: 'radio',
    samplePhrase: 'We interrupt this broadcast to bring you a special bulletin from the capital!',
    avatarColor: '#eab308',
  },
  {
    id: 'unit-7-droid',
    name: 'Synthetic Sci-fi Announcer',
    archetype: 'Precise, Calculated, Robotic',
    description: 'A deliberately synthetic, modulated delivery for sci-fi dialogue and announcements.',
    gender: 'Neutral',
    synthesisMethod: 'formant',
    baseVoiceId: 'bdl',
    accent: 'US',
    flag: '🤖',
    pitch: 0.9,
    rate: 1.05,
    volume: 1.0,
    toneStyle: 'robot',
    samplePhrase: 'Acoustic protocols verified. Voice synthesis engine running at maximum efficiency.',
    avatarColor: '#06b6d4',
  },
  {
    id: 'dev-academic',
    name: 'Clear Educator',
    archetype: 'Warm, Articulate, Informative',
    description: 'A clear, measured delivery for lectures, demonstrations, and educational explainers.',
    gender: 'Male',
    synthesisMethod: 'formant',
    accent: 'US',
    flag: '🌐',
    pitch: 0.98,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    samplePhrase: 'When analyzing vocal harmonics, distinct frequencies define individual human identity.',
    avatarColor: '#a855f7',
  },
  {
    id: 'maya-nordic',
    name: 'Expressive Studio Narrator',
    archetype: 'Bright, Precise, Expressive',
    description: 'A bright, carefully paced delivery for polished studio narration and interviews.',
    gender: 'Female',
    synthesisMethod: 'formant',
    accent: 'US',
    flag: '✨',
    pitch: 1.12,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    samplePhrase: 'Notice how every consonant and vowel rings through with distinct acoustic presence.',
    avatarColor: '#f43f5e',
  },
];

export function initializeLocalSpeechEngine(model?: VoiceModelConfig): void {
  void preparePronunciationDictionary();
  if (model?.synthesisMethod === 'cmu-arctic') void prepareCmuVoice(model);
}

export function addLocalPronunciation(word: string, spokenAs: string): Promise<void> {
  return savePronunciationSpelling(word, spokenAs);
}

export type SpeechCallbacks = {
  onStart?: () => void;
  onWord?: (charIndex: number, charLength: number) => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
};

let activeAudio: HTMLAudioElement | null = null;
let activeAudioUrl: string | null = null;
let activeCallbacks: SpeechCallbacks | undefined;
let activeWordTimings: Array<{ charIndex: number; charLength: number; start: number }> = [];
let playbackTimer: ReturnType<typeof setInterval> | null = null;
let playbackId = 0;

function finishPlayback(error?: unknown): void {
  const callbacks = activeCallbacks;
  activeCallbacks = undefined;
  activeWordTimings = [];
  if (playbackTimer) clearInterval(playbackTimer);
  playbackTimer = null;
  if (activeAudio) {
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio.ontimeupdate = null;
    activeAudio.pause();
    activeAudio = null;
  }
  if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
  activeAudioUrl = null;
  if (error) callbacks?.onError?.(error);
  callbacks?.onEnd?.();
}

/**
 * Speak using the selected local mathematical-formant or CMU unit-synthesis method.
 * No browser TTS, remote TTS service, or neural voice model is used.
 */
export function speakRealWords(text: string, model: VoiceModelConfig, callbacks?: SpeechCallbacks): void {
  stopSpeaking();
  if (typeof window === 'undefined' || !text.trim()) {
    callbacks?.onEnd?.();
    return;
  }

  const requestId = ++playbackId;
  activeCallbacks = callbacks;
  void synthesizeText(text, model).then(({ audioUrl, wordTimings }) => {
    if (requestId !== playbackId) {
      URL.revokeObjectURL(audioUrl);
      return;
    }
    const audio = new Audio(audioUrl);
    activeAudio = audio;
    activeAudioUrl = audioUrl;
    activeWordTimings = wordTimings;
    let lastWord = -1;

    const updateWord = () => {
      if (!activeAudio) return;
      const current = activeAudio.currentTime;
      let found = -1;
      for (let i = 0; i < activeWordTimings.length; i++) {
        if (activeWordTimings[i].start <= current) found = i;
        else break;
      }
      if (found !== lastWord && found >= 0) {
        lastWord = found;
        const item = activeWordTimings[found];
        callbacks?.onWord?.(item.charIndex, item.charLength);
      }
    };

    audio.onplay = () => callbacks?.onStart?.();
    audio.ontimeupdate = updateWord;
    audio.onended = () => finishPlayback();
    audio.onerror = () => finishPlayback(new Error('Local synthesized audio playback failed.'));
    playbackTimer = setInterval(updateWord, 35);
    audio.play().catch((error) => finishPlayback(error));
  }).catch((error) => {
    if (requestId !== playbackId) return;
    finishPlayback(error);
  });
}

/** Stop local synthesis playback and clear its temporary audio buffer. */
export function stopSpeaking(): void {
  playbackId++;
  if (activeAudio || activeCallbacks) finishPlayback();
}

/** Generate downloadable PCM WAV speech entirely in the browser. */
export async function generateSpokenAudioWav(
  text: string,
  model: VoiceModelConfig,
): Promise<{ audioUrl: string; source: 'mathematical-formant' | 'cmu-arctic-diphone' }> {
  const { audioUrl } = await synthesizeText(text, model);
  return { audioUrl, source: model.synthesisMethod === 'cmu-arctic' ? 'cmu-arctic-diphone' : 'mathematical-formant' };
}
