/**
 * Vocalis recorded-unit synthesizer — CMU ARCTIC diphone concatenation.
 *
 * The base voice. Speech is assembled from real recordings: the frozen packs in
 * `public/voicepacks/cmu-arctic/` hold time-aligned diphone units cut from CMU
 * ARCTIC 0.95 (see docs/BASE_VOICE_CONTRACT.md). Nothing in this file generates
 * a voice from a model; where a recording does not exist, the substitution is
 * counted and reported rather than hidden.
 *
 * How a diphone unit is defined, which decides everything below:
 *
 *   a unit `a|b` spans the MIDPOINT of phone `a` to the MIDPOINT of phone `b`,
 *   so it contains the second half of `a` and the first half of `b`.
 *
 * Therefore a phone sequence p0..pn is assembled as
 *
 *   [lead into p0] [p0|p1] [p1|p2] … [pn-1|pn] [tail out of pn]
 *
 * where the lead supplies the first half of p0 and the tail supplies the second
 * half of pn. That also gives the timing model: chunk i begins exactly on the
 * midpoint of phone i-1, so `crossfadeJoinWithOffsets` can report where every
 * phone landed and word highlighting can be measured rather than estimated.
 *
 * When a diphone is missing — the packs cover 79.5 % of the pairs a passage
 * needs — the transition is assembled from two half units of the SAME speaker:
 * the second half of `a` cut out of any `a|x` unit, and the first half of `b`
 * out of any `y|b` unit. `x` and `y` are chosen for how naturally they follow or
 * precede, by phone class and by how close the unit's own length is to the
 * corpus mean, so the borrowed audio is a transition that could really have
 * occurred. Only when no half unit exists does the caller's mathematical
 * synthesizer stand in, and that is counted in `diagnostics.fallbackPhones`.
 *
 * Original Vocalis code. The unit data is Carnegie Mellon University's; the
 * extraction tool is `scripts/build_cmu_voicepack.py`.
 */
import type { VoiceModelConfig } from './naturalVoiceEngine';
import { transformRecordedVoice } from './voiceTransform';

const SAMPLE_RATE = 16000;

/**
 * How much of a unit is one half-phone, and the bounds on that slice.
 *
 * A diphone is cut midpoint to midpoint, so a little under half of it belongs to
 * each phone; the exact split is not stored in the pack (that is Phase 3 work),
 * so a fixed fraction is used. The floor and ceiling keep a very short or very
 * long unit from producing a click or a drawl when it is borrowed.
 */
const HALF_UNIT_FRACTION = 0.45;
const HALF_UNIT_CEILING_SECONDS = 0.06;
const HALF_UNIT_FLOOR_SECONDS = 0.028;

/** Raised-cosine fade between units, and the shorter fade inside an assembled pair. */
const FADE_SECONDS = 0.018;
const HALF_UNIT_JOIN_SECONDS = 0.006;

/** Silence used when a segment cannot start or end on a recorded pause unit. */
const SEGMENT_EDGE_SILENCE_SECONDS = 0.09;

/** Corpus mean unit length, used to prefer a borrowed neighbour of normal size. */
const REFERENCE_UNIT_SECONDS = 0.135;

type PhoneClass =
  | 'silence' | 'vowel' | 'liquid' | 'nasal' | 'glide' | 'fricative' | 'stop' | 'affricate' | 'other';

interface UnitEntry {
  offset: number;
  length: number;
}

interface DiphoneManifest {
  format: string;
  speakerId: string;
  displayName?: string;
  sampleRate?: number;
  unitCount?: number;
  units: Record<string, UnitEntry>;
}

interface VoicePack {
  manifest: DiphoneManifest;
  samples: Int16Array;
  /** Keys grouped by their left phone, built once on first use. */
  byLeft: Map<string, string[]>;
  byRight: Map<string, string[]>;
}

export interface RenderDiagnostics {
  /** Joints filled by one exact recorded diphone. */
  exactUnits: number;
  /** Joints assembled from two half units of the same speaker. */
  backoffUnits: number;
  /** Joints where the caller's mathematical synthesizer stood in. */
  fallbackPhones: number;
  /** The diphone keys that were not in the pack. */
  missingPairs: string[];
  /** Every phone this render was asked to speak, in order. */
  phones: string[];
}

/** One sentence-worth of phones. Silence may only appear between segments. */
export interface SegmentInput {
  phones: Array<{ phone: string; stress?: string | number }>;
  /** The punctuation that ended this phrase, or '' when the text simply stopped. */
  terminal?: string;
}

/**
 * Called when no recorded audio exists for a transition. The synthesizer must
 * produce the phone itself; `absoluteOffset` keeps its phase continuous.
 */
export type FallbackPhone = (phone: string, absoluteOffset: number) => Float32Array;

export interface DiphoneRender {
  samples: Float32Array;
  speaker: 'slt' | 'bdl';
  diagnostics: RenderDiagnostics;
  /**
   * Sample offset of every phone's midpoint, indexed to match the concatenated
   * phone lists of the segments in the order they were passed.
   */
  phoneOffsets: number[];
  /** How many phones each segment contributed, for callers that need the split. */
  segmentPhoneCounts: number[];
}

const packs = new Map<'slt' | 'bdl', Promise<VoicePack>>();

/**
 * Which recorded speaker a profile is built from.
 *
 * The explicit `baseVoiceId` wins. Inferring the speaker from a gender label is
 * what let a Neutral profile silently become a female voice; the label is only a
 * fallback for profiles that predate the field.
 */
export function speakerForModel(model: VoiceModelConfig): 'slt' | 'bdl' {
  if (model.baseVoiceId === 'slt' || model.baseVoiceId === 'bdl') return model.baseVoiceId;
  // A voice that never says which recording it comes from still has to come from
  // one. Only an explicitly male identity is given the male speaker; everything
  // else, including a neutral one, resolves to SLT rather than being guessed at.
  return model.gender === 'Male' ? 'bdl' : 'slt';
}

async function loadVoicePack(speaker: 'slt' | 'bdl'): Promise<VoicePack> {
  const cached = packs.get(speaker);
  if (cached) return cached;
  const request = (async () => {
    const root = `/voicepacks/cmu-arctic/${speaker}`;
    const [manifestResponse, audioResponse] = await Promise.all([
      fetch(`${root}/manifest.json`),
      fetch(`${root}/diphones.bin`),
    ]);
    if (!manifestResponse.ok || !audioResponse.ok) {
      throw new Error(`Could not load the CMU ARCTIC ${speaker.toUpperCase()} voice pack.`);
    }
    const manifest = (await manifestResponse.json()) as DiphoneManifest;
    const buffer = await audioResponse.arrayBuffer();
    if (!manifest.units || !Object.keys(manifest.units).length) {
      throw new Error(`The CMU ARCTIC ${speaker.toUpperCase()} voice pack has no unit index.`);
    }
    const declared = manifest.unitCount ?? Object.keys(manifest.units).length;
    if (declared !== Object.keys(manifest.units).length) {
      console.warn(
        `Vocalis: the ${speaker.toUpperCase()} pack declares ${declared} units but indexes ${Object.keys(manifest.units).length}.`,
      );
    }
    // The index must fit inside the audio file, otherwise a truncated download
    // would read past the end and render silence or garbage.
    let furthest = 0;
    for (const entry of Object.values(manifest.units)) {
      furthest = Math.max(furthest, entry.offset + entry.length * 2);
    }
    if (buffer.byteLength < furthest) {
      throw new Error(
        `The CMU ARCTIC ${speaker.toUpperCase()} audio file is ${buffer.byteLength} bytes but its index needs ${furthest}.`,
      );
    }
    const byLeft = new Map<string, string[]>();
    const byRight = new Map<string, string[]>();
    for (const key of Object.keys(manifest.units)) {
      const [left, right] = key.split('|');
      if (!left || !right) continue;
      const lefts = byLeft.get(left);
      if (lefts) lefts.push(key);
      else byLeft.set(left, [key]);
      const rights = byRight.get(right);
      if (rights) rights.push(key);
      else byRight.set(right, [key]);
    }
    return { manifest, samples: new Int16Array(buffer), byLeft, byRight };
  })();
  packs.set(speaker, request);
  try {
    return await request;
  } catch (error) {
    // A failed load must not stay cached, so a later render can try again.
    packs.delete(speaker);
    throw error;
  }
}

/** Load a speaker's pack ahead of the first render, so playback does not stall. */
export function prepareCmuVoice(model: VoiceModelConfig): Promise<void> {
  return loadVoicePack(speakerForModel(model)).then(() => undefined);
}

export function isVoicePackLoaded(model: VoiceModelConfig): boolean {
  return packs.has(speakerForModel(model));
}

// ---------------------------------------------------------------------------
// Unit slices
// ---------------------------------------------------------------------------

/**
 * A unit's Int16 samples as floats in -1..1.
 *
 * The manifest stores `offset` in BYTES and `length` in SAMPLES, matching the
 * builder that wrote it; reading the offset as a sample index runs off the end
 * of the audio and fills the render with NaN.
 */
function toFloat(pack: VoicePack, entry: UnitEntry): Float32Array {
  const start = entry.offset / 2;
  const out = new Float32Array(entry.length);
  for (let i = 0; i < entry.length; i += 1) out[i] = pack.samples[start + i] / 32768;
  return out;
}

/** Raised-cosine fade in, so a borrowed half unit cannot click at its start. */
function fadeIn(chunk: Float32Array): Float32Array {
  const span = Math.min(chunk.length, Math.floor(SAMPLE_RATE * FADE_SECONDS));
  const out = Float32Array.from(chunk);
  for (let i = 0; i < span; i += 1) {
    out[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / Math.max(1, span));
  }
  return out;
}

/** Raised-cosine fade out. */
function fadeOut(chunk: Float32Array): Float32Array {
  const span = Math.min(chunk.length, Math.floor(SAMPLE_RATE * FADE_SECONDS));
  const out = Float32Array.from(chunk);
  for (let i = 0; i < span; i += 1) {
    out[out.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / Math.max(1, span));
  }
  return out;
}

function classOf(phone: string): PhoneClass {
  const p = phone.toLowerCase();
  if (p === 'pau' || p === 'sil' || p === '-') return 'silence';
  if (['aa', 'ae', 'ah', 'ao', 'aw', 'ay', 'eh', 'er', 'ey', 'ih', 'iy', 'ow', 'oy', 'uh', 'uw', 'ax'].includes(p)) return 'vowel';
  if (p === 'l' || p === 'r') return 'liquid';
  if (p === 'm' || p === 'n' || p === 'ng') return 'nasal';
  if (p === 'w' || p === 'y') return 'glide';
  if (p === 'ch' || p === 'jh') return 'affricate';
  if (['f', 'v', 'th', 'dh', 's', 'z', 'sh', 'zh', 'hh'].includes(p)) return 'fricative';
  if (['p', 'b', 't', 'd', 'k', 'g'].includes(p)) return 'stop';
  return 'other';
}

/**
 * Classes that naturally follow a given class in English.
 *
 * Used to pick which recording a half unit is borrowed from: a stop followed by
 * a vowel is an ordinary release, a stop followed by another stop is not, and
 * borrowing the wrong one puts a transition in the audio that the speaker never
 * actually produced.
 */
const NATURAL_FOLLOW: Record<PhoneClass, PhoneClass[]> = {
  silence: ['vowel', 'liquid', 'nasal', 'glide', 'fricative', 'stop', 'affricate', 'silence', 'other'],
  vowel: ['vowel', 'liquid', 'nasal', 'glide', 'fricative', 'stop', 'affricate', 'silence', 'other'],
  liquid: ['vowel', 'liquid', 'nasal', 'glide', 'fricative', 'stop', 'silence', 'other'],
  nasal: ['vowel', 'nasal', 'liquid', 'glide', 'fricative', 'stop', 'silence', 'other'],
  glide: ['vowel', 'liquid', 'glide', 'nasal', 'silence', 'other'],
  fricative: ['vowel', 'liquid', 'nasal', 'glide', 'fricative', 'stop', 'silence', 'other'],
  affricate: ['vowel', 'liquid', 'nasal', 'glide', 'silence', 'other'],
  stop: ['vowel', 'liquid', 'nasal', 'glide', 'stop', 'fricative', 'silence', 'other'],
  other: ['vowel', 'liquid', 'nasal', 'glide', 'fricative', 'stop', 'silence', 'other'],
};

/** How close a unit's own length is to the corpus mean, as a penalty. */
function lengthFit(unitLength: number): number {
  const seconds = unitLength / SAMPLE_RATE;
  return Math.abs(seconds - REFERENCE_UNIT_SECONDS) / REFERENCE_UNIT_SECONDS;
}

/** Lower is better: an unnatural class transition costs more than a length mismatch. */
function neighbourScore(left: string, right: string, unitLength: number): number {
  const natural = NATURAL_FOLLOW[classOf(left)] ?? [];
  const classPenalty = natural.includes(classOf(right)) ? 0 : 2;
  return classPenalty + lengthFit(unitLength);
}

/** How many samples of a unit belong to one half-phone. */
function halfLength(unitLength: number): number {
  const raw = Math.round(unitLength * HALF_UNIT_FRACTION);
  const floor = Math.floor(SAMPLE_RATE * HALF_UNIT_FLOOR_SECONDS);
  const ceiling = Math.floor(SAMPLE_RATE * HALF_UNIT_CEILING_SECONDS);
  return Math.max(Math.min(raw, Math.max(floor, Math.min(ceiling, unitLength))), Math.min(floor, unitLength));
}

/** The best `phone|x` key in the pack, or null when the phone never appears on the left. */
function pickRightNeighbour(pack: VoicePack, phone: string): string | null {
  const keys = pack.byLeft.get(phone);
  if (!keys || !keys.length) return null;
  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const key of keys) {
    const entry = pack.manifest.units[key];
    if (!entry || entry.length < 8) continue;
    const right = key.split('|')[1];
    const score = neighbourScore(phone, right, entry.length);
    if (score < bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}

/** The best `y|phone` key in the pack, or null when the phone never appears on the right. */
function pickLeftNeighbour(pack: VoicePack, phone: string): string | null {
  const keys = pack.byRight.get(phone);
  if (!keys || !keys.length) return null;
  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const key of keys) {
    const entry = pack.manifest.units[key];
    if (!entry || entry.length < 8) continue;
    const left = key.split('|')[0];
    const score = neighbourScore(left, phone, entry.length);
    if (score < bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}

/**
 * The SECOND half of a phone: the head of any recorded `phone|x` unit, because
 * such a unit starts exactly on the midpoint of `phone`.
 */
function outgoingHalfOf(pack: VoicePack, phone: string): Float32Array | null {
  const key = pickRightNeighbour(pack, phone);
  if (!key) return null;
  const entry = pack.manifest.units[key];
  const slice = toFloat(pack, entry);
  const half = Math.min(halfLength(entry.length), slice.length);
  return fadeIn(slice.subarray(0, half));
}

/**
 * The FIRST half of a phone: the tail of any recorded `y|phone` unit, because
 * such a unit ends exactly on the midpoint of `phone`.
 */
function incomingHalfOf(pack: VoicePack, phone: string): Float32Array | null {
  const key = pickLeftNeighbour(pack, phone);
  if (!key) return null;
  const entry = pack.manifest.units[key];
  const slice = toFloat(pack, entry);
  const half = Math.min(halfLength(entry.length), slice.length);
  return fadeOut(slice.subarray(Math.max(0, slice.length - half)));
}

function secondHalfOf(samples: Float32Array): Float32Array {
  return samples.subarray(Math.floor(samples.length / 2));
}

function firstHalfOf(samples: Float32Array): Float32Array {
  return samples.subarray(0, Math.ceil(samples.length / 2));
}

function silence(seconds: number): Float32Array {
  return new Float32Array(Math.max(0, Math.floor(SAMPLE_RATE * seconds)));
}

function concat(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Float32Array(total);
  let write = 0;
  for (const part of parts) {
    out.set(part, write);
    write += part.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Prosody for the recorded-unit path
// ---------------------------------------------------------------------------

/**
 * What the recorded-unit path is allowed to do about intonation.
 *
 * Every unit in the packs was cut from a different sentence, so each one carries
 * whatever pitch and timing its own sentence had. Glued together, those pitches
 * jump at random from unit to unit: measured on the reference sentence, the
 * finished render moves 0.89 semitones between neighbouring analysis frames
 * where the source recording moves 0.39 — twice the instability of a person,
 * before any profile touches it. That is heard as a waver, and it is why capping
 * the tone filters helped but did not cure the sound.
 *
 * So the units are re-pitched onto one smooth contour: each chunk is brought to a
 * common reference pitch (the median of its own voiced frames, so its internal
 * shape is kept) and then offset by an intended phrase contour — a gentle
 * declination, and a boundary tone that falls at a full stop and rises at a
 * question mark. Timing is not touched: every chunk is resampled and then
 * stretched back to exactly the length it had, so joins, word timings and the
 * render's duration are unchanged to the sample.
 */
const DECLINATION_START_ST = 1.2;
const DECLINATION_END_ST = -1.8;
const QUESTION_RISE_ST = 2.4;
const FINAL_FALL_ST = -0.8;
/** The most any chunk may move in total: about +/-4 semitones. */
const MIN_PROSODY_RATIO = 0.75;
const MAX_PROSODY_RATIO = 1.3;
/** Below a fifth of a semitone nothing is audible, and nothing is processed. */
const PROSODY_DEADBAND = 0.008;

/**
 * Median F0 of one chunk, from its own voiced frames, or 0 when it has none.
 *
 * Autocorrelation per 32 ms frame on 512-sample hops, frames below a floor
 * skipped so a pause unit reports "unvoiced" rather than dividing by noise. The
 * shortest lag within 95 % of the best wins, which is the usual guard against
 * locking onto a sub-octave.
 */
function medianChunkPitch(samples: Float32Array): number {
  const frame = 512;
  const shortest = Math.round(SAMPLE_RATE / 400);
  const longest = Math.round(SAMPLE_RATE / 70);
  const values: number[] = [];
  for (let start = 0; start + frame + longest <= samples.length; start += 512) {
    let energy = 0;
    for (let index = 0; index < frame; index += 1) energy += samples[start + index] * samples[start + index];
    if (energy / frame < 0.003) continue;
    let bestLag = 0;
    let bestScore = 0;
    for (let lag = shortest; lag <= longest; lag += 1) {
      let dot = 0;
      let left = 0;
      let right = 0;
      for (let index = 0; index + lag < frame; index += 1) {
        const a = samples[start + index];
        const b = samples[start + index + lag];
        dot += a * b;
        left += a * a;
        right += b * b;
      }
      const score = left > 0 && right > 0 ? dot / Math.sqrt(left * right) : 0;
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }
    if (bestLag === 0 || bestScore < 0.45) continue;
    for (let lag = shortest; lag < bestLag; lag += 1) {
      let dot = 0;
      let left = 0;
      let right = 0;
      for (let index = 0; index + lag < frame; index += 1) {
        const a = samples[start + index];
        const b = samples[start + index + lag];
        dot += a * b;
        left += a * a;
        right += b * b;
      }
      const score = left > 0 && right > 0 ? dot / Math.sqrt(left * right) : 0;
      if (score >= bestScore * 0.95) {
        bestLag = lag;
        break;
      }
    }
    values.push(SAMPLE_RATE / bestLag);
  }
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

/**
 * Give `shaped` the peak of `reference`, so a processing pass changes the shape
 * of a chunk and not its level.
 */
function matchPeak(reference: Float32Array, shaped: Float32Array): Float32Array {
  let before = 0;
  let after = 0;
  for (let index = 0; index < reference.length; index += 1) {
    const magnitude = Math.abs(reference[index]);
    if (magnitude > before) before = magnitude;
  }
  for (let index = 0; index < shaped.length; index += 1) {
    const magnitude = Math.abs(shaped[index]);
    if (magnitude > after) after = magnitude;
  }
  if (before <= 0 || after <= 0) return shaped;
  const scale = before / after;
  if (Math.abs(scale - 1) < 1e-4) return shaped;
  const output = new Float32Array(shaped.length);
  for (let index = 0; index < shaped.length; index += 1) output[index] = shaped[index] * scale;
  return output;
}

/** Where a chunk sits in its phrase, and what the phrase did at its end. */
interface ChunkProsody {
  /** 0 at the start of the phrase, 1 at its end. */
  position: number;
  final: boolean;
  question: boolean;
  /** 1 for a stressed vowel, 0 otherwise: stress gets a small lift of its own. */
  stress: number;
}

/**
 * Put every chunk on one contour.
 *
 * Chunks with no voiced frames (a pause unit, a lone fricative) are passed
 * through untouched and simply do not vote on the reference pitch.
 */
function applyProsody(chunks: Float32Array[], prosody: ChunkProsody[]): Float32Array[] {
  const pitches = chunks.map((chunk) => medianChunkPitch(chunk));
  const voiced = pitches.filter((pitch) => pitch > 0).sort((a, b) => a - b);
  if (!voiced.length) return chunks;
  const reference = voiced[Math.floor(voiced.length / 2)];

  // The boundary tone belongs to the last *voiced* chunk of a phrase. The tail
  // unit is the last phone fading into silence, and its median pitch is often
  // unavailable — the phrase then ended with no tone at all, which is how a
  // question could come out flat. Move the flag back to the last chunk that can
  // carry a pitch.
  for (let index = 0; index < chunks.length; index += 1) {
    if (!prosody[index]?.final) continue;
    let carrier = index;
    while (carrier > 0 && (pitches[carrier] <= 0 || !prosody[carrier])) {
      if (prosody[carrier - 1]?.final) break;
      carrier -= 1;
    }
    if (carrier !== index && prosody[carrier]) {
      prosody[carrier] = { ...prosody[carrier], final: true, question: prosody[index].question };
      prosody[index] = { ...prosody[index], final: false };
    }
  }
  return chunks.map((chunk, index) => {
    const measured = pitches[index];
    const meta = prosody[index];
    if (measured <= 0 || !meta) return chunk;
    let semitones = DECLINATION_START_ST + (DECLINATION_END_ST - DECLINATION_START_ST) * meta.position;
    semitones += 0.6 * meta.stress;
    // The boundary tone is not a step on the last unit: a rise or a fall in real
    // speech is carried by the last part of the phrase. Spreading it over the
    // final third also puts it where the ear expects it — on the last stressed
    // syllable — instead of on the 40 ms of vowel that happens to sit in the
    // closing unit.
    const boundaryRamp = meta.final ? 1 : Math.max(0, (meta.position - 0.68) / 0.32);
    semitones += boundaryRamp * (meta.question ? QUESTION_RISE_ST : FINAL_FALL_ST);
    // Two stages, because they fail differently. Bringing a unit onto the
    // reference pitch has to be bounded or a badly-matched unit would be moved a
    // fourth; the contour offset is small on purpose and must survive that bound,
    // otherwise a question ends exactly like a statement whenever its last unit
    // happens to sit far from the reference — which is what the first version of
    // this did.
    const normalise = Math.min(1.18, Math.max(0.85, reference / measured));
    const contour = Math.pow(2, semitones / 12);
    const factor = Math.min(MAX_PROSODY_RATIO, Math.max(MIN_PROSODY_RATIO, normalise * contour));
    if (Math.abs(factor - 1) < PROSODY_DEADBAND) return chunk;
    // Pitch, then length back to exactly what the join expects. Formant
    // preservation keeps the speaker's own vowel space instead of sliding it
    // with the pitch, which at these small ratios is the difference between
    // "the same person, speaking" and "a slightly different person".
    const shaped = transformRecordedVoice(
      chunk,
      { pitch: factor, rate: 1, toneStyle: 'natural', formantPreservation: 0.7 },
      SAMPLE_RATE,
    );
    // Re-pitching raises the crest factor a little. Left alone, the render's
    // peak normaliser would answer that by turning the whole voice down, which
    // is a change of volume nobody asked a contour for. Matching the chunk's own
    // peak keeps "the same audio, a different pitch".
    return matchPeak(chunk, shaped);
  });
}

// ---------------------------------------------------------------------------
// Joining, with the position of every phone reported
// ---------------------------------------------------------------------------

/**
 * Join unit chunks with a raised-cosine crossfade and report where each chunk
 * began.
 *
 * The offsets matter as much as the audio: summing chunk lengths instead drifts,
 * because every crossfade removes `overlap` samples from the total. `starts[i]`
 * is the position of the boundary the crossfade straddles, which for a diphone
 * stream is exactly the midpoint of phone i-1 — so word timings derived from it
 * describe the audio that was actually produced.
 */
function crossfadeJoinWithOffsets(
  chunks: Float32Array[],
  overlapSeconds = HALF_UNIT_JOIN_SECONDS,
): { samples: Float32Array; starts: number[] } {
  if (!chunks.length) return { samples: new Float32Array(0), starts: [] };
  const overlap = Math.floor(SAMPLE_RATE * overlapSeconds);
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0) - overlap * Math.max(0, chunks.length - 1);
  const output = new Float32Array(Math.max(0, total));
  const starts: number[] = [];
  let cursor = 0;
  chunks.forEach((chunk, index) => {
    if (index === 0) {
      output.set(chunk);
      starts.push(0);
      cursor = chunk.length;
      return;
    }
    const blend = Math.min(overlap, cursor, chunk.length);
    const fadeStart = cursor - blend;
    // The boundary itself is where the previous chunk ended, not where the fade
    // begins: that is the midpoint of the phone the two chunks share.
    starts.push(cursor);
    for (let i = 0; i < blend; i += 1) {
      const phase = ((i + 1) / (blend + 1)) * (Math.PI / 2);
      output[fadeStart + i] = output[fadeStart + i] * Math.cos(phase) + chunk[i] * Math.sin(phase);
    }
    output.set(chunk.subarray(blend), cursor);
    cursor += chunk.length - blend;
  });
  return { samples: output, starts };
}

/** Join without offsets, for callers that only want the audio. */
export function crossfadeJoin(chunks: Float32Array[]): Float32Array {
  return crossfadeJoinWithOffsets(chunks).samples;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** Normalise a phone symbol to the pack's lowercase inventory. */
function packPhone(phone: string): string {
  const bare = phone.toUpperCase().replace(/[012]$/, '');
  const mapped = bare === 'AX' ? 'AH' : bare;
  return mapped.toLowerCase();
}

/**
 * Render segments of phones as one continuous waveform.
 *
 * Silence is available only at segment ends. Inside a segment the phones run
 * into each other, because that is what people do: an earlier version wrapped
 * every word in pause units and spent 38 % of its duration in silence.
 *
 * `absoluteOffset` is the sample position where this render begins in a larger
 * timeline, so a mathematical stand-in keeps its phase continuous with what came
 * before it.
 */
export async function renderCmuDiphones(
  segments: SegmentInput[],
  model: VoiceModelConfig,
  fallbackPhone: FallbackPhone,
  absoluteOffset: number,
): Promise<DiphoneRender> {
  const speaker = speakerForModel(model);
  const diagnostics: RenderDiagnostics = {
    exactUnits: 0,
    backoffUnits: 0,
    fallbackPhones: 0,
    missingPairs: [],
    phones: [],
  };
  const phoneOffsets: number[] = [];
  const segmentPhoneCounts: number[] = [];
  // Prosody metadata, one entry per assembled chunk, used after assembly to put
  // every unit on one contour.
  const chunkProsody: ChunkProsody[] = [];

  const allPhones: string[] = [];
  for (const segment of segments) {
    for (const token of segment.phones) allPhones.push(packPhone(token.phone));
    segmentPhoneCounts.push(segment.phones.length);
  }
  diagnostics.phones = allPhones;

  let pack: VoicePack | null = null;
  try {
    pack = await loadVoicePack(speaker);
  } catch (error) {
    // Without the recordings there is no base voice to assemble from. Speak the
    // phones with the caller's synthesizer and say so, rather than failing
    // silently or reaching for any remote service.
    console.warn(
      `Vocalis: the CMU ARCTIC ${speaker.toUpperCase()} pack could not be loaded; falling back to the experimental synthesizer for this render.`,
      error,
    );
    const chunks: Float32Array[] = [];
    let cursor = absoluteOffset;
    for (const phone of allPhones) {
      const chunk = fallbackPhone(phone, cursor);
      chunks.push(chunk);
      phoneOffsets.push(cursor + Math.floor(chunk.length / 2));
      cursor += chunk.length;
      diagnostics.fallbackPhones += 1;
    }
    return { samples: concat(chunks), speaker, diagnostics, phoneOffsets, segmentPhoneCounts };
  }

  const missing = (key: string) => {
    if (!diagnostics.missingPairs.includes(key)) diagnostics.missingPairs.push(key);
  };

  const joint = (left: string, right: string, cursor: number): Float32Array => {
    const key = `${left}|${right}`;
    const entry = pack?.manifest.units[key];
    if (pack && entry) {
      diagnostics.exactUnits += 1;
      return toFloat(pack, entry);
    }
    missing(key);
    const outgoing = pack ? outgoingHalfOf(pack, left) : null;
    const incoming = pack ? incomingHalfOf(pack, right) : null;
    if (outgoing && incoming) {
      diagnostics.backoffUnits += 1;
      return crossfadeJoinWithOffsets([outgoing, incoming], HALF_UNIT_JOIN_SECONDS).samples;
    }
    // No recorded audio for either side of this transition. Synthesise the two
    // half-phones so the timing model still holds: one chunk, one boundary.
    diagnostics.fallbackPhones += 1;
    const leftSamples = fallbackPhone(left, cursor);
    const rightSamples = fallbackPhone(right, cursor + Math.floor(leftSamples.length / 2));
    return concat([secondHalfOf(leftSamples), firstHalfOf(rightSamples)]);
  };

  const chunks: Float32Array[] = [];
  const segmentStarts: Array<{ chunkIndex: number; phoneCount: number }> = [];
  let cursor = absoluteOffset;

  for (const segment of segments) {
    const phones = segment.phones.map((token) => packPhone(token.phone));
    if (!phones.length) continue;
    const question = segment.terminal === '?';

    // Lead: the first half of the segment's first phone, on a recorded pause
    // unit when one exists.
    const leadKey = `pau|${phones[0]}`;
    const leadEntry = pack.manifest.units[leadKey];
    if (leadEntry) {
      diagnostics.exactUnits += 1;
      chunks.push(toFloat(pack, leadEntry));
    } else {
      missing(leadKey);
      const incoming = incomingHalfOf(pack, phones[0]);
      if (incoming) {
        diagnostics.backoffUnits += 1;
        chunks.push(concat([silence(SEGMENT_EDGE_SILENCE_SECONDS), incoming]));
      } else {
        diagnostics.fallbackPhones += 1;
        chunks.push(
          concat([
            silence(SEGMENT_EDGE_SILENCE_SECONDS),
            firstHalfOf(fallbackPhone(phones[0], cursor)),
          ]),
        );
      }
    }
    const leadIndex = chunks.length - 1;
    chunkProsody.push({ position: 0, final: false, question, stress: 0 });
    cursor += chunks[leadIndex].length;

    // Joints between the segment's phones.
    for (let index = 1; index < phones.length; index += 1) {
      chunks.push(joint(phones[index - 1], phones[index], cursor));
      chunkProsody.push({
        position: index / phones.length,
        final: false,
        question,
        stress: Number(segment.phones[index]?.stress ?? 0) > 0 ? 1 : 0,
      });
      cursor += chunks[chunks.length - 1].length;
    }

    // Tail: the second half of the segment's last phone, into a recorded pause
    // when one exists. This is the only silence inside a render.
    const last = phones[phones.length - 1];
    const tailKey = `${last}|pau`;
    const tailEntry = pack.manifest.units[tailKey];
    if (tailEntry) {
      diagnostics.exactUnits += 1;
      chunks.push(toFloat(pack, tailEntry));
    } else {
      missing(tailKey);
      const outgoing = outgoingHalfOf(pack, last);
      if (outgoing) {
        diagnostics.backoffUnits += 1;
        chunks.push(concat([outgoing, silence(SEGMENT_EDGE_SILENCE_SECONDS)]));
      } else {
        diagnostics.fallbackPhones += 1;
        chunks.push(
          concat([
            secondHalfOf(fallbackPhone(last, cursor)),
            silence(SEGMENT_EDGE_SILENCE_SECONDS),
          ]),
        );
      }
    }
    chunkProsody.push({ position: 1, final: true, question, stress: 0 });
    cursor += chunks[chunks.length - 1].length;

    // Remember where this segment's chunks began, to map midpoints afterwards.
    segmentStarts.push({ chunkIndex: leadIndex, phoneCount: phones.length });
  }

  const joined = crossfadeJoinWithOffsets(applyProsody(chunks, chunkProsody));
  // Chunk i begins on the midpoint of phone i-1 within its segment, so the
  // offsets of a segment's phones are the starts of the chunks after its lead.
  for (const { chunkIndex, phoneCount } of segmentStarts) {
    for (let index = 0; index < phoneCount; index += 1) {
      const start = joined.starts[chunkIndex + 1 + index] ?? joined.samples.length;
      phoneOffsets.push(absoluteOffset + start);
    }
  }

  return {
    samples: joined.samples,
    speaker,
    diagnostics,
    phoneOffsets,
    segmentPhoneCounts,
  };
}

// ---------------------------------------------------------------------------
// Pitch, rate and character
// ---------------------------------------------------------------------------

/**
 * Apply the profile to the assembled recordings.
 *
 * The transform itself lives in `voiceTransform.ts`: band-limited pitch
 * resampling, formant preservation, correlation-aligned pace change, tone
 * character and the resonance sliders. Keeping it out of this file is the point
 * — the recorded-unit assembly above is the base voice and stays untouched,
 * while everything that shapes a *profile* is one reviewable stage with its own
 * numbers.
 */
export function processCmuVoice(samples: Float32Array, model: VoiceModelConfig): Float32Array {
  return transformRecordedVoice(
    samples,
    {
      pitch: model.pitch,
      rate: model.rate,
      toneStyle: model.toneStyle,
      throatWarmth: model.throatWarmth,
      oralClarity: model.oralClarity,
      airPresence: model.airPresence,
    },
    SAMPLE_RATE,
  );
}

export const CMU_SAMPLE_RATE = SAMPLE_RATE;
