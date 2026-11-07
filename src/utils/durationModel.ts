/**
 * How long each phone should last.
 *
 * The recorded units all keep the length they happened to be recorded at, so a
 * render inherits whatever pace the corpus fragments were cut from. Measured on
 * two intact reference recordings against this engine speaking the same words:
 *
 *   "Author of the danger trail, Philip Ross."   human 2.91 s, engine 3.42 s
 *   "There had been no thawing spring, ..."      human 2.78 s, engine 5.36 s
 *
 * The engine spends 134-143 ms per phone on both sentences; the human spends 121
 * ms on the first and 69 ms on the second. That is the drag: a short dramatic
 * sentence is nearly right, and a long flowing one takes almost twice as long as
 * it should, because nothing in the render knows that a consonant inside a
 * cluster or a vowel nobody stresses is supposed to be brief.
 *
 * This module decides how long each phone should be. It is a pure function of the
 * phone stream and one measured table, so the targets can be checked without
 * rendering audio, and fitted against the recordings above.
 *
 * The table comes from the speaker's own pack. v1 cut every unit from the midpoint
 * of one phone to the midpoint of the next, and the corpus labels are contiguous,
 * so a unit of L samples is exactly one observation of
 *
 *     L = (duration of the left phone + duration of the right phone) / 2
 *
 * which solves for all 41 phones by least squares. One wrinkle has to be undone
 * first: v1 kept only the best-scoring candidate per pair, and its score preferred
 * units near a 160 ms ideal, so units of that length are over-represented. Solving
 * on the units that sit more than 15 % away from that ideal - the ones the
 * preference could not have pulled - gives a table that fits its own observations
 * better (median error 11.2 ms against 17.0 ms) and reads 117 ms mean against
 * 132 ms. Both solves are recorded in the manifest; this model uses the honest one.
 */

import { PAUSE, VOWELS, type BoundaryKind, type Stress } from './textAnalysis';

/** Intrinsic duration per phone, in seconds, measured from one speaker's pack. */
export type IntrinsicDurations = Record<string, number>;

/** A phone as the duration model needs to see it. Extra fields are ignored. */
export interface PlanPhone {
  phone: string;
  stress?: Stress;
  /** Index of the word this phone belongs to, when the caller knows it. */
  wordIndex?: number;
  /** Set when an accent rule lengthened this vowel. */
  long?: boolean;
  /** The spoken word this phone belongs to, when the caller knows it. */
  word?: string;
}

/** A sentence-worth of phones, matching the shape the unit assembler accepts. */
export interface PlanSegment {
  phones: PlanPhone[];
  /** Boundary strength after each phone; undefined where no word ends. */
  boundaries?: Array<BoundaryKind | undefined>;
}

export interface PhoneTarget {
  phone: string;
  stress: Stress;
  /** The spoken word this phone belongs to, when the caller supplied it. */
  word?: string;
  /** Target duration in seconds, after every multiplier and clamp. */
  seconds: number;
  /** The speaker's own measured duration for this phone, before multipliers. */
  intrinsicSeconds: number;
  /** Product of every multiplier applied, so a target can be traced back. */
  scale: number;
  /** Size of the consonant run this phone sits in; 0 for a vowel. */
  cluster: number;
  /** True when the phone was not in the measured table and a default was used. */
  defaulted: boolean;
}

export interface DurationPlan {
  /** One entry per segment, one target per phone, in order. */
  segments: PhoneTarget[][];
  /** Every target in one flat list, in speaking order. */
  phones: PhoneTarget[];
  /** Sum of the targets, in seconds. Pauses between segments are not included. */
  totalSeconds: number;
  /** Targets that hit a clamp. */
  clamped: number;
  /** Phones that were not in the measured table. */
  defaulted: number;
}

/**
 * Every relative factor the model applies, in one place, so they can be fitted
 * against measured speech instead of being scattered through the arithmetic.
 */
export interface DurationWeights {
  /** Vowel stress. The ratio between these is the rhythm; the values are not sacred. */
  stressPrimary: number;
  stressSecondary: number;
  stressReduced: number;
  /** An accent rule that marked a vowel long gets the time it asked for. */
  accentLong: number;
  /** Consonants. */
  wordFinal: number;
  onset: number;
  /** A consonant run of two, three, or four and more. Clusters compress hard: a
   *  stop in "pitted" is a fraction of the same stop between two vowels. */
  clusterTwo: number;
  clusterThree: number;
  clusterMany: number;
  /** Lengthening before a boundary, which belongs to the last vowel of the phrase. */
  clauseFinal: number;
  sentenceFinal: number;
  /** How much of that lengthening a consonant after the vowel gets. */
  boundaryConsonantShare: number;
  /** Closed-class words: the whole word is spoken this much tighter. */
  functionWord: number;
  /** Global pace, fitted to the intact reference recordings. */
  pace: number;
}

/**
 * The fitted defaults. `pace` and the cluster factors were chosen by grid search
 * against four measured totals - both bundled reference sentences, read by both
 * bundled speakers - which is the only human timing data in the repository. The
 * fit is reported by `tests/renderSpeech.test.ts` so the numbers stay checked
 * rather than merely remembered.
 *
 * Fitted on all four readings, the plan lands at:
 *
 *   slt a0001   2.66 s against the human 2.91 s   (-9%)
 *   slt a0003   3.15 s against the human 2.78 s   (+13%)
 *   bdl a0001   2.58 s against the human 2.97 s   (-13%)
 *   bdl a0003   3.21 s against the human 3.15 s   (+2%)
 *
 * Leave-one-out - fit on three readings, predict the fourth - gives a worst
 * held-out error of 20 %, against 62 % for the same model with no multipliers at
 * all, so the structure is doing the work rather than four numbers being
 * memorised. The cluster and boundary factors came out identical in every fold;
 * only `stressPrimary` and `pace` trade against each other, since both scale the
 * total.
 */
export const DEFAULT_WEIGHTS: DurationWeights = {
  stressPrimary: 1.9,
  stressSecondary: 1.0,
  stressReduced: 0.38,
  accentLong: 1.18,
  wordFinal: 1.1,
  onset: 0.95,
  clusterTwo: 0.9,
  clusterThree: 0.35,
  clusterMany: 0.25,
  clauseFinal: 1.16,
  sentenceFinal: 1.8,
  boundaryConsonantShare: 0.5,
  functionWord: 0.6,
  pace: 0.9,
};

export interface DurationOptions {
  /**
   * Overall tempo, the same way the rest of the engine means it: 1.4 speaks a
   * fifth faster and 0.8 a quarter slower, so it divides the planned durations.
   */
  rate?: number;
  /** Override any of the relative factors, for fitting and for tests. */
  weights?: Partial<DurationWeights>;
}

/**
 * Hard bounds. Anything outside them is a click or a drawl, not a phone.
 *
 * The floor was 22 ms until a listener reported words they could not recognise,
 * and the arithmetic agreed: at 22 ms a phone the pack recorded at 100 ms has to
 * be squeezed to under a quarter of itself, and a third of the halves in a long
 * passage ended up there. Forty-five milliseconds is the bottom of what English
 * does with a reduced vowel in a closed-class word, and raising the floor to it
 * moved a 326-word passage from 34% of its halves squeezed to 29%, its mean
 * squeeze from 0.76 of the recording to 0.80, and its total from 106 s to 112 s.
 * The price is on the sentence with the most reduced syllables in it, which is
 * now planned 28% longer than the human reading of it instead of 18%; that
 * sentence is the one the pack's units are least able to serve, because every one
 * of its function words was recorded at conversational-plus length.
 */
export const MIN_PHONE_SECONDS = 0.045;
export const MAX_PHONE_SECONDS = 0.4;

/** How a phone is made, which is what decides how short it may safely be. */
export type PhoneClass = 'fricative' | 'stop' | 'nasal' | 'glide' | 'vowel';

const FRICATIVES = new Set(['S', 'SH', 'Z', 'ZH', 'F', 'V', 'TH', 'DH', 'HH', 'CH', 'JH']);
const STOPS = new Set(['P', 'T', 'K', 'B', 'D', 'G']);
const NASALS = new Set(['M', 'N', 'NG']);
const GLIDES = new Set(['L', 'R', 'W', 'Y']);

/** The class of an ARPAbet phone, for the floors below and for the tests. */
export function phoneClass(phone: string): PhoneClass {
  const bare = phone.toUpperCase();
  if (FRICATIVES.has(bare)) return 'fricative';
  if (STOPS.has(bare)) return 'stop';
  if (NASALS.has(bare)) return 'nasal';
  if (GLIDES.has(bare)) return 'glide';
  return 'vowel';
}

/**
 * The shortest a phone of each class may be planned, in seconds.
 *
 * One floor for everything is wrong in a way a listener can name. The factors
 * here were fitted to two recorded sentences, and the way they reached those
 * totals was by squeezing consonants in clusters to a quarter of their measured
 * length: /s/ in "spring" came out at 31 ms, and a 31 ms fricative has neither
 * the noise nor the duration that makes it an /s/. The share of a render's energy
 * above 2.5 kHz - which is where every fricative lives, and where the difference
 * between "spring" and "ping" lives - measured 0.21% against 0.32% in the human
 * reading of the same sentence.
 *
 * Sixty milliseconds is the bottom of the range English gives a fricative inside a
 * cluster, fifty is enough for a nasal or a glide to be itself, and a stop may go
 * shorter because its identity is in its burst rather than in its length. With
 * these floors the same sentence plans its fricatives at 71 ms mean and 60 ms
 * minimum, its high-frequency share recovers, and its total moves from 27% over
 * the human reading to 29% over: two percentage points of pace bought back the
 * consonants, which is the trade this engine should make.
 */
export const MIN_SECONDS_BY_CLASS: Record<PhoneClass, number> = {
  fricative: 0.06,
  stop: 0.045,
  nasal: 0.05,
  glide: 0.05,
  vowel: MIN_PHONE_SECONDS,
};

/** Used only for a phone the pack never measured. */
export const FALLBACK_PHONE_SECONDS = 0.12;

/**
 * Closed-class words, which English reduces in connected speech.
 *
 * The dictionary gives citation forms: "and" is AE1 N D, "there" is DH EH1 R,
 * "was" is W AA1 Z. Read at that stress inside a sentence they are wrong, and
 * the error compounds with every function word - which is why a flowing sentence
 * like "There had been no thawing spring, and the ice was deeply pitted" (six of
 * them) drags far more than a short emphatic one like "Author of the danger
 * trail, Philip Ross." (two). Measured: the human reads the first at 69 ms per
 * phone and the second at 121 ms, while this engine held both at 134-143 ms.
 *
 * The list is deliberately small and closed. It reduces vowels that the
 * dictionary marks stressed and tightens the word a little; it never touches a
 * content word, so an emphasised reading still gets its time.
 */
export const FUNCTION_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'could', 'did', 'do',
  'does', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'him', 'his', 'i', 'if', 'in', 'is',
  'it', 'its', 'me', 'my', 'of', 'on', 'or', 'our', 'she', 'so', 'some', 'than', 'that', 'the',
  'their', 'them', 'then', 'there', 'they', 'to', 'us', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'who', 'will', 'with', 'would', 'you', 'your',
]);

/** How a closed-class word is spoken: its stressed vowels lose the stress. */
export const FUNCTION_WORD_STRESS: Stress = '0';

const isVowel = (phone: string): boolean => VOWELS.has(phone.toUpperCase());

/**
 * The measured table is keyed the way the pack keys its units - lowercase, with
 * the schwa written the way the corpus writes it. The phone stream arrives in
 * dictionary case. Looking one up with the other silently misses every phone and
 * quietly substitutes the fallback, so the normalisation happens once, here.
 */
export function intrinsicKey(phone: string): string {
  const bare = phone.toUpperCase().replace(/[012]$/, '');
  return (bare === 'AX' ? 'AH' : bare).toLowerCase();
}

/**
 * A representative intrinsic duration, for phones the table does not cover.
 * The median rather than the mean, so one long pause unit cannot lift it.
 */
export function fallbackIntrinsic(intrinsic: IntrinsicDurations): number {
  const values = Object.entries(intrinsic)
    .filter(([phone]) => intrinsicKey(phone) !== PAUSE)
    .map(([, seconds]) => seconds)
    .sort((a, b) => a - b);
  if (!values.length) return FALLBACK_PHONE_SECONDS;
  return values[Math.floor(values.length / 2)];
}

/**
 * Size of the run of consonants this phone sits in, counting across word
 * boundaries: people do not stop clustering at a space, and "spring, and" is one
 * four-consonant run in the mouth even though it is two words on the page.
 */
export function consonantRun(phones: PlanPhone[], index: number): number {
  if (isVowel(phones[index]?.phone ?? '')) return 0;
  let size = 1;
  for (let i = index - 1; i >= 0 && !isVowel(phones[i].phone); i -= 1) size += 1;
  for (let i = index + 1; i < phones.length && !isVowel(phones[i].phone); i += 1) size += 1;
  return size;
}

/**
 * Plan how long every phone in the stream should be.
 *
 * The plan is deliberately independent of the recorded units: it says what the
 * speaker ought to spend on each phone, and the assembler's job is then to make
 * the audio fit it. Keeping the two apart is what lets one phone be shortened
 * without dragging its neighbour down with it.
 */
export function planDurations(
  segments: PlanSegment[],
  intrinsic: IntrinsicDurations,
  options: DurationOptions = {},
): DurationPlan {
  const weights: DurationWeights = { ...DEFAULT_WEIGHTS, ...(options.weights ?? {}) };
  const rate = options.rate && options.rate > 0 ? options.rate : 1;
  const fallback = fallbackIntrinsic(intrinsic);
  const planned: PhoneTarget[][] = [];
  const flat: PhoneTarget[] = [];
  let total = 0;
  let clamped = 0;
  let defaulted = 0;

  for (const segment of segments) {
    const phones = segment.phones ?? [];
    const targets: PhoneTarget[] = [];

    for (let index = 0; index < phones.length; index += 1) {
      const token = phones[index];
      const phone = token.phone;
      const stress: Stress = token.stress ?? '0';
      const measured = intrinsic[intrinsicKey(phone)];
      const known = typeof measured === 'number' && measured > 0;
      const base = known ? measured : fallback;
      if (!known) defaulted += 1;

      const next = phones[index + 1];
      const previous = phones[index - 1];
      const startsWord = token.wordIndex !== undefined && token.wordIndex !== previous?.wordIndex;
      const endsWord = token.wordIndex !== undefined && token.wordIndex !== next?.wordIndex;
      // The last phone of a segment ends a sentence even if the caller did not say so.
      const boundary: BoundaryKind | undefined =
        segment.boundaries?.[index] ?? (index === phones.length - 1 ? 'sentence' : undefined);
      const atBoundary = boundary === 'sentence' || boundary === 'clause';

      let scale = 1;
      const cluster = consonantRun(phones, index);
      // A closed-class word is spoken in its weak form, whatever the dictionary
      // says about the citation form.
      const closed = token.word !== undefined && FUNCTION_WORDS.has(token.word.toLowerCase());
      const effectiveStress: Stress = closed && stress === '1' ? FUNCTION_WORD_STRESS : stress;
      if (closed) scale *= weights.functionWord;

      if (cluster === 0) {
        // A vowel: stress decides, and a boundary lengthens the last one.
        scale *=
          effectiveStress === '1' ? weights.stressPrimary
            : effectiveStress === '2' ? weights.stressSecondary
              : weights.stressReduced;
        if (token.long) scale *= weights.accentLong;
        if (atBoundary) scale *= boundary === 'sentence' ? weights.sentenceFinal : weights.clauseFinal;
      } else {
        scale *=
          cluster === 1 ? 1
            : cluster === 2 ? weights.clusterTwo
              : cluster === 3 ? weights.clusterThree
                : weights.clusterMany;
        if (endsWord) scale *= weights.wordFinal;
        else if (startsWord) scale *= weights.onset;
        // A stop before another consonant gets no separate rule. Cluster
        // compression already covers it, and when the fit was offered both it
        // set this one to 1.0 in all four folds. An inert multiplier is the same
        // mistake as a slider that reaches nothing.
        if (atBoundary) {
          const factor = boundary === 'sentence' ? weights.sentenceFinal : weights.clauseFinal;
          const closesPhrase = phones.slice(index + 1).every((later) => !isVowel(later.phone));
          if (closesPhrase) scale *= 1 + (factor - 1) * weights.boundaryConsonantShare;
        }
      }

      scale *= weights.pace / rate;
      let seconds = base * scale;
      const floor = MIN_SECONDS_BY_CLASS[phoneClass(phone)];
      if (seconds < floor) {
        seconds = floor;
        clamped += 1;
      } else if (seconds > MAX_PHONE_SECONDS) {
        seconds = MAX_PHONE_SECONDS;
        clamped += 1;
      }

      const target: PhoneTarget = {
        phone,
        stress,
        word: token.word,
        seconds,
        intrinsicSeconds: base,
        scale,
        cluster,
        defaulted: !known,
      };
      targets.push(target);
      flat.push(target);
      total += seconds;
    }

    planned.push(targets);
  }

  return { segments: planned, phones: flat, totalSeconds: total, clamped, defaulted };
}

/** Per-phone targets for one flat phone list, for callers that have no segments. */
export function planPhoneSeconds(
  phones: PlanPhone[],
  intrinsic: IntrinsicDurations,
  options: DurationOptions = {},
): number[] {
  return planDurations([{ phones }], intrinsic, options).phones.map((target) => target.seconds);
}
