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
 * A unit's own length is not how long the phone should be, so the assembled
 * stream is re-timed before it is joined. `durationModel` plans every phone from
 * the speaker's measured durations, stress, consonant runs and phrase boundaries;
 * `psola` then re-cuts each unit into grains one voice cycle wide and re-adds
 * them on a grid of the planned length, so a phone can be shortened without
 * dragging its neighbour and a join can be made where both recordings are at the
 * same phase. The grid needs the pitch marks and the internal phone boundary that
 * `manifest.v2.json` carries; where that derived index is absent the render falls
 * back to the units as recorded and the fixed crossfade between them.
 *
 * Original Vocalis code. The unit data is Carnegie Mellon University's; the
 * extraction tools are `scripts/build_cmu_voicepack.py` and
 * `scripts/build_cmu_voicepack_v2.py`.
 */
import type { VoiceModelConfig } from './naturalVoiceEngine';
import type { BoundaryKind, Stress } from './textAnalysis';
import { planDurations, type DurationPlan, type IntrinsicDurations } from './durationModel';
import { joinInPhase, synthesiseUnit, type MarkedUnit } from './psola';

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
/** Tempo changes smaller than this are left alone rather than stretched. */
const STRETCH_PASS_THROUGH = 0.005;

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

/**
 * What the derived v2 index adds to a unit: the internal phone boundary, the
 * pitch marks as a position then a run of steps, and how much of the unit is
 * voiced. Measured from the same frozen audio by
 * `scripts/build_cmu_voicepack_v2.py`; the samples themselves are untouched.
 */
interface UnitMeta {
  offset: number;
  length: number;
  boundary: number;
  period: number;
  voiced: number;
  marks: number[];
}

interface DerivedManifest {
  format: string;
  phoneDurationsMs?: Record<string, number>;
  units?: Record<string, UnitMeta>;
}

interface VoicePack {
  manifest: DiphoneManifest;
  samples: Int16Array;
  /** Keys grouped by their left phone, built once on first use. */
  byLeft: Map<string, string[]>;
  byRight: Map<string, string[]>;
  /** The derived index, or null when only the v1 index is available. */
  derived: DerivedManifest | null;
  /** Pitch marks decoded from their deltas once per unit. */
  decodedMarks: Map<string, number[]>;
  /** Measured duration of each phone in seconds, for the plan. */
  intrinsic: IntrinsicDurations;
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
  /**
   * True when the units were re-timed to the duration plan on their own pitch
   * marks. When it is, pitch and tempo have already been applied here and must
   * not be applied again to the joined result.
   */
  timedFromPlan: boolean;
  /** Seconds the plan asked for, excluding the pauses between segments. */
  plannedSeconds: number;
  /** Half phones re-timed by overlap-add, the transparent path. */
  grainHalves: number;
  /**
   * Half phones the plan wanted so much shorter than the recording that they were
   * cut - head and tail kept, middle dropped - because grains read that far
   * apart in the source are a crackle rather than a sound.
   */
  truncatedHalves: number;
  /** Half phones given less stretch than the plan asked for, to keep them voiced. */
  cappedHalves: number;
}

/**
 * One sentence-worth of phones. Silence may only appear between segments.
 *
 * The extra fields are what the duration model needs to tell a stressed vowel
 * from a schwa and a consonant inside a cluster from one between two vowels.
 * They are optional so a caller that only has phone symbols still renders: it
 * just gets the units as recorded, with no plan.
 */
export interface SegmentInput {
  phones: Array<{ phone: string; stress?: Stress; wordIndex?: number; long?: boolean; word?: string }>;
  /**
   * How strong the boundary after each phone is, when the caller knows it. An
   * entry is undefined for a phone that does not end a word, which is most of
   * them: the boundary belongs to the last phone of each word.
   */
  boundaries?: Array<BoundaryKind | undefined>;
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

/** Pitch marks from their delta coding: a position, then a run of steps. */
function decodeMarks(deltas: number[]): number[] {
  if (!Array.isArray(deltas) || !deltas.length) return [];
  const marks = new Array<number>(deltas.length);
  let at = deltas[0];
  marks[0] = at;
  for (let i = 1; i < deltas.length; i += 1) {
    at += deltas[i];
    marks[i] = at;
  }
  return marks;
}

/**
 * Read the derived index, and check it against the frozen one before trusting it.
 *
 * Both index the same bytes of the same audio, so a unit whose offset or length
 * disagrees means the two files came from different builds. Guessing in that
 * case would put pitch marks in the wrong places, which is worse than not having
 * them, so the whole derived index is dropped and the render falls back.
 */
async function readDerivedIndex(
  response: Response | null,
  manifest: DiphoneManifest,
  speaker: 'slt' | 'bdl',
): Promise<{ manifest: DerivedManifest | null; intrinsic: IntrinsicDurations }> {
  const empty = { manifest: null as DerivedManifest | null, intrinsic: {} as IntrinsicDurations };
  if (!response || !response.ok) return empty;
  let derived: DerivedManifest;
  try {
    derived = (await response.json()) as DerivedManifest;
  } catch {
    return empty;
  }
  if (derived?.format !== 'vocalis-cmu-diphones-v2' || !derived.units) {
    console.warn(`Vocalis: the ${speaker.toUpperCase()} derived unit index has format "${derived?.format}" and was ignored.`);
    return empty;
  }
  let mismatched = 0;
  let covered = 0;
  for (const [key, entry] of Object.entries(manifest.units)) {
    const meta = derived.units[key];
    if (!meta) continue;
    covered += 1;
    if (meta.offset !== entry.offset || meta.length !== entry.length) mismatched += 1;
  }
  if (mismatched || covered < Object.keys(manifest.units).length) {
    console.warn(
      `Vocalis: the ${speaker.toUpperCase()} derived unit index disagrees with the frozen one ` +
        `(${mismatched} mismatched, ${covered} of ${Object.keys(manifest.units).length} covered) and was ignored.`,
    );
    return empty;
  }
  const intrinsic: IntrinsicDurations = {};
  for (const [phone, ms] of Object.entries(derived.phoneDurationsMs ?? {})) {
    if (typeof ms === 'number' && ms > 0) intrinsic[phone] = ms / 1000;
  }
  if (!Object.keys(intrinsic).length) return empty;
  return { manifest: derived, intrinsic };
}

async function loadVoicePack(speaker: 'slt' | 'bdl'): Promise<VoicePack> {
  const cached = packs.get(speaker);
  if (cached) return cached;
  const request = (async () => {
    const root = `/voicepacks/cmu-arctic/${speaker}`;
    const [manifestResponse, audioResponse, derivedResponse] = await Promise.all([
      fetch(`${root}/manifest.json`),
      fetch(`${root}/diphones.bin`),
      // The derived index is an optimisation over the frozen one: if it is not
      // there, or does not agree with it, the render falls back rather than fails.
      fetch(`${root}/manifest.v2.json`).catch(() => null),
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
    const derived = await readDerivedIndex(derivedResponse, manifest, speaker);
    return {
      manifest,
      samples: new Int16Array(buffer),
      byLeft,
      byRight,
      derived: derived.manifest,
      decodedMarks: new Map<string, number[]>(),
      intrinsic: derived.intrinsic,
    };
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

/** A pause half of a unit: no phone to plan, so it keeps its recorded length. */
const PAUSE_HALF = -1;

/** One chunk of the stream: what it is made of, and the two half phones it carries. */
interface ChunkSpec {
  samples: Float32Array;
  /** The recorded unit this chunk is exactly, or null when it was assembled. */
  key: string | null;
  /** Index into the plan of the phone whose SECOND half this chunk carries. */
  leftPhone: number;
  /** Index into the plan of the phone whose FIRST half this chunk carries. */
  rightPhone: number;
}

/** Pitch marks for a unit, decoded from their deltas once and kept. */
function marksFor(pack: VoicePack, key: string): number[] {
  const cached = pack.decodedMarks.get(key);
  if (cached) return cached;
  const decoded = decodeMarks(pack.derived?.units?.[key]?.marks ?? []);
  pack.decodedMarks.set(key, decoded);
  return decoded;
}

/**
 * A chunk as the resynthesiser wants it: its samples, its pitch marks, and how
 * long each of its two half phones should be.
 *
 * A half that belongs to a pause is left at the length it was recorded at. The
 * pause is the breath between sentences, and the plan says nothing about it.
 */
function markedUnitOf(pack: VoicePack, spec: ChunkSpec, plan: DurationPlan): MarkedUnit {
  const { samples } = spec;
  const meta = spec.key ? pack.derived?.units?.[spec.key] : undefined;
  const split = meta
    ? Math.min(Math.max(Math.round(meta.boundary), 1), Math.max(1, samples.length - 1))
    : Math.max(1, Math.round(samples.length / 2));
  const target = (index: number, recorded: number): number =>
    index >= 0 && plan.phones[index] ? (plan.phones[index].seconds * SAMPLE_RATE) / 2 : recorded;
  return {
    samples,
    marks: spec.key ? marksFor(pack, spec.key) : [],
    boundary: split,
    leftTarget: target(spec.leftPhone, split),
    rightTarget: target(spec.rightPhone, samples.length - split),
  };
}

/** How the halves of one render were realised, counted as they are built. */
export interface RealisationCounts {
  grains: number;
  truncated: number;
  capped: number;
}

/**
 * Re-time every chunk to the plan and join them on the voice cycle.
 *
 * The counts come back filled in: a render is not "re-timed" in the abstract, it
 * is a specific number of halves walked on grains, a specific number cut because
 * the plan asked for less than a grain walk can do, and a specific number given
 * less stretch than was asked for. All three belong in the report.
 */
function joinRetimed(
  pack: VoicePack,
  specs: ChunkSpec[],
  plan: DurationPlan,
  pitch: number,
  counts: RealisationCounts,
): { samples: Float32Array; starts: number[] } {
  const parts = specs.map((spec) => {
    const part = synthesiseUnit(markedUnitOf(pack, spec, plan), { sampleRate: SAMPLE_RATE, pitch });
    for (const mode of part.modes) {
      if (mode === 'truncated') counts.truncated += 1;
      else if (mode === 'capped') counts.capped += 1;
      else if (mode === 'grains') counts.grains += 1;
    }
    return part;
  });
  return joinInPhase(parts, { sampleRate: SAMPLE_RATE });
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
    timedFromPlan: false,
    plannedSeconds: 0,
    grainHalves: 0,
    truncatedHalves: 0,
    cappedHalves: 0,
  };
  const phoneOffsets: number[] = [];
  const segmentPhoneCounts: number[] = [];

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

  const joint = (
    left: string,
    right: string,
    cursor: number,
  ): { samples: Float32Array; key: string | null } => {
    const key = `${left}|${right}`;
    const entry = pack?.manifest.units[key];
    if (pack && entry) {
      diagnostics.exactUnits += 1;
      return { samples: toFloat(pack, entry), key };
    }
    missing(key);
    const outgoing = pack ? outgoingHalfOf(pack, left) : null;
    const incoming = pack ? incomingHalfOf(pack, right) : null;
    if (outgoing && incoming) {
      diagnostics.backoffUnits += 1;
      return {
        samples: crossfadeJoinWithOffsets([outgoing, incoming], HALF_UNIT_JOIN_SECONDS).samples,
        key: null,
      };
    }
    // No recorded audio for either side of this transition. Synthesise the two
    // half-phones so the timing model still holds: one chunk, one boundary.
    diagnostics.fallbackPhones += 1;
    const leftSamples = fallbackPhone(left, cursor);
    const rightSamples = fallbackPhone(right, cursor + Math.floor(leftSamples.length / 2));
    return { samples: concat([secondHalfOf(leftSamples), firstHalfOf(rightSamples)]), key: null };
  };

  // How long each phone should be, from this speaker's own measured durations.
  // Without the derived index there is nothing to plan against and the units are
  // played at the length they were recorded at, exactly as before.
  const { pitch: pitchFactor, rate: rateFactor } = factorsFor(model);
  // In reference mode there is no plan at all: every unit plays at the length it
  // was recorded at, which is the `plan === null` path below.
  const plan = model.referenceRaw === false && pack.derived && Object.keys(pack.intrinsic).length
    ? planDurations(segments, pack.intrinsic, { rate: rateFactor })
    : null;
  diagnostics.plannedSeconds = plan ? plan.totalSeconds : 0;

  const specs: ChunkSpec[] = [];
  const segmentStarts: Array<{ chunkIndex: number; phoneCount: number }> = [];
  let cursor = absoluteOffset;
  /** Where this segment's phones begin in the plan's flat list. */
  let phoneBase = 0;

  const add = (
    chunk: { samples: Float32Array; key: string | null },
    leftPhone: number,
    rightPhone: number,
  ): void => {
    specs.push({ samples: chunk.samples, key: chunk.key, leftPhone, rightPhone });
    cursor += chunk.samples.length;
  };

  for (const segment of segments) {
    const phones = segment.phones.map((token) => packPhone(token.phone));
    if (!phones.length) continue;

    // Lead: the first half of the segment's first phone, on a recorded pause
    // unit when one exists. The pause half keeps the length it was recorded at.
    const leadKey = `pau|${phones[0]}`;
    const leadEntry = pack.manifest.units[leadKey];
    const leadIndex = specs.length;
    if (leadEntry) {
      diagnostics.exactUnits += 1;
      add({ samples: toFloat(pack, leadEntry), key: leadKey }, PAUSE_HALF, phoneBase);
    } else {
      missing(leadKey);
      const incoming = incomingHalfOf(pack, phones[0]);
      if (incoming) {
        diagnostics.backoffUnits += 1;
        add(
          { samples: concat([silence(SEGMENT_EDGE_SILENCE_SECONDS), incoming]), key: null },
          PAUSE_HALF,
          phoneBase,
        );
      } else {
        diagnostics.fallbackPhones += 1;
        add(
          {
            samples: concat([
              silence(SEGMENT_EDGE_SILENCE_SECONDS),
              firstHalfOf(fallbackPhone(phones[0], cursor)),
            ]),
            key: null,
          },
          PAUSE_HALF,
          phoneBase,
        );
      }
    }

    // Joints between the segment's phones.
    for (let index = 1; index < phones.length; index += 1) {
      add(joint(phones[index - 1], phones[index], cursor), phoneBase + index - 1, phoneBase + index);
    }

    // Tail: the second half of the segment's last phone, into a recorded pause
    // when one exists. This is the only silence inside a render.
    const last = phones[phones.length - 1];
    const tailKey = `${last}|pau`;
    const tailEntry = pack.manifest.units[tailKey];
    if (tailEntry) {
      diagnostics.exactUnits += 1;
      add(
        { samples: toFloat(pack, tailEntry), key: tailKey },
        phoneBase + phones.length - 1,
        PAUSE_HALF,
      );
    } else {
      missing(tailKey);
      const outgoing = outgoingHalfOf(pack, last);
      if (outgoing) {
        diagnostics.backoffUnits += 1;
        add(
          { samples: concat([outgoing, silence(SEGMENT_EDGE_SILENCE_SECONDS)]), key: null },
          phoneBase + phones.length - 1,
          PAUSE_HALF,
        );
      } else {
        diagnostics.fallbackPhones += 1;
        add(
          {
            samples: concat([
              secondHalfOf(fallbackPhone(last, cursor)),
              silence(SEGMENT_EDGE_SILENCE_SECONDS),
            ]),
            key: null,
          },
          phoneBase + phones.length - 1,
          PAUSE_HALF,
        );
      }
    }

    // Remember where this segment's chunks began, to map midpoints afterwards.
    segmentStarts.push({ chunkIndex: leadIndex, phoneCount: phones.length });
    phoneBase += phones.length;
  }

  // Re-time and join. With a plan, every unit is rebuilt from grains one voice
  // cycle wide laid on a grid of the planned length, and each junction is aligned
  // to those grains. Without one, the units are played as recorded and crossfaded
  // over a fixed time.
  const counts: RealisationCounts = { grains: 0, truncated: 0, capped: 0 };
  const joined = plan
    ? joinRetimed(pack, specs, plan, pitchFactor, counts)
    : crossfadeJoinWithOffsets(specs.map((spec) => spec.samples));
  diagnostics.timedFromPlan = plan !== null;
  diagnostics.grainHalves = counts.grains;
  diagnostics.truncatedHalves = counts.truncated;
  diagnostics.cappedHalves = counts.capped;
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

/** Half-width of the interpolation window, in input samples. */
const RESAMPLE_TAPS = 12;

/**
 * Change the pitch of a recording by reading it at a different rate.
 *
 * The read position falls between samples, so it has to be interpolated. A
 * straight line between the two neighbours is what this used to do, and a line
 * is a crude low-pass filter: pitched down to 0.72, a voice lost about a third
 * of its energy above 2.5 kHz and came back dull. This interpolates with a
 * windowed sinc instead, which reconstructs the band the recording actually
 * contains, and band-limits the input to the output's own Nyquist whenever the
 * factor shortens the signal, so pitching up cannot fold images back into the
 * audible range.
 *
 * Written from the sampling theorem: an ideal interpolator is a sinc scaled by
 * the cutoff, truncated to a window so it is finite, and renormalised by the sum
 * of its own coefficients so the gain cannot drift at the edges.
 */
function resample(input: Float32Array, pitchFactor: number): Float32Array {
  const factor = Math.max(0.5, Math.min(2, pitchFactor));
  if (Math.abs(factor - 1) < 1e-4) return Float32Array.from(input);
  const length = Math.max(1, Math.floor(input.length / factor));
  const cutoff = Math.min(1, 1 / factor);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const position = i * factor;
    const centre = Math.floor(position);
    const fraction = position - centre;
    let sum = 0;
    let weights = 0;
    for (let tap = -RESAMPLE_TAPS + 1; tap <= RESAMPLE_TAPS; tap++) {
      const sourceIndex = centre + tap;
      if (sourceIndex < 0 || sourceIndex >= input.length) continue;
      const distance = tap - fraction;
      if (Math.abs(distance) >= RESAMPLE_TAPS) continue;
      const argument = cutoff * distance;
      const sinc = argument === 0 ? 1 : Math.sin(Math.PI * argument) / (Math.PI * argument);
      // Hann window over the tap span, so truncating the sinc does not ring.
      const window = 0.5 + 0.5 * Math.cos((Math.PI * distance) / RESAMPLE_TAPS);
      const coefficient = cutoff * sinc * window;
      sum += input[sourceIndex] * coefficient;
      weights += coefficient;
    }
    output[i] = Math.abs(weights) > 1e-6 ? sum / weights : 0;
  }
  return output;
}

/**
 * Resample to an exact length by linear interpolation.
 *
 * Only for signals shorter than one WSOLA window, where there is nothing to
 * overlap-add. It is a compromise, and it is confined to chunks under 32 ms.
 */
function resampleToLength(input: Float32Array, outputLength: number): Float32Array {
  const output = new Float32Array(outputLength);
  if (!input.length) return output;
  for (let i = 0; i < outputLength; i++) {
    const position = (i * input.length) / outputLength;
    const left = Math.min(input.length - 1, Math.floor(position));
    const right = Math.min(input.length - 1, left + 1);
    const fraction = position - left;
    output[i] = input[left] * (1 - fraction) + input[right] * fraction;
  }
  return output;
}

function wsolaStretch(input: Float32Array, targetLength: number): Float32Array {
  const outputLength = Math.max(1, Math.floor(targetLength));
  // Time-scale modification is never free: it cuts the signal into windows and
  // overlap-adds them, and every window boundary is a place a discontinuity can
  // appear. Below half a percent the tempo change is inaudible, so the recording
  // is handed back untouched rather than processed for nothing. This used to be
  // a 3.5 % window that linearly resampled the whole signal — the worst of both:
  // the artifacts of resampling without the honesty of a real tempo change.
  if (Math.abs(outputLength / input.length - 1) < STRETCH_PASS_THROUGH) return Float32Array.from(input);
  if (input.length < 512) return resampleToLength(input, outputLength);

  const windowSize = 640;
  const synthesisHop = 320;
  const overlap = windowSize - synthesisHop;
  const stretch = outputLength / input.length;
  const analysisHop = synthesisHop / stretch;
  const searchRadius = 96;
  const output = new Float32Array(outputLength + windowSize);
  const weights = new Float32Array(output.length);
  let sourceStart = 0;
  let outputStart = 0;

  while (outputStart < outputLength) {
    if (outputStart === 0) {
      sourceStart = 0;
    } else {
      const expected = Math.round(sourceStart + analysisHop);
      const compareLength = Math.min(overlap, outputStart, input.length - expected);
      let best = Math.max(0, Math.min(input.length - windowSize, expected));
      let bestScore = -Infinity;
      const searchStart = Math.max(0, expected - searchRadius);
      const searchEnd = Math.min(input.length - windowSize, expected + searchRadius);
      const step = 8;
      for (let candidate = searchStart; candidate <= searchEnd; candidate += step) {
        let dot = 0;
        let normA = 0;
        let normB = 0;
        const outBase = outputStart;
        for (let j = 0; j < compareLength; j += 4) {
          const a = output[outBase + j];
          const b = input[candidate + j];
          dot += a * b;
          normA += a * a;
          normB += b * b;
        }
        const score = dot / Math.sqrt(normA * normB + 1e-9);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      sourceStart = best;
    }

    const available = Math.min(windowSize, input.length - sourceStart, output.length - outputStart);
    for (let i = 0; i < available; i++) {
      const fade = i < overlap && outputStart > 0 ? i / overlap : 1;
      output[outputStart + i] += input[sourceStart + i] * fade;
      weights[outputStart + i] += fade;
    }
    outputStart += synthesisHop;
  }

  const trimmed = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) trimmed[i] = weights[i] ? output[i] / weights[i] : 0;
  return trimmed;
}

function applyStyle(input: Float32Array, style: VoiceModelConfig['toneStyle']): Float32Array {
  if (style === 'natural' || style === 'deep' || style === 'energetic') return input;
  const output = new Float32Array(input.length);
  let previous = 0;
  let phase = 0;
  for (let i = 0; i < input.length; i++) {
    const sample = input[i];
    if (style === 'radio') {
      const highPassed = sample - previous * 0.91;
      previous = sample;
      output[i] = Math.tanh(highPassed * 5) * 0.75;
    } else if (style === 'robot') {
      output[i] = sample * (0.72 + 0.28 * Math.sin(phase));
      phase += 2 * Math.PI * 34 / SAMPLE_RATE;
    } else {
      // A softened, brighter and quieter timbre; unlike a true whispered
      // recording this is a post-processed speaking voice, not breath synthesis.
      const highPassed = sample - previous * 0.96;
      previous = sample;
      output[i] = sample * 0.42 + highPassed * 0.42;
    }
  }
  return output;
}

/** The pitch and tempo a profile asks for, including what its character adds. */
export interface CmuFactors {
  pitch: number;
  rate: number;
}

/**
 * One place where pitch and tempo are read off a profile, so the unit assembler
 * and this stage cannot disagree about what a setting means.
 */
export function factorsFor(model: VoiceModelConfig): CmuFactors {
  const stylePitch = model.toneStyle === 'deep' ? 0.92 : model.toneStyle === 'energetic' ? 1.06 : 1;
  const rateStyle = model.toneStyle === 'deep' ? 0.92 : model.toneStyle === 'energetic' ? 1.1 : 1;
  return {
    pitch: Math.max(0.25, Math.min(4, model.pitch * stylePitch)),
    rate: Math.max(0.55, model.rate * rateStyle),
  };
}

/**
 * Pitch, tempo and character, applied to a joined render.
 *
 * `alreadyTimed` says the unit assembler has applied the pitch and the tempo
 * itself, on the pitch marks of each unit, which is both better and cheaper than
 * doing it here: re-timing a unit on its own voice cycle keeps the pitch and the
 * duration independent, where resampling here moves them together and then puts
 * the duration back by stretching the whole render. Applying either twice would
 * apply it twice, so the caller passes this flag when the render reports
 * `timedFromPlan`.
 */
export function processCmuVoice(
  samples: Float32Array,
  model: VoiceModelConfig,
  alreadyTimed = false,
): Float32Array {
  const { pitch: pitchFactor, rate: rateFactor } = factorsFor(model);
  // A neutral voice means "play the recording": no resampling, no stretching,
  // nothing between the joined units and the listener. Stating that as a branch
  // rather than relying on two processes happening to cancel out is what makes
  // the default setting provably the untouched one.
  if (
    alreadyTimed ||
    (Math.abs(pitchFactor - 1) < STRETCH_PASS_THROUGH && Math.abs(rateFactor - 1) < STRETCH_PASS_THROUGH)
  ) {
    return applyStyle(samples, model.toneStyle);
  }
  const pitched = resample(samples, pitchFactor);
  // Resampling moves pitch and duration together, so a pitch control that also
  // slowed the reader down would not be a pitch control: at 0.72 the deep preset
  // spoke at 68 words a minute and a quarter of its render was silence. The
  // stretch target is measured from the ORIGINAL length, which puts the duration
  // back where the recording had it and leaves `rate` as the only thing that
  // changes how long the speaking takes.
  const targetLength = Math.max(1, Math.floor(samples.length / rateFactor));
  const stretch = wsolaStretch(pitched, targetLength);
  return applyStyle(stretch, model.toneStyle);
}

export const CMU_SAMPLE_RATE = SAMPLE_RATE;
