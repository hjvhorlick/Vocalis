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
  phones: Array<{ phone: string }>;
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
    cursor += chunks[leadIndex].length;

    // Joints between the segment's phones.
    for (let index = 1; index < phones.length; index += 1) {
      chunks.push(joint(phones[index - 1], phones[index], cursor));
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
    cursor += chunks[chunks.length - 1].length;

    // Remember where this segment's chunks began, to map midpoints afterwards.
    segmentStarts.push({ chunkIndex: leadIndex, phoneCount: phones.length });
  }

  const joined = crossfadeJoinWithOffsets(chunks);
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
