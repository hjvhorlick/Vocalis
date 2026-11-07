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
  throatWarmth?: number; // low-band resonance, -10 to +10 dB
  oralClarity?: number; // mid-band resonance, -10 to +10 dB
  airPresence?: number; // high-band resonance, -10 to +10 dB
}

export { ATTRIBUTION_DETAILS, NATURAL_HUMAN_SAMPLES };
export type { HumanVoiceSample };

/**
 * The shipped identities.
 *
 * Each one is a delivery preset over the real CMU ARCTIC recordings: a speaker
 * (BDL or SLT), a synthesis method, a pitch/rate/volume starting point and a
 * resonance character. They are not separate human beings and do not claim to
 * be. `synthesisMethod` and `baseVoiceId` are stated explicitly on every preset
 * so nothing is inferred from a gender label behind the scenes.
 */
export const PRESET_VOICE_MODELS: VoiceModelConfig[] = [
  {
    // First in the list because the app opens with `models[0]`: what a listener
    // hears before touching anything should be the recording with nothing done
    // to it, so that every other preset is a change they chose. Its phrase is
    // the sentence `cmu_slt_arctic_a0001.wav` contains, so the source audition
    // is an immediate A/B of the same words.
    id: 'studio-neutral',
    name: 'Studio Neutral (SLT)',
    archetype: 'The recording, unprocessed',
    description:
      'Pitch 1.00, pace 1.00, no delivery style, no resonance shift: the joined recordings and nothing between them and the listener. Judge the voice from this one — every other preset adds processing you can hear.',
    gender: 'Female',
    accent: 'US',
    flag: '🎚️',
    pitch: 1,
    rate: 1,
    volume: 1,
    toneStyle: 'natural',
    synthesisMethod: 'cmu-arctic',
    baseSampleId: 'cmu-slt-1',
    baseVoiceId: 'slt',
    throatWarmth: 0,
    oralClarity: 0,
    airPresence: 0,
    samplePhrase: 'Author of the danger trail, Philip Ross.',
    avatarColor: '#22c55e',
  },
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
    synthesisMethod: 'cmu-arctic',
    baseSampleId: 'cmu-slt-1',
    baseVoiceId: 'slt',
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
    description: 'Resonant, authoritative low register with powerful chest resonance.',
    gender: 'Male',
    accent: 'US',
    flag: '🎬',
    pitch: 0.72,
    rate: 0.9,
    volume: 1.0,
    toneStyle: 'deep',
    synthesisMethod: 'cmu-arctic',
    baseSampleId: 'cmu-bdl-1',
    baseVoiceId: 'bdl',
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
    description: 'Distinguished, articulate presence with focused throat resonance. Non-rhotic delivery approximated from a US recording.',
    gender: 'Male',
    accent: 'UK',
    flag: '🎩',
    pitch: 0.88,
    rate: 0.96,
    volume: 1.0,
    toneStyle: 'natural',
    synthesisMethod: 'cmu-arctic',
    baseSampleId: 'cmu-bdl-2',
    baseVoiceId: 'bdl',
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
    description: 'Graceful, crystal-clear articulation with heightened oral resonance. Non-rhotic delivery approximated from a US recording.',
    gender: 'Female',
    accent: 'UK',
    flag: '📖',
    pitch: 1.1,
    rate: 0.96,
    volume: 1.0,
    toneStyle: 'natural',
    synthesisMethod: 'cmu-arctic',
    baseSampleId: 'cmu-slt-2',
    baseVoiceId: 'slt',
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
    description: 'Brisk, punchy delivery with elevated pitch and crisp speech clarity.',
    gender: 'Male',
    accent: 'US',
    flag: '⚡',
    pitch: 1.12,
    rate: 1.15,
    volume: 1.0,
    toneStyle: 'energetic',
    synthesisMethod: 'cmu-arctic',
    baseSampleId: 'cmu-bdl-1',
    baseVoiceId: 'bdl',
    throatWarmth: -1,
    oralClarity: 5,
    airPresence: 4,
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#3b82f6',
  },
  {
    id: 'willow-calm',
    name: 'Willow (Mindfulness & Soft)',
    archetype: 'Gentle Meditation & Soft Presence',
    description: 'Soft, delicate contour shaped with air-presence filtering. This is a softened speaking voice, not a true whisper recording.',
    gender: 'Female',
    accent: 'US',
    flag: '🌿',
    pitch: 0.94,
    rate: 0.85,
    volume: 0.9,
    toneStyle: 'whisper',
    synthesisMethod: 'cmu-arctic',
    baseSampleId: 'cmu-slt-1',
    baseVoiceId: 'slt',
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
    description: 'Classic broadcast character with analogue bandpass filtering and gentle saturation.',
    gender: 'Male',
    accent: 'US',
    flag: '📻',
    pitch: 1.08,
    rate: 1.2,
    volume: 1.0,
    toneStyle: 'radio',
    synthesisMethod: 'cmu-arctic',
    baseSampleId: 'cmu-bdl-1',
    baseVoiceId: 'bdl',
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
    description: 'Deliberately synthetic character: ring-modulated resonance over a recorded voice.',
    gender: 'Neutral',
    accent: 'Global',
    flag: '🤖',
    pitch: 0.88,
    rate: 1.05,
    volume: 1.0,
    toneStyle: 'robot',
    synthesisMethod: 'cmu-arctic',
    baseSampleId: 'cmu-bdl-1',
    baseVoiceId: 'bdl',
    throatWarmth: 2,
    oralClarity: -3,
    airPresence: 4,
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#06b6d4',
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
