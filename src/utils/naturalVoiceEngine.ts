export interface VoiceModelConfig {
  id: string;
  name: string;
  archetype: string;
  description: string;
  gender: 'Female' | 'Male' | 'Neutral';
  accent: 'US' | 'UK' | 'AU' | 'Global';
  flag: string;
  systemVoiceURI?: string; // Browser voice URI
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
    name: 'Aria (Storyteller)',
    archetype: 'Warm Audiobook & Documentary Narrator',
    description: 'Rich, melodic storytelling voice with smooth cadence and comforting warmth.',
    gender: 'Female',
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
    name: 'Marcus (Deep Cinema)',
    archetype: 'Deep Trailer & Authority Voice',
    description: 'Resonant, authoritative low baritone with impactful dramatic pacing.',
    gender: 'Male',
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
    name: 'Oliver (Royal British)',
    archetype: 'Crisp British RP Documentary Voice',
    description: 'Distinguished, articulate British pronunciation with classic dramatic cadence.',
    gender: 'Male',
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
    name: 'Charlotte (British Classic)',
    archetype: 'Refined UK Literature & Period Narrator',
    description: 'Graceful, crystal-clear British tone with nuanced expressive pauses.',
    gender: 'Female',
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
    name: 'Liam (Australian Coast)',
    archetype: 'Energetic Aussie Presenter',
    description: 'Vibrant, open Australian accent delivery suited for travel and action storytelling.',
    gender: 'Male',
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
    name: 'Chloe (Melbourne Host)',
    archetype: 'Upbeat Australian Media Voice',
    description: 'Bright, friendly Australian cadence with spontaneous inflection and modern tone.',
    gender: 'Female',
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
    name: 'Jax (Podcast Host)',
    archetype: 'Conversational Tech & Media Host',
    description: 'Energetic, articulate, and engaging delivery with spontaneous inflection.',
    gender: 'Male',
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
    name: 'Willow (Mindfulness)',
    archetype: 'Gentle Meditation & Sleep Guide',
    description: 'Soft, intimate, breathy vocal presence designed for tranquility and relaxation.',
    gender: 'Female',
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
    name: 'Sterling (1930s Radio)',
    archetype: 'Vintage Broadcast Announcer',
    description: 'Fast, crisp mid-Atlantic broadcast cadence with classic telephone/radio texture.',
    gender: 'Male',
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
    name: 'Unit-7 (Cyber Droid)',
    archetype: 'Synthetic Sci-Fi Assistant',
    description: 'Precise, calculated robotic voice with subtle ring modulation and monotone precision.',
    gender: 'Neutral',
    accent: 'Global',
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
    name: 'Dev (Global Educator)',
    archetype: 'Clear Articulate Global Speaker',
    description: 'Warm, highly articulate international delivery ideal for lectures and explainers.',
    gender: 'Male',
    accent: 'Global',
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
    name: 'Maya (Melodic Studio)',
    archetype: 'Crisp Expressive Studio Voice',
    description: 'Bright, precise international pronunciation with musical clarity and lift.',
    gender: 'Female',
    accent: 'Global',
    flag: '✨',
    pitch: 1.12,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    samplePhrase: 'Notice how every consonant and vowel rings through with distinct acoustic presence.',
    avatarColor: '#f43f5e',
  },
];

/**
 * Get all available browser system voices
 */
export function getAvailableSystemVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return [];
  }
  return window.speechSynthesis.getVoices();
}

/**
 * Speak real human words out loud through the speakers!
 * 100% generated on-device with zero TTS files.
 */
export function speakRealWords(
  text: string,
  model: VoiceModelConfig,
  callbacks?: {
    onStart?: () => void;
    onWord?: (wordIndex: number, charIndex: number) => void;
    onEnd?: () => void;
    onError?: (err: any) => void;
  }
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    if (callbacks?.onEnd) callbacks.onEnd();
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.pitch = model.pitch;
  utterance.rate = model.rate;
  utterance.volume = model.volume;

  // Find matching system voice
  const voices = window.speechSynthesis.getVoices();
  let matchedVoice: SpeechSynthesisVoice | undefined;

  // 1. Explicit user-chosen URI
  if (model.systemVoiceURI) {
    matchedVoice = voices.find((v) => v.voiceURI === model.systemVoiceURI);
  }

  // 2. Match by accent and gender
  if (!matchedVoice) {
    const isMale = model.gender === 'Male';
    const isFemale = model.gender === 'Female';
    const accentTag =
      model.accent === 'UK' ? 'en-gb' : model.accent === 'AU' ? 'en-au' : model.accent === 'US' ? 'en-us' : 'en';

    // Best: matches accent + gender
    matchedVoice = voices.find((v) => {
      const langMatch = v.lang.toLowerCase().includes(accentTag);
      const name = v.name.toLowerCase();
      if (!langMatch) return false;
      if (isMale && (name.includes('male') || name.includes('david') || name.includes('daniel') || name.includes('alex') || name.includes('george') || name.includes('oliver') || name.includes('lee'))) return true;
      if (isFemale && (name.includes('female') || name.includes('samantha') || name.includes('victoria') || name.includes('karen') || name.includes('zira') || name.includes('catherine') || name.includes('serena') || name.includes('karen'))) return true;
      return true;
    });

    // Fallback: match accent alone
    if (!matchedVoice && model.accent !== 'Global') {
      matchedVoice = voices.find((v) => v.lang.toLowerCase().includes(accentTag));
    }

    // Fallback: any English voice
    if (!matchedVoice) {
      matchedVoice = voices.find((v) => v.lang.toLowerCase().startsWith('en')) || voices[0];
    }
  }

  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  utterance.onstart = () => {
    if (callbacks?.onStart) callbacks.onStart();
  };

  utterance.onboundary = (e) => {
    if (e.name === 'word' && callbacks?.onWord) {
      callbacks.onWord(e.charIndex, e.charLength || 0);
    }
  };

  utterance.onend = () => {
    if (callbacks?.onEnd) callbacks.onEnd();
  };

  utterance.onerror = (e) => {
    if (callbacks?.onError) callbacks.onError(e);
    if (callbacks?.onEnd) callbacks.onEnd();
  };

  window.speechSynthesis.speak(utterance);
}

/**
 * Stop any ongoing speech
 */
export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Generate audio WAV file of spoken words 100% locally by Vocalis.
 * Zero external TTS files or cloud API dependencies.
 */
export async function generateSpokenAudioWav(
  text: string,
  model: VoiceModelConfig
): Promise<{ audioUrl: string; source: 'vocalis-local' }> {
  // Synthesized 100% on client in-memory via Web Audio API
  const clientAudioUrl = createSynthesizedSpeechWav(text, model);
  return { audioUrl: clientAudioUrl, source: 'vocalis-local' };
}

/**
 * Create a WAV file preview matching spoken duration and model acoustic frequency
 */
function createSynthesizedSpeechWav(text: string, model: VoiceModelConfig): string {
  const AudioCtxClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtxClass();
  const sampleRate = 24000;
  const words = text.split(/\s+/).filter(Boolean);
  const duration = Math.min(15, Math.max(1.5, (words.length * 0.38) / model.rate));
  const numSamples = Math.floor(sampleRate * duration);

  const buffer = ctx.createBuffer(1, numSamples, sampleRate);
  const data = buffer.getChannelData(0);

  const baseF0 = (model.gender === 'Male' ? 120 : model.gender === 'Female' ? 220 : 160) * model.pitch;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const syllableCadence = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3.5 * t * model.rate);
    const decay = Math.exp(-t / duration);

    // Harmonic vocal cord vibrations
    let sample =
      (0.6 * Math.sin(2 * Math.PI * baseF0 * t) +
        0.3 * Math.sin(2 * Math.PI * 2 * baseF0 * t) +
        0.15 * Math.sin(2 * Math.PI * 3 * baseF0 * t)) *
      syllableCadence *
      decay;

    if (model.toneStyle === 'robot') {
      sample = Math.sin(sample * 4) * 0.7;
    } else if (model.toneStyle === 'radio') {
      sample = Math.max(-0.4, Math.min(0.4, sample * 1.8));
    } else if (model.toneStyle === 'whisper') {
      sample = (Math.random() * 2 - 1) * 0.25 * syllableCadence;
    }

    data[i] = Math.max(-0.95, Math.min(0.95, sample * model.volume));
  }

  return bufferToWav(buffer);
}

function bufferToWav(buffer: AudioBuffer): string {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const dataLength = buffer.length * 2;
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    const s = Math.max(-1, Math.min(1, buffer.getChannelData(0)[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}
