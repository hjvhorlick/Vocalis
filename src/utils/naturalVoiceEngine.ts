/**
 * Vocalis voice engine — the single entry point every surface uses.
 *
 * Responsibilities:
 *   - hold the voice profile type and the shipped preset identities
 *   - prepare the engine (pronunciation dictionary, plus the selected speaker's
 *     recorded units) before the first render
 *   - speak text, render text to a WAV, and render a whole dialogue, through ONE
 *     pipeline
 *   - keep the source-recording audition available as a separate, clearly
 *     labelled feature, because comparing a transformation against the original
 *     human recording is genuinely useful
 *
 * The speech itself is produced by `synthesizeText` in phonemeSynthesizer.ts:
 * text -> phones -> recorded CMU ARCTIC units -> transformation -> samples.
 * Nothing here plays a fixed recording in place of generated speech.
 *
 * Original Vocalis code.
 */
import {
  NATURAL_HUMAN_SAMPLES,
  HumanVoiceSample,
  loadHumanVoiceBuffer,
  ATTRIBUTION_DETAILS,
} from './naturalHumanAudio';
import {
  VoiceDspConfig,
  playBufferUntouched,
  playTransformedVoice,
  playRenderedSpeech,
  stopTransformedVoice,
  renderTransformedWav,
  getDspAnalyser,
  isDspPlaying,
} from './audioDspEngine';
import {
  synthesizeText,
  preparePronunciationDictionary,
  releaseSynthesis,
  encodeWav,
  type SynthesisResult,
  type SynthesisDiagnostics,
  type WordTiming,
} from './phonemeSynthesizer';
import { prepareCmuVoice, isVoicePackLoaded, speakerForModel } from './cmuDiphoneSynthesizer';

export type { SynthesisResult, SynthesisDiagnostics, WordTiming };
export { releaseSynthesis };

export interface VoiceModelConfig {
  id: string;
  name: string;
  archetype: string;
  description: string;
  gender: 'Female' | 'Male' | 'Neutral';
  accent: 'US' | 'UK' | 'AU' | 'Global';
  flag: string;
  pitch: number; // 0.5 to 1.75 (1.0 = the speaker's own pitch)
  rate: number; // 0.6 to 1.5 (1.0 = natural pace)
  volume: number; // 0.2 to 1.0
  toneStyle: 'natural' | 'deep' | 'energetic' | 'whisper' | 'radio' | 'robot';
  samplePhrase: string;
  avatarColor: string;
  isCustom?: boolean;
  /** Reference recording used by the source audition feature. */
  baseSampleId: string;
  /** Which recorded speaker this voice is built from. */
  baseVoiceId?: 'slt' | 'bdl';
  /** 'cmu-arctic' is the product; 'formant' is the preserved experiment. */
  synthesisMethod?: 'cmu-arctic' | 'formant';
  /**
   * Keep the recorded timing.
   *
   * Absent or `true` — the default, and what every predefined voice ships with —
   * assembles the recorded units at the lengths they were recorded at and joins
   * them by crossfade. No duration plan, no pitch-synchronous re-timing, no
   * phase-aligned joins: the unit audio reaches the output verbatim, which is why
   * it sounds like the recording it came from.
   *
   * An explicit `false` switches the Vocalis rhythm engine on. `planDurations`
   * decides how long each phone should be and `joinRetimed` rebuilds every half
   * phone from grains one voice cycle wide to hit those lengths. It speaks the
   * same words about 1.5× faster, closer to how the human read them, and it costs
   * the crispness of the recording: roughness above the human range on two of the
   * four sentences this repository can measure (docs/DURATION_MODEL.md §4).
   *
   * This flag does not gate the effects, and never should. Pitch, pace, volume,
   * delivery character, the three resonance bands and the accent apply on top of
   * either timing, each one only when it is moved off neutral, so a single
   * adjustment can be heard against the recording on its own. That is what the
   * effects panel exists for, and what the render suite checks one control at a
   * time.
   */
  referenceRaw?: boolean;
  throatWarmth?: number; // low-band resonance, -10 to +10 dB
  oralClarity?: number; // mid-band resonance, -10 to +10 dB
  airPresence?: number; // high-band resonance, -10 to +10 dB
}

export { ATTRIBUTION_DETAILS, NATURAL_HUMAN_SAMPLES };
export type { HumanVoiceSample };

/**
 * The predefined voices are the four recordings this repository ships, and they are
 * the recordings: pitch 1.00, pace 1.00, full volume, the natural delivery, no
 * resonance shift, American English as recorded, recorded timing kept. Nothing in
 * between the licensed audio and the listener.
 *
 * The four are two licensed speakers — CMU ARCTIC SLT (female) and BDL (male) — on
 * two sentences each, because a single sentence cannot show a voice off and because
 * the two speakers say the same words, so they can be compared like for like. Each
 * one names, in its own description, which file it is and how it is meant to be used.
 *
 * The starter voices below them are the recordings with settings attached, and the
 * settings are applied to the recording file by the Web Audio graph — the same 16
 * controls as the effects panel, nothing else. A starter voice is a starting point
 * for one particular job (a story, a podcast, a 1930s broadcast), not a different
 * person, and each one says which recording it was built from. Two of them, the
 * accents, are marked as needing the generated voice, because an accent is a rule
 * over phones and audio has no phones.
 *
 * The distinction that matters, and the reason this file keeps saying it: a voice
 * that only changes *sound* is always heard on the file. Only a voice that changes
 * *words* is rendered, and it says so.
 *
 * `samplePhrase` is the exact transcript of the recording named by `baseSampleId`, so
 * "hear the original" beside "hear it adjusted" is the same sentence both times.
 */

/** Shared by every predefined entry, so no voice can quietly acquire an extra change. */
const UNTOUCHED = {
  pitch: 1,
  rate: 1,
  volume: 1,
  toneStyle: 'natural' as const,
  throatWarmth: 0,
  oralClarity: 0,
  airPresence: 0,
  synthesisMethod: 'cmu-arctic' as const,
  referenceRaw: true,
  accent: 'US' as const,
};

export const PRESET_VOICE_MODELS: VoiceModelConfig[] = [
  // ---------------------------------------------------------------- the recordings
  {
    id: 'cmu-arctic-slt',
    name: 'SLT — the recording (female)',
    archetype: 'Original file, nothing applied',
    description:
      'The licensed file itself: CMU ARCTIC SLT, a female American English speaker, sentence a0001. Use it as the clean reference — anything else in this list is this recording with a change on top. Pitch, pace, volume, character and all three resonance bands are off, and the timing is the timing she recorded.',
    gender: 'Female',
    flag: '🎙️',
    ...UNTOUCHED,
    baseSampleId: 'cmu-slt-1',
    baseVoiceId: 'slt',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#22c55e',
  },
  {
    id: 'cmu-arctic-bdl',
    name: 'BDL — the recording (male)',
    archetype: 'Original file, nothing applied',
    description:
      'The licensed file itself: CMU ARCTIC BDL, a male American English speaker, sentence a0001 — the same words as SLT, so the two can be compared on identical sentences. Use it as the clean reference for a male voice. Nothing is applied.',
    gender: 'Male',
    flag: '🎙️',
    ...UNTOUCHED,
    baseSampleId: 'cmu-bdl-1',
    baseVoiceId: 'bdl',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#38bdf8',
  },
  {
    id: 'cmu-arctic-slt-sentence-2',
    name: 'SLT — the recording, sentence 2 (female)',
    archetype: 'Original file, nothing applied',
    description:
      'The licensed file itself: CMU ARCTIC SLT, sentence a0003 — "For the twentieth time that evening the two men shook hands." The same clean female reference on a second, longer sentence, for testing how a setting behaves past the first line. Nothing is applied.',
    gender: 'Female',
    flag: '🎙️',
    ...UNTOUCHED,
    baseSampleId: 'cmu-slt-2',
    baseVoiceId: 'slt',
    samplePhrase: 'For the twentieth time that evening the two men shook hands.',
    avatarColor: '#10b981',
  },
  {
    id: 'cmu-arctic-bdl-sentence-2',
    name: 'BDL — the recording, sentence 2 (male)',
    archetype: 'Original file, nothing applied',
    description:
      'The licensed file itself: CMU ARCTIC BDL, sentence a0003 — the same words as SLT sentence 2, in the male voice. The clean male reference on a second sentence. Nothing is applied.',
    gender: 'Male',
    flag: '🎙️',
    ...UNTOUCHED,
    baseSampleId: 'cmu-bdl-2',
    baseVoiceId: 'bdl',
    samplePhrase: 'For the twentieth time that evening the two men shook hands.',
    avatarColor: '#0ea5e9',
  },

  // ------------------------------------------------------- the recordings, adjusted
  // Settings only. The graph applies them to the file above; nothing here is
  // rendered. `referenceRaw` stays true on all of them — it gates the rhythm engine,
  // not the effects — so each remains "a change on the recording".
  {
    id: 'storyteller-slt',
    name: 'The Storyteller (from SLT)',
    archetype: 'Warm audiobook narration',
    description:
      'SLT with a little more weight in the chest and a slower, more deliberate pace: pitch 1.00, pace 0.95, throat +3 dB, oral +2 dB, air +1 dB. For reading a story aloud. The recording is underneath, unchanged in wording and rhythm.',
    gender: 'Female',
    accent: 'US',
    flag: '📖',
    pitch: 1,
    rate: 0.95,
    volume: 1,
    toneStyle: 'natural',
    throatWarmth: 3,
    oralClarity: 2,
    airPresence: 1,
    synthesisMethod: 'cmu-arctic',
    referenceRaw: true,
    baseSampleId: 'cmu-slt-1',
    baseVoiceId: 'slt',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#a78bfa',
  },
  {
    id: 'storyteller-bdl',
    name: 'The Storyteller (from BDL)',
    archetype: 'Warm audiobook narration',
    description:
      'The same storyteller settings on the male recording: pitch 1.00, pace 0.95, throat +3 dB, oral +2 dB, air +1 dB. For a male narration voice. The recording underneath is BDL, unchanged in wording and rhythm.',
    gender: 'Male',
    accent: 'US',
    flag: '📖',
    pitch: 1,
    rate: 0.95,
    volume: 1,
    toneStyle: 'natural',
    throatWarmth: 3,
    oralClarity: 2,
    airPresence: 1,
    synthesisMethod: 'cmu-arctic',
    referenceRaw: true,
    baseSampleId: 'cmu-bdl-1',
    baseVoiceId: 'bdl',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#8b5cf6',
  },
  {
    id: 'deep-cinema-bdl',
    name: 'Deep Cinema (from BDL)',
    archetype: 'Trailer and authority baritone',
    description:
      'A lower, heavier reading for trailers and narration that needs authority: pitch 0.72, pace 0.90, the deep character, throat +7 dB, oral −1 dB, air −2 dB. Everything is applied to the BDL file — the words and the rhythm are his.',
    gender: 'Male',
    accent: 'US',
    flag: '🎬',
    pitch: 0.72,
    rate: 0.9,
    volume: 1,
    toneStyle: 'deep',
    throatWarmth: 7,
    oralClarity: -1,
    airPresence: -2,
    synthesisMethod: 'cmu-arctic',
    referenceRaw: true,
    baseSampleId: 'cmu-bdl-1',
    baseVoiceId: 'bdl',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#f59e0b',
  },
  {
    id: 'podcast-host-bdl',
    name: 'Podcast Host (from BDL)',
    archetype: 'Upbeat presenter',
    description:
      'Brighter and quicker for a show intro: pitch 1.12, pace 1.15, the high-energy character, oral +5 dB, air +4 dB, throat −1 dB. Applied to BDL; the recording still does the talking.',
    gender: 'Male',
    accent: 'US',
    flag: '🎧',
    pitch: 1.12,
    rate: 1.15,
    volume: 1,
    toneStyle: 'energetic',
    throatWarmth: -1,
    oralClarity: 5,
    airPresence: 4,
    synthesisMethod: 'cmu-arctic',
    referenceRaw: true,
    baseSampleId: 'cmu-bdl-1',
    baseVoiceId: 'bdl',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#fb7185',
  },
  {
    id: 'calm-whisper-slt',
    name: 'Calm & Close (from SLT)',
    archetype: 'Soft, intimate delivery',
    description:
      'Quieter, slower and breathier, for meditation and close narration: pitch 0.94, pace 0.85, volume 0.90, the whisper character, air +8 dB, throat −4 dB, oral +1 dB. Applied to SLT.',
    gender: 'Female',
    accent: 'US',
    flag: '🌙',
    pitch: 0.94,
    rate: 0.85,
    volume: 0.9,
    toneStyle: 'whisper',
    throatWarmth: -4,
    oralClarity: 1,
    airPresence: 8,
    synthesisMethod: 'cmu-arctic',
    referenceRaw: true,
    baseSampleId: 'cmu-slt-1',
    baseVoiceId: 'slt',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#67e8f9',
  },
  {
    id: 'vintage-radio-bdl',
    name: 'Vintage Radio (from BDL)',
    archetype: '1930s broadcast announcer',
    description:
      'A narrow, saturated band like an old transmitter: pitch 1.08, pace 1.20, the radio character, oral +6 dB, throat −3 dB, air −6 dB. Applied to BDL — the announcer is him.',
    gender: 'Male',
    accent: 'US',
    flag: '📻',
    pitch: 1.08,
    rate: 1.2,
    volume: 1,
    toneStyle: 'radio',
    throatWarmth: -3,
    oralClarity: 6,
    airPresence: -6,
    synthesisMethod: 'cmu-arctic',
    referenceRaw: true,
    baseSampleId: 'cmu-bdl-1',
    baseVoiceId: 'bdl',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#fbbf24',
  },
  {
    id: 'droid-bdl',
    name: 'Cyber Droid (from BDL)',
    archetype: 'Metallic science-fiction assistant',
    description:
      'A machined, ring-modulated voice for a machine character: pitch 0.88, pace 1.05, the robot character, air +4 dB, throat +2 dB, oral −3 dB. Applied to BDL.',
    gender: 'Neutral',
    accent: 'US',
    flag: '🤖',
    pitch: 0.88,
    rate: 1.05,
    volume: 1,
    toneStyle: 'robot',
    throatWarmth: 2,
    oralClarity: -3,
    airPresence: 4,
    synthesisMethod: 'cmu-arctic',
    referenceRaw: true,
    baseSampleId: 'cmu-bdl-1',
    baseVoiceId: 'bdl',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#94a3b8',
  },
];

/**
 * Voices whose sound alone cannot define them.
 *
 * An accent is a rule over a phone stream — "use this vowel, drop this R" — and a
 * recording has no phone stream to rewrite, only audio. These two are here to show
 * that limit honestly instead of hiding it: they render the text, and the interface
 * says "British accent" or "Australian accent" beside them rather than pretending the
 * file was adjusted.
 */
export const ADAPTED_VOICE_MODELS: VoiceModelConfig[] = [
  {
    id: 'accent-british-bdl',
    name: 'British Accent (from BDL)',
    archetype: 'Adapted voice — renders the words',
    description:
      'BDL read with British vowel and consonant rules: pitch 0.88, pace 0.96, throat +4 dB, oral +2 dB, air +1 dB, plus the accent rules themselves. The accent rewrites words, so this one is generated rather than played from the file. It is the only kind of voice here that is not the recording.',
    gender: 'Male',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 0.88,
    rate: 0.96,
    volume: 1,
    toneStyle: 'natural',
    throatWarmth: 4,
    oralClarity: 2,
    airPresence: 1,
    synthesisMethod: 'cmu-arctic',
    referenceRaw: true,
    baseSampleId: 'cmu-bdl-1',
    baseVoiceId: 'bdl',
    samplePhrase: 'For the twentieth time that evening the two men shook hands.',
    avatarColor: '#3b82f6',
  },
  {
    id: 'accent-australian-slt',
    name: 'Australian Accent (from SLT)',
    archetype: 'Adapted voice — renders the words',
    description:
      'SLT read with Australian vowel rules: pitch 1.10, pace 0.96, oral +4 dB, air +3 dB, throat +1 dB, plus the accent rules. Generated, for the same reason as the British voice: an accent changes words, not sound.',
    gender: 'Female',
    accent: 'AU',
    flag: '🇦🇺',
    pitch: 1.1,
    rate: 0.96,
    volume: 1,
    toneStyle: 'natural',
    throatWarmth: 1,
    oralClarity: 4,
    airPresence: 3,
    synthesisMethod: 'cmu-arctic',
    referenceRaw: true,
    baseSampleId: 'cmu-slt-1',
    baseVoiceId: 'slt',
    samplePhrase: 'For the twentieth time that evening the two men shook hands.',
    avatarColor: '#22d3ee',
  },
];

// ---------------------------------------------------------------------------
// Engine readiness
// ---------------------------------------------------------------------------

export interface EngineReadiness {
  dictionary: boolean;
  voicePack: boolean;
  speaker: 'slt' | 'bdl';
}

let dictionaryReady = false;
const packReady = new Set<string>();

export function getEngineReadiness(model: VoiceModelConfig): EngineReadiness {
  const speaker = speakerForModel(model);
  return { dictionary: dictionaryReady, voicePack: packReady.has(speaker), speaker };
}

/**
 * Warm everything the first render will need: the pronunciation dictionary and
 * the selected speaker's recorded units. Call on mount and whenever the speaker
 * changes, so the first Play does not stall while ~5.7 MB arrives.
 */
export async function initializeLocalSpeechEngine(model?: VoiceModelConfig): Promise<void> {
  const tasks: Array<Promise<unknown>> = [];
  if (!dictionaryReady) {
    tasks.push(
      preparePronunciationDictionary().then(() => {
        dictionaryReady = true;
      }),
    );
  }
  if (model && model.synthesisMethod !== 'formant') {
    const speaker = speakerForModel(model);
    if (!packReady.has(speaker)) {
      tasks.push(
        prepareCmuVoice(model)
          .then(() => {
            packReady.add(speaker);
          })
          .catch((error) => {
            console.warn('Vocalis: could not preload the recorded voice pack.', error);
          }),
      );
    }
  }
  await Promise.all(tasks);
}

export function isEngineReady(model: VoiceModelConfig): boolean {
  if (!dictionaryReady) return false;
  if (model.synthesisMethod === 'formant') return true;
  return isVoicePackLoaded(model);
}

// ---------------------------------------------------------------------------
// Speaking text
// ---------------------------------------------------------------------------

export interface SpeechCallbacks {
  onStart?: () => void;
  /** Called with the finished render, before playback starts. */
  onRendered?: (result: SynthesisResult) => void;
  onWord?: (timing: WordTiming, index: number) => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Timers for word and line events, fired on the playback clock.
 *
 * A render knows where every word sits in the audio, so highlighting is driven
 * by the same measurement as the export rather than by an estimate. Stopping
 * speech must cancel them, or words keep lighting up after the audio ends.
 */
let wordEventTimers: number[] = [];

function clearWordEvents(): void {
  wordEventTimers.forEach((timer) => window.clearTimeout(timer));
  wordEventTimers = [];
}

function scheduleWordEvents(timings: WordTiming[], callbacks?: SpeechCallbacks): void {
  clearWordEvents();
  if (!callbacks?.onWord) return;
  timings.forEach((timing, index) => {
    wordEventTimers.push(
      window.setTimeout(() => callbacks.onWord?.(timing, index), Math.max(0, timing.start * 1000)),
    );
  });
}

/**
 * Generate `text` in `model`'s voice and play it.
 *
 * The words spoken are the words requested. The samples that reach the speakers
 * are the same samples the WAV encoder writes, so preview and export cannot
 * diverge.
 */
export async function speakText(
  text: string,
  model: VoiceModelConfig,
  callbacks?: SpeechCallbacks,
): Promise<SynthesisResult | null> {
  try {
    await initializeLocalSpeechEngine(model);
    const result = await synthesizeText(text, model);
    callbacks?.onRendered?.(result);
    playRenderedSpeech(result.samples, result.sampleRate, {
      onStart: () => {
        scheduleWordEvents(result.wordTimings, callbacks);
        callbacks?.onStart?.();
      },
      onEnded: () => {
        clearWordEvents();
        callbacks?.onEnd?.();
      },
      onError: (error) => {
        clearWordEvents();
        callbacks?.onError?.(error);
      },
    });
    return result;
  } catch (error) {
    const asError = error instanceof Error ? error : new Error(String(error));
    console.error('Vocalis: speech generation failed.', asError);
    callbacks?.onError?.(asError);
    callbacks?.onEnd?.();
    return null;
  }
}

/**
 * Generate `text` without playing it — for export, for a player widget, or for
 * a dialogue line that will be scheduled later.
 */
export async function renderSpeech(text: string, model: VoiceModelConfig): Promise<SynthesisResult> {
  await initializeLocalSpeechEngine(model);
  return synthesizeText(text, model);
}

/**
 * Play a render that already exists.
 *
 * Repeating a preview, or playing a take back after export, must not run the
 * pipeline a second time: the audio you already have IS the audio you export, so
 * replaying the same samples is both faster and provably identical.
 */
export function playRender(result: SynthesisResult, callbacks?: SpeechCallbacks): void {
  callbacks?.onRendered?.(result);
  playRenderedSpeech(result.samples, result.sampleRate, {
    onStart: () => {
      scheduleWordEvents(result.wordTimings, callbacks);
      callbacks?.onStart?.();
    },
    onEnded: () => {
      clearWordEvents();
      callbacks?.onEnd?.();
    },
    onError: (error) => {
      clearWordEvents();
      callbacks?.onError?.(error);
    },
  });
}

/** Older name for `speakText`, kept so existing callers do not break. */
export function speakRealWords(
  text: string,
  model: VoiceModelConfig,
  callbacks?: SpeechCallbacks,
): Promise<SynthesisResult | null> {
  return speakText(text, model, callbacks);
}

export function stopSpeaking(): void {
  clearWordEvents();
  stopTransformedVoice();
}

/**
 * Generate `text` and return the downloadable WAV.
 *
 * Same pipeline, same samples as playback: the blob is encoded from exactly the
 * array that was — or will be — sent to the speakers.
 */
export async function generateSpokenAudioWav(
  text: string,
  model: VoiceModelConfig,
): Promise<SynthesisResult & { source: string }> {
  const result = await renderSpeech(text, model);
  return { ...result, source: `vocalis-${result.diagnostics.method}` };
}

// ---------------------------------------------------------------------------
// Dialogue: two speakers, one render
// ---------------------------------------------------------------------------

export interface DialoguePart {
  /** Line identity used for turn detection and highlighting ('A', 'B', ...). */
  speakerId: string;
  text: string;
  model: VoiceModelConfig;
}

export interface DialogueLineRender {
  index: number;
  speakerId: string;
  text: string;
  voiceName: string;
  /** Seconds within the combined conversation audio. */
  start: number;
  end: number;
  /** Per-line render. Its `audioUrl` stays valid until `releaseDialogue` runs. */
  result: SynthesisResult;
}

export interface DialogueRender extends SynthesisResult {
  lines: DialogueLineRender[];
}

export interface DialogueTimingOptions {
  /** Silence between lines spoken by the same voice, in seconds. */
  sameSpeakerGap: number;
  /** Silence when the turn passes to the other speaker, in seconds. */
  turnGap: number;
}

export const DEFAULT_DIALOGUE_TIMING: DialogueTimingOptions = {
  sameSpeakerGap: 0.15,
  turnGap: 0.34,
};

const TERMINAL_PUNCTUATION = /[.!?…]["'”’)\]]?\s*$/;

/**
 * Gap before a line, in seconds.
 *
 * A change of speaker gets more air than the same voice continuing, and a line
 * that trails off without punctuation gets less than one that ends a sentence.
 * The recorded units already carry their own sentence-final pause, so these gaps
 * are the turn-taking rhythm on top of that, not a replacement for it.
 */
export function gapBeforeLine(
  previous: DialoguePart | undefined,
  next: DialoguePart,
  options: DialogueTimingOptions,
): number {
  if (!previous) return 0;
  const turnChange = previous.model.id !== next.model.id || previous.speakerId !== next.speakerId;
  const gap = turnChange ? options.turnGap : options.sameSpeakerGap;
  return TERMINAL_PUNCTUATION.test(previous.text.trim()) ? gap : gap * 0.6;
}

/**
 * Generate a whole conversation as ONE render.
 *
 * Every line is generated from its own text in its own speaker's voice; the
 * lines are then concatenated with the turn-taking gaps so the conversation has
 * a single timeline. Because the result carries one sample array, playback, the
 * per-line highlighting and the exported WAV all describe the same audio.
 */
export async function renderDialogue(
  parts: DialoguePart[],
  options: Partial<DialogueTimingOptions> = {},
): Promise<DialogueRender> {
  const timing = { ...DEFAULT_DIALOGUE_TIMING, ...options };
  const spoken = parts.filter((part) => part.text.trim().length > 0);
  const renders: SynthesisResult[] = [];
  for (const part of spoken) {
    renders.push(await renderSpeech(part.text, part.model));
  }

  const sampleRate = renders[0]?.sampleRate ?? 16000;
  const silenceFor = (seconds: number) => new Float32Array(Math.max(0, Math.round(seconds * sampleRate)));

  const pieces: Float32Array[] = [];
  const lines: DialogueLineRender[] = [];
  let cursor = 0;
  spoken.forEach((part, index) => {
    const gap = silenceFor(gapBeforeLine(spoken[index - 1], part, timing));
    if (gap.length) pieces.push(gap);
    cursor += gap.length / sampleRate;
    const result = renders[index];
    pieces.push(result.samples);
    lines.push({
      index,
      speakerId: part.speakerId,
      text: part.text,
      voiceName: part.model.name,
      start: cursor,
      end: cursor + result.duration,
      result,
    });
    cursor += result.duration;
  });

  const totalLength = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const samples = new Float32Array(totalLength);
  let write = 0;
  for (const piece of pieces) {
    samples.set(piece, write);
    write += piece.length;
  }

  // One conversation timeline: each line's word timings, shifted to its start.
  const wordTimings: WordTiming[] = [];
  for (const line of lines) {
    for (const timing of line.result.wordTimings) {
      wordTimings.push({ ...timing, start: line.start + timing.start, end: line.start + timing.end });
    }
  }

  const totals = renders.reduce(
    (accumulator, result) => {
      const d = result.diagnostics;
      accumulator.words += d.words;
      accumulator.phones += d.phones;
      accumulator.segments += d.segments;
      accumulator.exactUnits += d.exactUnits;
      accumulator.backoffUnits += d.backoffUnits;
      accumulator.fallbackPhones += d.fallbackPhones;
      accumulator.missingPairs.push(...d.missingPairs);
      accumulator.guessedWords.push(...d.guessedWords);
      accumulator.rejectedTokens.push(...d.rejectedTokens);
      accumulator.plannedSeconds += d.plannedSeconds;
      accumulator.grainHalves += d.grainHalves;
      accumulator.truncatedHalves += d.truncatedHalves;
      accumulator.cappedHalves += d.cappedHalves;
      if (!d.timedFromPlan) accumulator.unplanned += 1;
      if (d.speaker) accumulator.speakers.add(d.speaker);
      return accumulator;
    },
    {
      words: 0,
      phones: 0,
      segments: 0,
      exactUnits: 0,
      backoffUnits: 0,
      fallbackPhones: 0,
      missingPairs: [] as string[],
      guessedWords: [] as string[],
      rejectedTokens: [] as string[],
      plannedSeconds: 0,
      grainHalves: 0,
      truncatedHalves: 0,
      cappedHalves: 0,
      unplanned: 0,
      speakers: new Set<string>(),
    },
  );

  const unitTotal = totals.exactUnits + totals.backoffUnits + totals.fallbackPhones;
  const duration = samples.length / sampleRate;
  const wavBlob = encodeWav(samples, sampleRate);

  return {
    samples,
    sampleRate,
    duration,
    wordTimings,
    diagnostics: {
      method: renders[0]?.diagnostics.method ?? 'cmu-arctic',
      // Null means the conversation used more than one recorded speaker, which
      // is the normal case and the point of the feature.
      speaker: totals.speakers.size === 1 ? ([...totals.speakers][0] as 'slt' | 'bdl') : null,
      words: totals.words,
      phones: totals.phones,
      segments: totals.segments,
      exactUnits: totals.exactUnits,
      backoffUnits: totals.backoffUnits,
      fallbackPhones: totals.fallbackPhones,
      missingPairs: [...new Set(totals.missingPairs)],
      guessedWords: [...new Set(totals.guessedWords)],
      rejectedTokens: [...new Set(totals.rejectedTokens)],
      dictionary: renders[0]?.diagnostics.dictionary ?? {
        entries: 0,
        source: 'emergency',
        rejectedTokens: 0,
        annotatedLines: 0,
        hints: 0,
      },
      sampleRate,
      durationSeconds: duration,
      recordedCoverage: unitTotal ? totals.exactUnits / unitTotal : 0,
      // Every line has to be planned for the conversation to call itself planned:
      // one line falling back to recorded lengths is audible as one slow line.
      timedFromPlan: renders.length > 0 && totals.unplanned === 0,
      plannedSeconds: totals.plannedSeconds,
      grainHalves: totals.grainHalves,
      truncatedHalves: totals.truncatedHalves,
      cappedHalves: totals.cappedHalves,
    },
    wavBlob,
    audioUrl: URL.createObjectURL(wavBlob),
    lines,
  };
}

/**
 * Play a rendered conversation, reporting which line is speaking.
 *
 * Line changes are driven by the render's own timeline, so what is highlighted
 * is what is being heard. `stopSpeaking` cancels the pending line events too.
 */
export function playDialogueRender(
  render: DialogueRender,
  callbacks?: {
    onStart?: () => void;
    onLine?: (line: DialogueLineRender, index: number) => void;
    onEnd?: () => void;
    onError?: (error: Error) => void;
  },
): void {
  clearWordEvents();
  playRenderedSpeech(render.samples, render.sampleRate, {
    onStart: () => {
      render.lines.forEach((line, index) => {
        wordEventTimers.push(
          window.setTimeout(() => callbacks?.onLine?.(line, index), Math.max(0, line.start * 1000)),
        );
      });
      callbacks?.onStart?.();
    },
    onEnded: () => {
      clearWordEvents();
      callbacks?.onEnd?.();
    },
    onError: (error) => {
      clearWordEvents();
      callbacks?.onError?.(error);
    },
  });
}

/**
 * Play the recording itself — the file, untouched.
 *
 * This exists because "compare it with the original" is meaningless if the thing
 * on the left of the comparison is generated. The default render IS built from the
 * recording's units, but at their recorded lengths with crossfade joins and one
 * normalising gain, and the measurement is plain: on `slt a0001` the render is
 * 4.94 s against the recording's 3.36 s and differs from it by 155% of its own
 * energy. That is not the recording, and calling it one was wrong.
 *
 * So there are two different things and both are offered:
 *   - `playRecordedVoice` plays `public/samples/*.wav` as it is, with nothing
 *     between the file and the speakers.
 *   - `playRender` / `speakText` play what the pipeline produces.
 *
 * The words differ: the recording says its own sentence, which is why the UI shows
 * that sentence next to the button rather than pretending it is your text.
 */
export async function playRecordedVoice(
  model: VoiceModelConfig,
  callbacks?: SpeechCallbacks,
): Promise<boolean> {
  try {
    const buffer = await resolveBufferForModel(model);
    playBufferUntouched(buffer, {
      onStart: () => callbacks?.onStart?.(),
      onEnded: () => callbacks?.onEnd?.(),
      onError: (error) => callbacks?.onError?.(error),
    });
    return true;
  } catch (error) {
    callbacks?.onError?.(error instanceof Error ? error : new Error(String(error)));
    callbacks?.onEnd?.();
    return false;
  }
}

/**
 * Play the recording THROUGH the effects, without rebuilding it.
 *
 * The difference from `playRecordedVoice` is the whole point of the effects panel:
 * the samples are the file, and the pitch, pace, character and three resonance bands
 * are applied to those samples by the Web Audio graph. Nothing is re-segmented,
 * re-timed or re-joined, so the sentence keeps its own rhythm and every sound keeps
 * the length it had in it.
 *
 * What this path cannot do is change *words*: an accent is a rule over a phone
 * stream, and there is no phone stream here, only audio. Those controls need the
 * generated path and are labelled as such in the panel.
 */
export async function playRecordedWithEffects(
  model: VoiceModelConfig,
  callbacks?: SpeechCallbacks,
): Promise<boolean> {
  try {
    const buffer = await resolveBufferForModel(model);
    // A neutral voice is the file, so play the file: no graph, no rounding. The
    // filters at 0 dB are a no-op in theory and a rounding step in practice, and
    // "the original, unchanged" should not depend on which.
    if (dspConfigChangesNothing(dspConfigFor(model))) {
      playBufferUntouched(buffer, {
        onStart: () => callbacks?.onStart?.(),
        onEnded: () => callbacks?.onEnd?.(),
        onError: (error) => callbacks?.onError?.(error),
      });
      return true;
    }
    playTransformedVoice(buffer, dspConfigFor(model), {
      onStart: () => callbacks?.onStart?.(),
      onEnded: () => callbacks?.onEnd?.(),
      onError: (error) => callbacks?.onError?.(error),
    });
    return true;
  } catch (error) {
    callbacks?.onError?.(error instanceof Error ? error : new Error(String(error)));
    callbacks?.onEnd?.();
    return false;
  }
}

/**
 * Does this voice need the generated path at all?
 *
 * A voice is the recording unless something about it changes *words*: an accent
 * (a rule over phones) or the Vocalis rhythm engine (`referenceRaw === false`).
 * Pitch, pace, volume, delivery character and the three resonance bands are sound,
 * and sound is applied to the recording file itself by the Web Audio graph.
 *
 * This is the switch every audition button uses, so a voice that only changes sound
 * is heard on the file — never on a rebuild.
 */
export function voiceNeedsGeneration(model: VoiceModelConfig): boolean {
  return model.referenceRaw === false || model.accent === 'UK' || model.accent === 'AU';
}

/** Why a voice needs the generated path, in the words the interface uses. */
export function generationReason(model: VoiceModelConfig): string | null {
  if (model.accent === 'UK') return 'British accent';
  if (model.accent === 'AU') return 'Australian accent';
  if (model.referenceRaw === false) return 'rhythm engine';
  return null;
}

/**
 * Audition a voice the way it is defined.
 *
 * One entry point for every list in the app — predefined, library, shaper — so they
 * cannot drift apart and send a sound-only voice down the rebuild path. A voice that
 * only changes sound plays the recording through the effect graph; a voice that
 * changes words (accent, rhythm) renders the text, because there is no other way to
 * hear it.
 *
 * Returns 'recording' or 'generated' so callers can label which one ran.
 */
export async function auditionVoice(
  model: VoiceModelConfig,
  callbacks?: SpeechCallbacks,
): Promise<'recording' | 'generated'> {
  void generationReason(model); // keeps the reason and the switch on one definition
  if (voiceNeedsGeneration(model)) {
    await speakRealWords(model.samplePhrase, model, {
      onStart: () => callbacks?.onStart?.(),
      onEnd: () => callbacks?.onEnd?.(),
      onError: (error) => callbacks?.onError?.(error),
    });
    return 'generated';
  }
  await playRecordedWithEffects(model, callbacks);
  return 'recording';
}

/** The recording a profile is built from: its id, sentence and duration. */
export function recordingFor(
  model: VoiceModelConfig,
): { id: string; transcript: string; name: string; speaker: string; url: string } {
  const sample =
    NATURAL_HUMAN_SAMPLES.find((entry) => entry.id === model.baseSampleId) || NATURAL_HUMAN_SAMPLES[0];
  return {
    id: sample.id,
    transcript: sample.transcript,
    name: sample.name,
    speaker: sample.speaker,
    url: sample.url,
  };
}

/** Release every object URL held by a conversation render. */
export function releaseDialogue(render: DialogueRender | null): void {
  if (!render) return;
  render.lines.forEach((line) => releaseSynthesis(line.result));
  releaseSynthesis(render);
}

// ---------------------------------------------------------------------------
// Source-recording audition (a separate, labelled feature)
// ---------------------------------------------------------------------------

let userRecordedAudioBuffer: AudioBuffer | null = null;

export function setUserAudioBuffer(buffer: AudioBuffer | null): void {
  userRecordedAudioBuffer = buffer;
}

export function getUserAudioBuffer(): AudioBuffer | null {
  return userRecordedAudioBuffer;
}

/** Resolve the reference recording for a profile, or the user's own upload. */
export async function resolveBufferForModel(model: VoiceModelConfig): Promise<AudioBuffer> {
  if (model.baseSampleId === 'custom-user' && userRecordedAudioBuffer) {
    return userRecordedAudioBuffer;
  }
  const sample =
    NATURAL_HUMAN_SAMPLES.find((entry) => entry.id === model.baseSampleId) || NATURAL_HUMAN_SAMPLES[0];
  return loadHumanVoiceBuffer(sample.url);
}

/**
 * Would this configuration leave the samples alone?
 *
 * Every field at the value that changes nothing: unity playback rate, unity gain,
 * the natural character, all three bands at 0 dB. When that is true the recording is
 * played directly instead of being taken through the graph.
 */
function dspConfigChangesNothing(config: VoiceDspConfig): boolean {
  return (
    Math.abs(config.pitch * config.rate - 1) < 1e-9 &&
    Math.abs(config.volume - 1) < 1e-9 &&
    (config.toneStyle ?? 'natural') === 'natural' &&
    Math.abs(config.throatWarmth ?? 0) < 1e-9 &&
    Math.abs(config.oralClarity ?? 0) < 1e-9 &&
    Math.abs(config.airPresence ?? 0) < 1e-9
  );
}

function dspConfigFor(model: VoiceModelConfig): VoiceDspConfig {
  return {
    pitch: model.pitch,
    rate: model.rate,
    volume: model.volume,
    toneStyle: model.toneStyle,
    throatWarmth: model.throatWarmth,
    oralClarity: model.oralClarity,
    airPresence: model.airPresence,
  };
}

/**
 * Play the ORIGINAL reference recording with the profile's effects applied.
 *
 * This is not text-to-speech and does not claim to be: it is the A/B tool that
 * lets you hear what a transformation did to a real human sentence. The words
 * are always the words of that recording.
 */
export async function auditionSourceRecording(
  model: VoiceModelConfig,
  callbacks?: { onStart?: () => void; onEnd?: () => void; onError?: (error: Error) => void },
): Promise<void> {
  try {
    const buffer = await resolveBufferForModel(model);
    playTransformedVoice(buffer, dspConfigFor(model), {
      onStart: () => callbacks?.onStart?.(),
      onEnded: () => callbacks?.onEnd?.(),
      onError: (error) => callbacks?.onError?.(error),
    });
  } catch (error) {
    const asError = error instanceof Error ? error : new Error(String(error));
    callbacks?.onError?.(asError);
    callbacks?.onEnd?.();
  }
}

/** Render the source-recording audition to a WAV, for comparison with speech. */
export async function renderSourceRecordingWav(
  model: VoiceModelConfig,
): Promise<{ audioUrl: string; duration: number }> {
  const buffer = await resolveBufferForModel(model);
  const { wavUrl, duration } = await renderTransformedWav(buffer, dspConfigFor(model));
  return { audioUrl: wavUrl, duration };
}

export { getDspAnalyser, isDspPlaying };
