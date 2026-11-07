/**
 * Vocalis speech synthesis — pipeline orchestrator.
 *
 * Text in, audio out, by way of the stages the product promises:
 *
 *   text
 *     -> textAnalysis        words, numbers, punctuation, phones, stress, accent
 *     -> segmentUtterance    one continuous stream, split only at full stops
 *     -> prosody             phrase position, phrase-final, question
 *     -> UNIT PATH (default) renderCmuDiphones: recorded CMU ARCTIC units
 *     -> MATHS PATH          buildPhoneSamples: formant synthesis (experimental)
 *     -> processCmuVoice     pitch, rate and character (unit path only)
 *     -> normalise + encode  the same samples feed preview and export
 *
 * The requested text determines the audio. There is no fixed demonstration
 * recording anywhere in this path: a word the dictionary does not know is
 * spelled out by our own grapheme rules and reported as a guess, and a recorded
 * unit that does not exist is substituted in a way that is counted and shown
 * rather than hidden.
 *
 * Original Vocalis code. The two synthesis methods are kept deliberately
 * separate: the recorded-unit path is the product, the mathematical path below
 * is a preserved experimental subsystem (see docs/VOICE_SYNTHESIS_RESEARCH.md).
 */
import type { VoiceModelConfig } from './naturalVoiceEngine';
import { processCmuVoice, renderCmuDiphones } from './cmuDiphoneSynthesizer';
import {
  VOWELS,
  analyzeText,
  segmentUtterance,
  preparePronunciation,
  savePronunciationHint,
  getPronunciationHints,
  removePronunciationHint,
  getDictionaryStats,
  type DictionaryStats,
  type PhoneToken,
  type Segment,
  type Stress,
  type Utterance,
} from './textAnalysis';

export {
  preparePronunciation,
  savePronunciationHint,
  getPronunciationHints,
  removePronunciationHint,
};

const SAMPLE_RATE = 16000;

/**
 * Longest render we will attempt.
 *
 * A ten-minute passage is a legitimate thing to ask a narrator to read, so the
 * limit exists to catch runaway input rather than to constrain a script. At
 * 16 kHz mono float that is about 38 MB of samples.
 */
const MAX_SYNTHESIS_SECONDS = 600;

/**
 * Phone classes used by the experimental mathematical synthesizer to decide how
 * to generate sound. Affricates sit with the fricatives here because they are
 * built from a frication burst; that is a generation detail, not a linguistic
 * claim, and it is deliberately separate from the classification the unit
 * synthesizer uses when choosing a neighbour.
 *
 * `VOWELS` comes from textAnalysis and does not contain AX. Nothing reaches this
 * file with AX in it: the analysis stage normalises that symbol to AH, which the
 * bundled dictionary also never emits.
 */
const VOICED_CONSONANTS = new Set(['B', 'D', 'G', 'JH', 'V', 'DH', 'Z', 'ZH', 'M', 'N', 'NG', 'L', 'R', 'W', 'Y']);
const STOP_CONSONANTS = new Set(['P', 'B', 'T', 'D', 'K', 'G']);
const FRICATIVES = new Set(['F', 'V', 'TH', 'DH', 'S', 'Z', 'SH', 'ZH', 'HH', 'CH', 'JH']);

type Formants = [number, number, number];
type WordProsody = { phrasePosition: number; phraseFinal: boolean; question: boolean };

const NEUTRAL_PROSODY: WordProsody = { phrasePosition: 0, phraseFinal: false, question: false };

// ---------------------------------------------------------------------------
// The preserved experimental formant synthesizer
// ---------------------------------------------------------------------------

const VOWEL_FORMANTS: Record<string, { start: Formants; end?: Formants }> = {
  AA: { start: [730, 1090, 2440] },
  AE: { start: [660, 1720, 2410] },
  AH: { start: [640, 1190, 2390] },
  AX: { start: [500, 1500, 2500] },
  AO: { start: [570, 840, 2410] },
  AW: { start: [570, 900, 2400], end: [700, 1350, 2500] },
  AY: { start: [700, 1200, 2450], end: [320, 2200, 3000] },
  EH: { start: [530, 1840, 2480] },
  ER: { start: [490, 1350, 1690] },
  EY: { start: [440, 2200, 2800], end: [350, 2050, 2800] },
  IH: { start: [390, 1990, 2550] },
  IY: { start: [270, 2290, 3010] },
  OW: { start: [460, 880, 2200], end: [360, 900, 2200] },
  OY: { start: [500, 870, 2400], end: [320, 2150, 2900] },
  UH: { start: [440, 1020, 2240] },
  UW: { start: [300, 870, 2240] },
};

function getFormants(phone: string, progress: number, genderScale: number, accent: VoiceModelConfig['accent']): Formants {
  const vowel = VOWEL_FORMANTS[phone];
  let formants: Formants;
  if (vowel) {
    const end = vowel.end || vowel.start;
    formants = vowel.start.map((start, i) => start + (end[i] - start) * progress) as Formants;
  } else {
    const consonantFormants: Record<string, Formants> = {
      M: [260, 1000, 2200], N: [300, 1500, 2500], NG: [280, 1200, 2200],
      L: [400, 1300, 2700], R: [400, 1300, 1650], W: [300, 800, 2200], Y: [300, 2200, 3000],
    };
    formants = consonantFormants[phone] || [500, 1500, 2500];
  }
  const accentShift = accent === 'UK' ? [1.01, 1.035, 1.01] : accent === 'AU' ? [1.04, 0.98, 1.02] : [1, 1, 1];
  return formants.map((value, index) => value * genderScale * accentShift[index]) as Formants;
}

function coarticulatedFormants(
  phone: string,
  progress: number,
  genderScale: number,
  accent: VoiceModelConfig['accent'],
  previousPhone?: string,
  nextPhone?: string,
): Formants {
  const current = getFormants(phone, progress, genderScale, accent);
  const blend = (from: Formants, to: Formants, amount: number): Formants =>
    from.map((value, index) => value + (to[index] - value) * amount) as Formants;
  const smooth = (value: number) => value * value * (3 - 2 * value);
  if (progress < 0.18 && previousPhone) {
    const from = getFormants(previousPhone, 1, genderScale, accent);
    return blend(from, current, smooth(progress / 0.18));
  }
  if (progress > 0.82 && nextPhone) {
    const to = getFormants(nextPhone, 0, genderScale, accent);
    return blend(current, to, smooth((progress - 0.82) / 0.18));
  }
  return current;
}

function phonemeDuration(phone: string, stress: string, rate: number, toneStyle: VoiceModelConfig['toneStyle'], phraseFinal = false): number {
  const base = VOWELS.has(phone) ? (stress === '1' ? 0.145 : stress === '2' ? 0.12 : 0.092) : STOP_CONSONANTS.has(phone) ? 0.065 : FRICATIVES.has(phone) ? 0.075 : 0.068;
  const styleRate = toneStyle === 'energetic' ? 1.12 : toneStyle === 'deep' ? 0.94 : 1;
  const phraseLengthening = phraseFinal && VOWELS.has(phone) ? 1.18 : 1;
  return base * phraseLengthening / Math.max(0.55, rate * styleRate);
}

function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff * 2 - 1;
  };
}

function glottalFlow(phase: number, openQuotient: number, closingFraction: number): number {
  if (phase >= openQuotient) return 0;
  const openingEnd = openQuotient * (1 - closingFraction);
  if (phase < openingEnd) return 0.5 - 0.5 * Math.cos(Math.PI * phase / openingEnd);
  const closingProgress = (phase - openingEnd) / Math.max(0.001, openQuotient - openingEnd);
  return 0.5 + 0.5 * Math.cos(Math.PI * closingProgress);
}

function fricationCenter(phone: string): number {
  if (phone === 'S' || phone === 'Z') return 5900;
  if (phone === 'SH' || phone === 'ZH') return 3100;
  if (phone === 'CH' || phone === 'JH') return 3400;
  if (phone === 'F' || phone === 'V') return 4300;
  if (phone === 'TH' || phone === 'DH') return 3900;
  return 1700;
}

function buildPhoneSamples(
  phone: string,
  stress: string,
  model: VoiceModelConfig,
  absoluteOffset: number,
  random: () => number,
  prosody: WordProsody = { phrasePosition: 0, phraseFinal: false, question: false },
  previousPhone?: string,
  nextPhone?: string,
): Float32Array {
  const style = model.toneStyle;
  const seconds = phonemeDuration(phone, stress, model.rate, style, prosody.phraseFinal);
  const length = Math.max(1, Math.floor(SAMPLE_RATE * seconds));
  const result = new Float32Array(length);
  const isVowel = VOWELS.has(phone);
  const isVoiced = isVowel || VOICED_CONSONANTS.has(phone);
  const genderScale = model.gender === 'Female' ? 1.08 : model.gender === 'Male' ? 0.94 : 1;
  const stylePitch = style === 'deep' ? 0.93 : style === 'energetic' ? 1.07 : 1;
  const basePitch = (model.gender === 'Male' ? 116 : model.gender === 'Female' ? 196 : 150) * model.pitch * stylePitch;
  const stressGain = stress === '1' ? 1 : stress === '2' ? 0.84 : 0.68;
  const openQuotient = style === 'whisper' ? 0.7 : style === 'energetic' ? 0.58 : 0.64;
  const closingFraction = style === 'whisper' ? 0.42 : style === 'energetic' ? 0.22 : 0.3;
  const formantBandwidths: Formants = [95, 125, 180];
  const formantWeights: Formants = [1, 0.72, 0.42];
  const formantY1: Formants = [0, 0, 0];
  const formantY2: Formants = [0, 0, 0];
  let phase = ((basePitch * absoluteOffset) / SAMPLE_RATE) % 1;
  let previousNoise = 0;
  let noiseY1 = 0;
  let noiseY2 = 0;
  let previousFlow = glottalFlow(phase, openQuotient, closingFraction);

  for (let i = 0; i < length; i++) {
    const t = i / length;
    const absoluteTime = (absoluteOffset + i) / SAMPLE_RATE;
    const edge = Math.min(1, (t * seconds) / 0.004, ((1 - t) * seconds) / 0.006);
    const envelope = Math.max(0, edge) * (isVowel ? stressGain : 0.48);
    let voicing = 0;
    let frication = 0;
    let burst = 0;

    if (isVoiced) {
      const stressPitch = stress === '1' ? 1.045 : stress === '2' ? 1.018 : 0.985;
      const localContour = style === 'robot' ? 1 : 1 + 0.035 * Math.sin(Math.PI * t) - 0.05 * t;
      const phraseDeclination = style === 'robot' ? 1 : 1 - 0.045 * prosody.phrasePosition;
      const boundaryMovement = prosody.phraseFinal && style !== 'robot' ? (prosody.question ? 0.1 : -0.075) * t : 0;
      const f0 = basePitch * stressPitch * localContour * phraseDeclination * (1 + boundaryMovement);
      const phaseStep = f0 / SAMPLE_RATE;
      const nextPhase = (phase + phaseStep) % 1;
      const nextFlow = glottalFlow(nextPhase, openQuotient, closingFraction);
      // The differentiated, asymmetrical glottal-flow pulse has a natural spectral tilt,
      // unlike a bank of perfectly phase-aligned sine waves.
      let excitation = (nextFlow - previousFlow) / Math.max(phaseStep, 0.001) * 0.008;
      phase = nextPhase;
      previousFlow = nextFlow;

      if (STOP_CONSONANTS.has(phone)) {
        if (t < 0.68) excitation *= isVowel ? 0.16 : 0.1;
        else if (t < 0.82) excitation += random() * 0.2 * (1 - (t - 0.68) / 0.14);
      }

      const aspiration = random() * (style === 'whisper' ? 0.12 : isVowel ? 0.012 : 0.035);
      voicing = (excitation + aspiration) * (isVowel ? 1 : 0.38);
    }

    if (FRICATIVES.has(phone) && (!isVoiced || style === 'whisper')) {
      const white = random();
      const highPassed = white - previousNoise * 0.82;
      previousNoise = white;
      const center = fricationCenter(phone);
      const bandwidth = phone === 'S' || phone === 'Z' ? 1500 : 1900;
      const radius = Math.exp(-Math.PI * bandwidth / SAMPLE_RATE);
      const angle = 2 * Math.PI * center / SAMPLE_RATE;
      const inputGain = (1 - radius) * (1 - radius);
      const filtered = inputGain * highPassed + 2 * radius * Math.cos(angle) * noiseY1 - radius * radius * noiseY2;
      noiseY2 = noiseY1;
      noiseY1 = filtered;
      const level = phone === 'S' || phone === 'Z' || phone === 'SH' || phone === 'ZH' ? 1.2 : 0.76;
      frication = filtered * level;
    }

    if (STOP_CONSONANTS.has(phone) || phone === 'CH' || phone === 'JH') {
      const releaseStart = phone === 'CH' || phone === 'JH' ? 0.2 : 0.68;
      if (t >= releaseStart && t < releaseStart + 0.13) {
        const releaseEnvelope = 1 - (t - releaseStart) / 0.13;
        burst = random() * 0.3 * releaseEnvelope;
      }
    } else if (!isVoiced && !FRICATIVES.has(phone)) {
      burst = random() * 0.025;
    }

    const formants = coarticulatedFormants(phone, t, genderScale, model.accent, previousPhone, nextPhone);
    let tractOutput = 0;
    for (let formant = 0; formant < 3; formant++) {
      const radius = Math.exp(-Math.PI * formantBandwidths[formant] / SAMPLE_RATE);
      const angle = 2 * Math.PI * formants[formant] / SAMPLE_RATE;
      const inputGain = (1 - radius) * (1 - radius);
      const filtered = inputGain * voicing
        + 2 * radius * Math.cos(angle) * formantY1[formant]
        - radius * radius * formantY2[formant];
      formantY2[formant] = formantY1[formant];
      formantY1[formant] = filtered;
      tractOutput += filtered * formantWeights[formant];
    }

    let sample = tractOutput + frication + burst;
    if (style === 'whisper') sample = sample * 0.65 + frication * 0.35;
    if (style === 'robot') sample *= 0.78 + 0.22 * Math.sin(2 * Math.PI * 32 * absoluteTime);
    if (style === 'radio') sample = Math.tanh(sample * 2.3) * 0.72;
    result[i] = sample * envelope;
  }
  return result;
}


// ---------------------------------------------------------------------------
// Joining generated phones, with their positions measured as we go
// ---------------------------------------------------------------------------

const JOIN_OVERLAP_SECONDS = 0.004;

/**
 * Join generated phone chunks with an equal-power crossfade and report where
 * each phone's midpoint landed.
 *
 * The overlap is short because these chunks are already continuous in phase and
 * amplitude; the crossfade exists to remove the seam, not to blur the join.
 * Midpoints are measured from the real write cursor, so timing comes from the
 * audio that was produced rather than from an estimate.
 */
function joinPhonesWithOffsets(chunks: Float32Array[]): { samples: Float32Array; midpoints: number[] } {
  if (!chunks.length) return { samples: new Float32Array(0), midpoints: [] };
  const overlap = Math.floor(SAMPLE_RATE * JOIN_OVERLAP_SECONDS);
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0) - overlap * Math.max(0, chunks.length - 1);
  const output = new Float32Array(Math.max(0, total));
  const midpoints: number[] = [];
  let cursor = 0;
  for (const chunk of chunks) {
    if (cursor === 0) {
      output.set(chunk);
      midpoints.push(Math.floor(chunk.length / 2));
      cursor = chunk.length;
      continue;
    }
    const blend = Math.min(overlap, cursor, chunk.length);
    const start = cursor - blend;
    for (let i = 0; i < blend; i += 1) {
      const phase = ((i + 1) / (blend + 1)) * (Math.PI / 2);
      output[start + i] = output[start + i] * Math.cos(phase) + chunk[i] * Math.sin(phase);
    }
    output.set(chunk.subarray(blend), cursor);
    cursor += chunk.length - blend;
    midpoints.push(Math.max(0, cursor - Math.floor(chunk.length / 2)));
  }
  return { samples: output, midpoints };
}

// ---------------------------------------------------------------------------
// Prosody, read from the text itself
// ---------------------------------------------------------------------------

/**
 * Work out, for each word, where it sits in its phrase, whether it ends the
 * phrase, and whether the phrase is a question.
 *
 * These three facts drive stress, phrase-final lengthening, declination and the
 * boundary tone. They come from the punctuation the writer typed, not from a
 * guess about the sentence.
 */
function buildWordProsody(utterance: Utterance, segments: Segment[]): WordProsody[] {
  const prosody: WordProsody[] = utterance.words.map(() => ({ ...NEUTRAL_PROSODY }));
  for (const segment of segments) {
    const span = Math.max(1, segment.wordEnd - segment.wordStart);
    const lastWord = utterance.words[segment.wordEnd];
    const question = segment.terminal === '?' ||
      (lastWord
        ? /[?]/.test(
            utterance.sourceText.slice(
              lastWord.charIndex + lastWord.charLength,
              lastWord.charIndex + lastWord.charLength + 4,
            ),
          )
        : false);
    for (let w = segment.wordStart; w <= segment.wordEnd && w < prosody.length; w += 1) {
      prosody[w] = {
        phrasePosition: Math.min(1, Math.max(0, (w - segment.wordStart) / span)),
        phraseFinal: w === segment.wordEnd,
        question,
      };
    }
  }
  return prosody;
}

// ---------------------------------------------------------------------------
// Levels and encoding
// ---------------------------------------------------------------------------

/**
 * Peak the output is allowed to reach, the most make-up gain we apply, and the
 * peak below which a render counts as silence rather than as something quiet
 * that needs lifting.
 *
 * The make-up cap exists so a near-silent render is not amplified into noise.
 * It has to be generous enough that both synthesis paths reach the same level:
 * the recorded-unit path arrives near the ceiling already, while the
 * experimental formant path builds its signal from narrow-band resonators and
 * arrives about four times quieter. At 1.8x the experimental path peaked around
 * 0.31 while the unit path peaked at 0.78, so switching methods changed the
 * loudness of a voice for no acoustic reason.
 */
const OUTPUT_CEILING = 0.78;
const MAX_MAKEUP_GAIN = 4;
const SILENCE_FLOOR = 0.02;

/**
 * Bring a render to a consistent peak and apply the profile's volume.
 *
 * Preview and export both consume the result of this function, so what you hear
 * is byte for byte what you download.
 */
export function normaliseSamples(
  samples: Float32Array,
  volume: number,
  volumeBypassed = false,
): Float32Array {
  // The Volume switch is a real bypass. Levelling the render to the output ceiling
  // is a stage of its own — measured on the reference sentence it lifts the
  // assembled recording by about 1 dB — so a voice file with Volume off has to
  // leave the samples at the level the units arrived at, not at ours.
  if (volumeBypassed) return Float32Array.from(samples);
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) peak = Math.max(peak, Math.abs(samples[i]));
  const makeup = peak >= SILENCE_FLOOR ? Math.min(MAX_MAKEUP_GAIN, OUTPUT_CEILING / peak) : 1;
  const level = Math.max(0, Math.min(1, volume));
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i] * makeup * level;
    out[i] = value > 1 ? 1 : value < -1 ? -1 : value;
  }
  return out;
}

/**
 * Encode mono float samples as a 16-bit PCM RIFF wave.
 *
 * Written from the RIFF/WAVE specification: a 44-byte canonical header (fmt
 * chunk, PCM tag 1, mono, 16 bits per sample) followed by little-endian
 * samples.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i] > 1 ? 1 : samples[i] < -1 ? -1 : samples[i];
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type SynthesisMethod = 'cmu-arctic' | 'formant';

export interface WordTiming {
  word: string;
  charIndex: number;
  charLength: number;
  /** Seconds from the start of the rendered audio. */
  start: number;
  end: number;
  /** True when the pronunciation was guessed by the grapheme rules. */
  guessed: boolean;
}

export interface SynthesisDiagnostics {
  method: SynthesisMethod;
  speaker: string | null;
  words: number;
  phones: number;
  segments: number;
  /** Exact recorded units used. */
  exactUnits: number;
  /** Half units assembled from the same speaker. */
  backoffUnits: number;
  /** Times the experimental synthesizer stood in for a missing unit. */
  fallbackPhones: number;
  missingPairs: string[];
  guessedWords: string[];
  rejectedTokens: string[];
  dictionary: DictionaryStats;
  sampleRate: number;
  durationSeconds: number;
  /** Fraction of the utterance carried by exact recorded units, 0..1. */
  recordedCoverage: number;
}

export interface SynthesisResult {
  /** Final mono audio: normalised, volume applied, identical for play and export. */
  samples: Float32Array;
  sampleRate: number;
  duration: number;
  wordTimings: WordTiming[];
  diagnostics: SynthesisDiagnostics;
  wavBlob: Blob;
  audioUrl: string;
}

/**
 * Turn measured phone midpoints into word start and end times.
 *
 * A diphone join lands exactly on a phone midpoint, so the boundary between two
 * phones is halfway between their midpoints. That gives a word's position
 * without any global rescaling, which is what made highlighted words drift away
 * from the audio as a passage got longer.
 */
function wordTimingsFrom(
  utterance: Utterance,
  phoneOffsets: number[],
  totalSamples: number,
  scale: number,
): WordTiming[] {
  const boundaryBefore = (index: number): number => {
    if (index <= 0) return 0;
    if (index >= phoneOffsets.length) return totalSamples;
    return (phoneOffsets[index - 1] + phoneOffsets[index]) / 2;
  };
  return utterance.words
    .filter((word) => word.phoneEnd > word.phoneStart)
    .map((word) => ({
      word: word.text,
      charIndex: word.charIndex,
      charLength: word.charLength,
      start: (boundaryBefore(word.phoneStart) / SAMPLE_RATE) * scale,
      end: (boundaryBefore(word.phoneEnd) / SAMPLE_RATE) * scale,
      guessed: word.guessed,
    }));
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

/** Silence between segments on the experimental path, which has no pause units. */
const SENTENCE_PAUSE_SECONDS = 0.26;

function emptyResult(method: SynthesisMethod, utterance: Utterance): SynthesisResult {
  const silence = new Float32Array(Math.floor(SAMPLE_RATE * 0.12));
  const samples = normaliseSamples(silence, 1);
  const wavBlob = encodeWav(samples, SAMPLE_RATE);
  return {
    samples,
    sampleRate: SAMPLE_RATE,
    duration: samples.length / SAMPLE_RATE,
    wordTimings: [],
    diagnostics: {
      method,
      speaker: null,
      words: 0,
      phones: 0,
      segments: 0,
      exactUnits: 0,
      backoffUnits: 0,
      fallbackPhones: 0,
      missingPairs: [],
      guessedWords: utterance.guessedWords,
      rejectedTokens: utterance.rejectedTokens,
      dictionary: getDictionaryStats(),
      sampleRate: SAMPLE_RATE,
      durationSeconds: samples.length / SAMPLE_RATE,
      recordedCoverage: 0,
    },
    wavBlob,
    audioUrl: URL.createObjectURL(wavBlob),
  };
}

/**
 * Speak `text` in `model`'s voice.
 *
 * One render feeds everything: the preview player, the word highlighting and the
 * downloadable WAV are all built from the same `samples` array, so there is no
 * way for the export to differ from what was heard.
 */
export async function synthesizeText(text: string, model: VoiceModelConfig): Promise<SynthesisResult> {
  const method: SynthesisMethod = model.synthesisMethod ?? 'cmu-arctic';
  const utterance = await analyzeText(text, model.accent);
  const segments = segmentUtterance(utterance);
  const prosody = buildWordProsody(utterance, segments);

  if (!utterance.phones.length) return emptyResult(method, utterance);

  const random = makeRandom(0x564f4341);
  // The experimental synthesizer receives a neutral profile: pitch and rate
  // belong to the transformation stage, so applying them twice would compound.
  const fallbackModel: VoiceModelConfig = { ...model, pitch: 1, rate: 1, volume: 1, toneStyle: 'natural' };
  const mathematicalPhone = (
    phone: string,
    stress: Stress,
    offset: number,
    wordProsody: WordProsody,
    previous?: string,
    next?: string,
  ) => buildPhoneSamples(phone, stress, fallbackModel, offset, random, wordProsody, previous, next);

  let raw: Float32Array;
  let phoneOffsets: number[];
  let speaker: string | null = null;
  let exactUnits = 0;
  let backoffUnits = 0;
  let fallbackPhones = 0;
  let missingPairs: string[] = [];

  if (method === 'cmu-arctic') {
    const rendered = await renderCmuDiphones(
      segments.map((segment) => ({
        phones: segment.phones,
        terminal: segment.terminal,
      })),
      model,
      (phone, offset) => mathematicalPhone(phone, '0', offset, NEUTRAL_PROSODY),
      0,
    );
    raw = rendered.samples;
    phoneOffsets = rendered.phoneOffsets;
    speaker = rendered.speaker;
    exactUnits = rendered.diagnostics.exactUnits;
    backoffUnits = rendered.diagnostics.backoffUnits;
    fallbackPhones = rendered.diagnostics.fallbackPhones;
    missingPairs = rendered.diagnostics.missingPairs;
  } else {
    const pieces: Float32Array[] = [];
    const offsets: number[] = [];
    let cursor = 0;
    segments.forEach((segment, segmentIndex) => {
      const chunks = segment.phones.map((token: PhoneToken, position: number) => {
        const previous = position > 0 ? segment.phones[position - 1].phone : undefined;
        const next = position + 1 < segment.phones.length ? segment.phones[position + 1].phone : undefined;
        return mathematicalPhone(
          token.phone,
          token.stress,
          cursor,
          prosody[token.wordIndex] ?? NEUTRAL_PROSODY,
          previous,
          next,
        );
      });
      const joined = joinPhonesWithOffsets(chunks);
      for (const midpoint of joined.midpoints) offsets.push(cursor + midpoint);
      pieces.push(joined.samples);
      cursor += joined.samples.length;
      if (segmentIndex < segments.length - 1) {
        const pause = new Float32Array(Math.floor(SAMPLE_RATE * SENTENCE_PAUSE_SECONDS));
        pieces.push(pause);
        cursor += pause.length;
      }
    });
    const totalLength = pieces.reduce((sum, piece) => sum + piece.length, 0);
    raw = new Float32Array(totalLength);
    let write = 0;
    for (const piece of pieces) {
      raw.set(piece, write);
      write += piece.length;
    }
    phoneOffsets = offsets;
  }

  if (raw.length / SAMPLE_RATE > MAX_SYNTHESIS_SECONDS) {
    throw new Error(`Rendered audio exceeds ${MAX_SYNTHESIS_SECONDS} seconds. Split the text into shorter passages.`);
  }

  const processed = method === 'cmu-arctic' ? processCmuVoice(raw, model) : raw;
  const scale = raw.length ? processed.length / raw.length : 1;
  const samples = normaliseSamples(processed, model.volume, model.bypass?.volume === true);
  const duration = samples.length / SAMPLE_RATE;
  const wordTimings = wordTimingsFrom(utterance, phoneOffsets, raw.length, scale);
  const wavBlob = encodeWav(samples, SAMPLE_RATE);

  const unitTotal = exactUnits + backoffUnits + fallbackPhones;
  return {
    samples,
    sampleRate: SAMPLE_RATE,
    duration,
    wordTimings,
    diagnostics: {
      method,
      speaker,
      words: utterance.words.length,
      phones: utterance.phones.length,
      segments: segments.length,
      exactUnits,
      backoffUnits,
      fallbackPhones,
      missingPairs,
      guessedWords: utterance.guessedWords,
      rejectedTokens: utterance.rejectedTokens,
      dictionary: getDictionaryStats(),
      sampleRate: SAMPLE_RATE,
      durationSeconds: duration,
      recordedCoverage: unitTotal ? exactUnits / unitTotal : 0,
    },
    wavBlob,
    audioUrl: URL.createObjectURL(wavBlob),
  };
}

/** Release the object URL of a render that is no longer needed. */
export function releaseSynthesis(result: SynthesisResult | null): void {
  if (result?.audioUrl) URL.revokeObjectURL(result.audioUrl);
}

// ---------------------------------------------------------------------------
// Compatibility surface
// ---------------------------------------------------------------------------

/** Warm the dictionary and the pronunciation hints before the first render. */
export function preparePronunciationDictionary(): Promise<void> {
  return preparePronunciation();
}

/** Older name for `savePronunciationHint`, kept so existing callers do not break. */
export async function savePronunciationSpelling(word: string, spelling: string): Promise<void> {
  await savePronunciationHint(word, spelling);
}
