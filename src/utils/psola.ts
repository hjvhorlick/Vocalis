

/**
 * Pitch-synchronous overlap-add: the stage that makes a recorded unit last as
 * long as the plan says, and the stage that makes two units meet in phase.
 *
 * Both defects this replaces are measured. Holding every phone at the length it
 * happened to be recorded at makes a flowing sentence take 5.36 s where the human
 * reading takes 2.78 s. Joining two recordings with a fixed 6 ms raised-cosine
 * crossfade puts 0.57 dB of amplitude modulation into the 70-300 Hz band where
 * the intact recording has 0.24 dB, because the crossfade lands at whatever phase
 * of the voice cycle the two fragments happen to be in.
 *
 * The approach is the one the concatenative literature settled on. Each half
 * phone is cut into grains one glottal period wide, windowed with a raised
 * cosine, and re-added on a grid of the engine's choosing:
 *
 *   * spacing the grid by the period the grain was recorded at keeps the pitch
 *     and changes only how many grains land in a second, which is the duration;
 *   * spacing it differently changes the pitch without touching the duration, so
 *     neither depends on resampling and neither costs high-frequency energy;
 *   * a grid that runs straight through the point where two units meet gives the
 *     join one period of overlap-add, aligned to glottal closures on both sides.
 *
 * Grain centres come from the pitch marks the pack carries. A stretch with no
 * marks is unvoiced - fricatives, stops, breath - where there is no phase to
 * preserve, so those grains are a fixed frame wide and equally spaced. Nothing
 * here resamples, so nothing here dulls the spectrum.
 *
 * Grains are also where this stage has to know its limits, and both limits were
 * found by listening to what the arithmetic does. Ask a grain walk for a tenth of
 * the recorded length and consecutive grains come from source positions a
 * thousand samples apart: the amplitude still sums to one, but the waveform no
 * longer does, and what comes out is a crackle. Ask it for three times the
 * recorded length and it lays the same glottal period down three times running,
 * which is a tone where a vowel was - the metallic whine. So a half phone is
 * squeezed by *cutting* it, keeping the head and the tail of the recording and
 * dropping the middle over one voice cycle, once the plan wants less than
 * `TRUNCATE_BELOW_RATIO` of what was recorded; and it is never stretched past
 * `MAX_STRETCH_RATIO`. Cutting keeps the two transitions that identify a phone,
 * which is why a squeezed consonant still reads as itself instead of as a click.
 * `SynthesisedUnit.modes` reports which way each half went, so the diagnostics
 * can say how much of a render was re-timed and how much had to be cut.
 */

/** A unit to be re-timed, with everything the walk needs to know about it. */
export interface MarkedUnit {
  /** The recorded samples, in -1..1. */
  samples: Float32Array;
  /** Glottal period positions in samples from the start of `samples`. */
  marks: number[];
  /** Sample index where the left phone ends and the right phone begins. */
  boundary: number;
  /** Output samples wanted for the part before `boundary`. */
  leftTarget: number;
  /** Output samples wanted for the part from `boundary` on. */
  rightTarget: number;
}

/**
 * How one half phone was realised.
 *
 * - `grains`: re-timed by overlap-add, the transparent path.
 * - `truncated`: the plan wanted so much less than the recording that grains
 *   would have come from unrelated positions, so the head and tail of the
 *   recording were kept and the middle dropped over one voice cycle.
 * - `capped`: the plan wanted more stretch than a grain walk can do without
 *   repeating a glottal period audibly, so it got the most it could have.
 * - `silent`: there was nothing on that side of the boundary.
 */
export type SideMode = 'grains' | 'truncated' | 'capped' | 'silent';

/** A unit that has been re-timed, with the grid it was built on. */
export interface SynthesisedUnit {
  samples: Float32Array;
  /** Output positions of the grains, so the next unit can be aligned to them. */
  marks: number[];
  /** What each half phone was realised by, left half first. */
  modes: SideMode[];
}

export interface PsolaOptions {
  sampleRate: number;
  /**
   * Pitch scale, independent of duration. Below 1 the grid is spaced wider than
   * the recorded period, which lowers the voice; above 1 it is spaced tighter.
   */
  pitch?: number;
}

/**
 * A gap between two marks wider than this many periods is not voicing. Must
 * match the builder that wrote the marks, or a breath inside a vowel would be
 * read as a very slow period.
 */
export const UNVOICED_GAP_RATIO = 1.7;

/** Grain width where there are no marks to follow. */
export const ASYNC_FRAME_SECONDS = 0.01;

/**
 * How much of the phone boundary the two halves share. The halves are built
 * separately and then overlapped by this much, so a change of time scale inside a
 * vowel arrives over one raised cosine instead of at a step.
 */
export const BOUNDARY_BLEND_SECONDS = 0.008;

/** Glottal periods outside this range are not voice: they are tracking errors. */
const MIN_PERIOD_SAMPLES = 24;
const MAX_PERIOD_SAMPLES = 400;

/** Join length when one side has no marks to align to. */
export const DEFAULT_JOIN_SECONDS = 0.006;

/**
 * The most a half phone may be stretched by repeating grains. A stretch lays the
 * same glottal period down more than once, and the listener reports that as a
 * letter drawn out into a metallic whine: measured on the bundled speakers, the
 * harmonic stack of a real vowel keeps 85-92% of its energy up to 1.3 and only
 * 52% by 1.8. Past the ceiling the half gets the most stretch it can have and the
 * diagnostics count it, so the report says how much of a render was held back.
 */
export const MAX_STRETCH_RATIO = 1.35;

/**
 * Below this much of the recorded length a half phone is cut rather than walked.
 * A grain walk that skips whole periods stays clean down to about three grains,
 * and three grains is what 0.4 of a half phone leaves; under that the walk has
 * one or two periods of the recording to work with, which is a blip where a phone
 * was, so the head and the tail are kept instead and the middle is dropped.
 */
export const TRUNCATE_BELOW_RATIO = 0.4;

/** A half phone shorter than this is not a sound any more, whatever the plan says. */
const MIN_SIDE_SAMPLES = 8;

/** Median gap between marks, or 0 when there is nothing periodic to follow. */
export function medianPeriod(marks: number[]): number {
  if (marks.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < marks.length; i += 1) {
    const gap = marks[i] - marks[i - 1];
    if (gap > 0) gaps.push(gap);
  }
  if (!gaps.length) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

function clampPeriod(period: number, fallback: number): number {
  if (!Number.isFinite(period) || period <= 0) return fallback;
  return Math.min(MAX_PERIOD_SAMPLES, Math.max(MIN_PERIOD_SAMPLES, Math.round(period)));
}

/** Index of the mark nearest a source position, or -1 when there are none. */
function nearestMarkIndex(marks: number[], position: number): number {
  if (!marks.length) return -1;
  let low = 0;
  let high = marks.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (marks[middle] < position) low = middle + 1;
    else high = middle;
  }
  if (low > 0 && Math.abs(marks[low - 1] - position) < Math.abs(marks[low] - position)) return low - 1;
  return low;
}

/**
 * Add one grain: a raised-cosine window `2 * halfWidth` wide, read from the
 * source centred on `centre` and written to the output centred on `at`.
 *
 * A raised-cosine grain is twice as wide as the step between grains, which is
 * the one ratio that makes a run of them sum to exactly one - so what comes out
 * is the original waveform re-timed, not a sum of bumps. Where a grain
 * runs off either end it is simply not written, which leaves the natural fade at
 * the start and end of a unit rather than a click.
 */
function addGrain(
  output: Float32Array,
  weights: Float32Array,
  at: number,
  source: Float32Array,
  centre: number,
  halfWidth: number,
  gain: number,
): void {
  const width = halfWidth * 2;
  if (width < 2) return;
  // Typed arrays answer a fractional index with undefined, which turns one bad
  // grain into NaN for the whole render, so both positions are made integral
  // here rather than trusted.
  const firstOut = Math.round(at) - halfWidth;
  const firstSource = Math.round(centre) - halfWidth;
  const from = Math.max(0, -firstOut, -firstSource);
  const to = Math.min(width, output.length - firstOut, source.length - firstSource);
  for (let i = from; i < to; i += 1) {
    const weight = (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / width)) * gain;
    output[firstOut + i] += source[firstSource + i] * weight;
    weights[firstOut + i] += weight;
  }
}

/**
 * Divide an overlap-add by the sum of its own windows.
 *
 * Two raised-cosine grains tile to exactly one only when they are the same width
 * as the step between them. Following the voice means following its jitter, so the
 * next grain is a few percent wider or narrower than the step, and measured on the
 * bundled speakers that leaves the sum 7% off on average and up to 8% off at every
 * glottal period - amplitude modulation at the pitch rate, which is roughness.
 * Dividing by the accumulated weights takes it back out. The floor keeps the ends
 * of a half honest: there the sum really is under one because the recording has
 * run out, and that fade is the recording's own, not an artefact to correct.
 */
const LEVEL_FLOOR = 0.75;

function level(output: Float32Array, weights: Float32Array): Float32Array {
  for (let i = 0; i < output.length; i += 1) {
    const sum = weights[i];
    if (sum > LEVEL_FLOOR) output[i] /= sum;
    else if (sum > 0) output[i] /= LEVEL_FLOOR;
  }
  return output;
}

/** One half phone, re-timed, with the grain grid it was built on. */
interface Side {
  samples: Float32Array;
  marks: number[];
  mode: SideMode;
}

const EMPTY_SIDE: Side = { samples: new Float32Array(0), marks: [], mode: 'silent' };

/** The grain to lay down for one output position, read off the pitch marks. */
function grainFor(
  source: Float32Array,
  marks: number[],
  position: number,
  median: number,
  gapLimit: number,
  asyncFrame: number,
): { centre: number; halfWidth: number } {
  const index = median > 0 ? nearestMarkIndex(marks, position) : -1;
  if (index >= 0 && Math.abs(marks[index] - position) <= gapLimit) {
    // The step is the distance to the next mark, not a smoothed average of its
    // neighbours. Advancing the grid by anything other than the true spacing
    // lets the grain centres drift against the grid by a sample at a time,
    // which is nothing at 150 Hz and total cancellation at 4 kHz: measured,
    // the drift cost 94% of a high component that the same walk with the true
    // spacing keeps whole.
    const forward = index + 1 < marks.length ? marks[index + 1] - marks[index] : 0;
    const backward = index > 0 ? marks[index] - marks[index - 1] : 0;
    return { centre: marks[index], halfWidth: clampPeriod(forward || backward || median, median) };
  }
  // No mark near enough to trust: this stretch is unvoiced, so follow the
  // waveform itself on a fixed frame.
  return {
    centre: Math.min(source.length - 1, Math.max(0, Math.round(position))),
    halfWidth: asyncFrame,
  };
}

/**
 * Re-time one half phone by walking grains across it.
 *
 * Two rules make this transparent, and both were found by measuring what happens
 * without them.
 *
 * The grid starts on a mark and runs one grain past each end of the half. A
 * raised-cosine grain sums to one only where two of them overlap, so a half that
 * stops at its last grain ends at whatever fraction of a window was left -
 * measured, as little as 0.27 of full scale - and every join that follows starts
 * from a dip instead of from the voice. The audio a grain needs past the edge of a
 * half is the other half of the same recording, which is there to be read.
 *
 * A grain consumes a whole number of recorded periods whenever it has to skip any.
 * Advancing through the source by 2.4 periods instead of 2 puts every grain a
 * fraction of a voice cycle out of phase with the one before it, which is a step
 * in the waveform at every grain: that is the crackle. Skipping whole periods
 * leaves the voice continuous and simply shorter, which is what compression is
 * supposed to mean. Stretching needs no such rule, because there the stride is
 * under one period and the walk repeats marks in place.
 */
function grainSide(
  source: Float32Array,
  marks: number[],
  from: number,
  to: number,
  wanted: number,
  pitch: number,
  sampleRate: number,
  mode: SideMode,
): Side {
  const span = to - from;
  const output = new Float32Array(Math.max(0, wanted));
  const weights = new Float32Array(Math.max(0, wanted));
  const grid: number[] = [];
  if (span <= 0 || wanted <= 0 || !source.length) return { ...EMPTY_SIDE, samples: output, mode };
  const usable = marks.filter((mark) => Number.isFinite(mark) && mark >= 0 && mark < source.length);
  const median = medianPeriod(usable);
  const asyncFrame = clampPeriod(Math.round(sampleRate * ASYNC_FRAME_SECONDS), 160);
  const gapLimit = median > 0 ? UNVOICED_GAP_RATIO * median : 0;
  const scale = span / wanted;
  /**
   * Recorded periods one grain consumes: over one it skips, under one it repeats.
   * The count is accumulated and rounded, never rounded per grain, so a stride of
   * 1.4 skips one period, then two, then one - whole periods every time, which is
   * what keeps the voice continuous, and the right total, which is what keeps the
   * pitch it was asked for.
   */
  const stride = median > 0 ? scale / pitch : 0;

  /**
   * The grain for one step of the walk. Where a mark is near enough to trust, the
   * grain is that period and its width is the true distance to the next mark -
   * not a smoothed average of its neighbours, which lets the grain centres drift
   * against the grid by a sample at a time. That is nothing at 150 Hz and total
   * cancellation at 4 kHz: measured, the drift cost 94% of a high component that
   * the same walk with the true spacing keeps whole.
   */
  /**
   * Frames of unvoiced audio are not the same signal twice over, so where they
   * land on top of each other they add as noise rather than as one waveform: the
   * windows still sum to one, but the squares of the windows sum to 0.75, and a
   * fricative squeezed to half its length came out 13% quiet - measured, on white
   * noise, which is the worst case and the honest one for /s/ and /f/. The gain
   * below puts that back, and it is one exactly where the frames read the same
   * audio they would have read anyway, so an untouched unit stays untouched.
   */
  const coherence = Math.max(0, 1 - Math.abs(scale - 1));
  const asyncGain = 1 / Math.sqrt(coherence + (1 - coherence) * 0.75);

  const grainAt = (
    index: number,
    position: number,
  ): { centre: number; halfWidth: number; gain: number } => {
    let markIndex = Math.round(Math.max(0, Math.min(usable.length - 1, index)));
    if (usable.length && Math.abs(usable[markIndex] - position) > gapLimit) {
      // The grain count and the mark count have drifted apart, which is what
      // happens once a stretch of the half had no marks to follow. Snap to the
      // mark that is actually near this position rather than to the one the count
      // names: a grain placed a period away from where it was meant to be writes
      // the wrong audio and leaves the samples in between unwritten.
      const nearest = nearestMarkIndex(usable, position);
      if (nearest >= 0 && Math.abs(usable[nearest] - position) <= gapLimit) markIndex = nearest;
    }
    if (usable.length && Math.abs(usable[markIndex] - position) <= gapLimit) {
      const forward = markIndex + 1 < usable.length ? usable[markIndex + 1] - usable[markIndex] : 0;
      const backward = markIndex > 0 ? usable[markIndex] - usable[markIndex - 1] : 0;
      return { centre: usable[markIndex], halfWidth: clampPeriod(forward || backward || median, median), gain: 1 };
    }
    // No mark near enough to trust: this stretch is unvoiced, so follow the
    // waveform itself on a fixed frame.
    return {
      centre: Math.min(source.length - 1, Math.max(0, Math.round(position))),
      halfWidth: asyncFrame,
      gain: asyncGain,
    };
  };

  const firstIndex = usable.length ? nearestMarkIndex(usable, from) : 0;
  // Start the grid where this half's first mark falls, so that output sample p is
  // source sample from + p and the reconstruction stays aligned with the recording
  // it came from. That is what makes the two halves of a unit the *same* audio
  // across the overlap they share, so crossfading them cannot comb-filter. Pinning
  // the grid to output 0 instead shifts a half by up to half a voice cycle against
  // its neighbour: measured, a 97% dip in the window sum where the two halves meet.
  let index = firstIndex;
  let at = usable.length ? usable[firstIndex] - from : 0;
  for (let back = 0; at > 0 && back < 16; back += 1) {
    const strideMarks = Math.max(1, Math.round(stride));
    if (index - strideMarks < 0) break;
    index -= strideMarks;
    at -= grainAt(index, from + at * scale).halfWidth / pitch;
  }
  /**
   * Whatever the marks said, output sample 0 of a half is source sample `from`.
   * Where the walk back ran out of marks, the samples from output 0 to the first
   * mark have no period to follow and would be left unwritten - and an unwritten
   * sample is exact silence in the middle of a word.
   *
   * Measured across the SLT pack at identity, the case where the output should be
   * the recording, 268 of 1256 units came back holding a run of exact zeros of 8 ms
   * or more, the longest 143 ms, and the pack itself contains no such run at all:
   * those samples were never written. In a sentence it is dead air where a phone
   * was. "Author of the danger trail, Philip Steels, etc." came out of the BDL
   * voice with a 150 ms block of exact zeros inside "Steels", and that voice spent
   * 31.4% of its speaking time below the silence threshold where the human reading
   * of the same sentence spends 15.2%.
   *
   * So the lead is laid down here, on the waveform, at the recorded cadence, and it
   * stops exactly where the mark grid starts. Both halves of that matter. A lead
   * that reads the first mark from an output position a period before it is a
   * constant offset for that grain and none for the rest, and the two cancel where
   * they overlap: measured on a 4 kHz component, 0.200 down to 0.141. A lead laid
   * down on the 10 ms unvoiced frame tiles against a marked part walking on periods
   * of a different width, and the window sum is off by a third for the length of
   * the lead. Reading the waveform at the recorded period, and handing over on it,
   * does neither: the lead's grains read the same samples the marked grains do.
   */
  if (at > 0) {
    const leadStep = Math.max(1, (median > 0 ? median : asyncFrame) / pitch);
    const leadWidth = median > 0 ? clampPeriod(median, asyncFrame) : asyncFrame;
    const leadGain = (median > 0 ? 1 : asyncGain) / pitch;
    for (let lead = 0; lead < at; lead += leadStep) {
      const centre = Math.min(source.length - 1, Math.max(0, Math.round(from + lead * scale)));
      addGrain(output, weights, lead, source, centre, leadWidth, leadGain);
      grid.push(Math.round(lead));
    }
  }
  const firstGrainIndex = index;
  let consumed = 0;
  // A grain per iteration, and every iteration moves at least a few samples, so
  // the walk cannot stall; the ceiling is there anyway, and it is raised for a
  // high pitch because a tight grid means more grains.
  const ceiling = Math.ceil(((wanted + MAX_PERIOD_SAMPLES) * Math.max(1, pitch)) / 12) + 64;
  let iterations = 0;
  while (at < wanted && iterations < ceiling) {
    iterations += 1;
    // A raised-cosine grain twice as wide as the grid step sums to exactly one.
    // Changing the pitch tightens or widens the step without changing the grain,
    // so the windows would sum to the pitch instead; the gain cancels that.
    const grain = grainAt(firstGrainIndex + Math.round(consumed), from + at * scale);
    addGrain(output, weights, at, source, grain.centre, grain.halfWidth, grain.gain / pitch);
    if (at >= 0) grid.push(Math.round(at));
    at += grain.halfWidth / pitch;
    consumed += stride;
  }
  // The one grain past the end, whose left half brings the sum back to one.
  if (iterations < ceiling) {
    const grain = grainAt(firstGrainIndex + Math.round(consumed), from + at * scale);
    addGrain(output, weights, at, source, grain.centre, grain.halfWidth, grain.gain / pitch);
  }
  return { samples: level(output, weights), marks: grid, mode };
}

/**
 * Make one half phone shorter by cutting its middle out.
 *
 * The head and the tail of the recording are kept unmodified and joined over one
 * voice cycle. What survives is the way into the phone and the way out of it,
 * which is what identifies it: a /t/ cut from 100 ms to 20 ms is still a /t/,
 * where the same 20 ms assembled from grains a thousand samples apart in the
 * source is a crackle. The cut is placed in the middle rather than at a point of
 * low energy because at these lengths there is no low-energy point to find.
 */
function truncateSide(
  source: Float32Array,
  from: number,
  to: number,
  target: number,
  marks: number[],
  sampleRate: number,
): Side {
  const length = to - from;
  const wanted = Math.max(MIN_SIDE_SAMPLES, Math.min(Math.round(target), length));
  if (wanted >= length) {
    return { samples: source.slice(from, to), marks: marks.filter((m) => m >= from && m < to).map((m) => m - from), mode: 'truncated' };
  }
  const local = marks.filter((mark) => Number.isFinite(mark) && mark >= from && mark < to).map((mark) => mark - from);
  const period = medianPeriod(local) || clampPeriod(Math.round(sampleRate * ASYNC_FRAME_SECONDS), 160);
  const cross = Math.max(4, Math.min(period, Math.floor(wanted / 3), Math.floor(length / 3)));
  const head = Math.max(cross, Math.ceil((wanted + cross) / 2));
  const tail = Math.max(cross, wanted + cross - head);
  const output = new Float32Array(wanted);
  const tailStart = length - tail;

  for (let i = 0; i < head && i < wanted; i += 1) {
    const into = i - (head - cross);
    const weight = into < 0 ? 1 : Math.cos(((into + 1) / (cross + 1)) * (Math.PI / 2)) ** 2;
    output[i] = source[from + i] * weight;
  }
  for (let i = 0; i < tail; i += 1) {
    const at = head - cross + i;
    if (at >= wanted) break;
    const weight = i < cross ? Math.sin(((i + 1) / (cross + 1)) * (Math.PI / 2)) ** 2 : 1;
    output[at] = (i < cross ? output[at] : 0) + source[from + tailStart + i] * weight;
  }

  // Keep the marks of the parts that survived, at the positions they now have,
  // so a join on either side of a cut half still has a phase to align to. The
  // ones inside the crossfade belong to neither half and are dropped.
  const kept: number[] = [];
  for (const mark of local) {
    if (mark < head - cross) kept.push(mark);
    else if (mark >= tailStart) kept.push(head - cross + (mark - tailStart));
  }
  kept.sort((a, b) => a - b);
  return { samples: output, marks: kept, mode: 'truncated' };
}

/**
 * Whether a half phone is voiced, by how thickly its pitch marks cover it.
 *
 * A voice is marked once per period, so a half that carries marks at anything like
 * that density has a phase to lose; a half with a couple of marks in it is noise -
 * a fricative, a breath, a stop - and noise has no phase. The distinction decides
 * whether a heavy squeeze may cut, and it is the reason the answer is not the same
 * for both: cutting a vowel short costs a little of its steady state, where
 * cutting /s/ short costs the /s/.
 */
function isVoiced(marks: number[], from: number, to: number, sampleRate: number): boolean {
  const inside = marks.filter((mark) => mark >= from && mark < to).length;
  if (inside < 3) return false;
  const period = medianPeriod(marks.filter((mark) => mark >= from && mark < to));
  if (period <= 0) return false;
  return inside >= (0.4 * (to - from)) / period;
}

/** Decide how one half phone can be realised, and realise it. */
function buildSide(
  source: Float32Array,
  marks: number[],
  from: number,
  to: number,
  target: number,
  pitch: number,
  sampleRate: number,
): Side {
  const length = to - from;
  if (length <= 0) return { ...EMPTY_SIDE };
  const asked = Number.isFinite(target) && target > 0 ? Math.round(target) : length;
  const wanted = Math.max(MIN_SIDE_SAMPLES, asked);
  const ratio = wanted / length;
  // Noise is squeezed on frames, not cut. Frames of noise read from further
  // apart still add up to the same spectrum - measured, the 5 kHz share of white
  // noise survives a squeeze to half its length intact - where cutting it throws
  // away most of the energy that makes a fricative the consonant it is.
  if (ratio < TRUNCATE_BELOW_RATIO && isVoiced(marks, from, to, sampleRate)) {
    return truncateSide(source, from, to, wanted, marks, sampleRate);
  }
  const capped = ratio > MAX_STRETCH_RATIO;
  return grainSide(
    source,
    marks,
    from,
    to,
    Math.min(wanted, Math.round(length * MAX_STRETCH_RATIO)),
    pitch,
    sampleRate,
    capped ? 'capped' : 'grains',
  );
}

/**
 * Re-time one recorded unit to the planned duration of its two half phones.
 *
 * Duration comes from the targets, pitch from the grid spacing, and the two stay
 * independent: a lower voice does not become a slower sentence, which is what
 * resampling could never do.
 *
 * The halves are built separately, because one of them may have to be cut while
 * the other is walked, and then overlapped by one raised cosine so a change of
 * time scale at the phone boundary arrives over a voice cycle instead of at a
 * step. The weights are squared cosines: across a phone boundary the two halves
 * are the same recording, so what is wanted is a sum of exactly one, which squared
 * weights give and plain ones would raise by 3 dB.
 *
 * The overlap has to be in the source as well as in the output. Each half is read
 * half an overlap past the boundary and asked for that much more than its own
 * target, so the two halves carry the *same* audio across the overlap and the unit
 * still comes out on the plan. Sharing the output alone - the same span of source
 * asked for a little more than it is long - makes the grain centres drift against
 * the grid, which for a voice costs the top of the spectrum and for noise costs
 * 13% of the rms, both measured before this was fixed.
 */
export function synthesiseUnit(unit: MarkedUnit, options: PsolaOptions): SynthesisedUnit {
  const { samples, marks } = unit;
  if (!samples.length) return { samples: new Float32Array(0), marks: [], modes: [] };
  const pitch = options.pitch && Number.isFinite(options.pitch) && options.pitch > 0 ? options.pitch : 1;
  const split = Math.min(Math.max(Math.round(unit.boundary), 0), samples.length);
  const leftTarget = Number.isFinite(unit.leftTarget) && unit.leftTarget > 0 ? unit.leftTarget : split;
  const rightLength = samples.length - split;
  const rightTarget = Number.isFinite(unit.rightTarget) && unit.rightTarget > 0 ? unit.rightTarget : rightLength;
  const share = split > 0 && rightLength > 0
    ? Math.max(
        0,
        Math.min(
          Math.round(options.sampleRate * BOUNDARY_BLEND_SECONDS),
          Math.round(leftTarget),
          Math.round(rightTarget),
          2 * split,
          2 * rightLength,
        ),
      )
    : 0;
  const half = Math.floor(share / 2);

  const left = split > 0
    ? buildSide(samples, marks, 0, split + half, leftTarget + half, pitch, options.sampleRate)
    : { ...EMPTY_SIDE };
  const right = rightLength > 0
    ? buildSide(samples, marks, split - half, samples.length, rightTarget + half, pitch, options.sampleRate)
    : { ...EMPTY_SIDE };

  if (!right.samples.length) return { samples: left.samples, marks: left.marks, modes: [left.mode] };
  if (!left.samples.length) return { samples: right.samples, marks: right.marks, modes: [right.mode] };

  const shared = Math.max(0, Math.min(2 * half, left.samples.length, right.samples.length));
  const total = left.samples.length + right.samples.length - shared;
  const output = new Float32Array(total);
  output.set(left.samples);
  const at = left.samples.length - shared;
  for (let i = 0; i < shared; i += 1) {
    const phase = ((i + 1) / (shared + 1)) * (Math.PI / 2);
    const fade = Math.cos(phase) ** 2;
    output[at + i] = output[at + i] * fade + right.samples[i] * (1 - fade);
  }
  if (right.samples.length > shared) output.set(right.samples.subarray(shared), at + shared);

  const joined = [...left.marks];
  for (const mark of right.marks) joined.push(at + mark);
  joined.sort((a, b) => a - b);
  return { samples: output, marks: joined, modes: [left.mode, right.mode] };
}

/**
 * How much of two units to overlap, and therefore where their grains meet.
 *
 * One voice cycle is the natural length. Within a cycle around it, the exact
 * length is chosen so that this unit's first grain lands on one of the previous
 * unit's grains: two recordings of the same phone are never at quite the same
 * pitch, and the closer the grids coincide the less of the voice cycle is spent
 * cancelling. The nominal boundary is left where it was, so a caller deriving
 * word timings from it does not drift by a period at every join.
 */
function chooseBlend(
  previous: SynthesisedUnit,
  part: SynthesisedUnit,
  fallback: number,
): number {
  const limit = Math.max(8, Math.min(previous.samples.length, part.samples.length));
  if (!previous.marks.length || !part.marks.length) return Math.min(fallback, limit);
  const previousPeriod = medianPeriod(previous.marks);
  const partPeriod = medianPeriod(part.marks);
  const period = clampPeriod(
    Math.round((previousPeriod || fallback) / 2 + (partPeriod || fallback) / 2),
    fallback,
  );
  const firstMark = part.marks[0];
  let best = Math.min(period, limit);
  let bestScore = Number.POSITIVE_INFINITY;
  for (const factor of [0.5, 0.75, 1, 1.25, 1.5]) {
    const candidate = Math.max(8, Math.min(limit, Math.round(factor * period)));
    // Where this unit's first grain lands, in the previous unit's coordinates.
    const landing = previous.samples.length - candidate + firstMark;
    let score = Number.POSITIVE_INFINITY;
    for (const mark of previous.marks) score = Math.min(score, Math.abs(mark - landing));
    score /= period;
    // Slightly prefer a longer blend when two candidates align equally well:
    // more overlap means the two recordings are summed rather than switched.
    score -= candidate / (period * 40);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return Math.max(8, Math.min(best, limit));
}

/**
 * Join re-timed units into one waveform, aligning each junction to the voice
 * cycle on both sides.
 *
 * The blend is a raised cosine, which is what the fixed crossfade used; what
 * changes is its length - one voice cycle rather than 6 ms whatever the voice is
 * doing - and its position, chosen so the grains of the two recordings coincide.
 *
 * `starts[i]` is the nominal boundary between unit i-1 and unit i, which for a
 * diphone stream is the midpoint of the phone the two share, so callers can keep
 * deriving word timings from it exactly as they did before.
 */
export function joinInPhase(
  parts: SynthesisedUnit[],
  options: PsolaOptions,
): { samples: Float32Array; starts: number[] } {
  const live = parts.filter((part) => part.samples.length > 0);
  if (!live.length) return { samples: new Float32Array(0), starts: [] };
  const fallbackJoin = clampPeriod(Math.round(options.sampleRate * DEFAULT_JOIN_SECONDS), 96);
  const upperBound = live.reduce((total, part) => total + part.samples.length, 0);
  const output = new Float32Array(upperBound);
  const starts: number[] = [];
  let cursor = 0;

  live.forEach((part, index) => {
    if (index === 0) {
      output.set(part.samples, 0);
      starts.push(0);
      cursor = part.samples.length;
      return;
    }
    const previous = live[index - 1];
    const blend = chooseBlend(previous, part, fallbackJoin);
    const at = cursor - blend;
    starts.push(cursor);
    for (let i = 0; i < blend; i += 1) {
      const phase = ((i + 1) / (blend + 1)) * (Math.PI / 2);
      output[at + i] = output[at + i] * Math.cos(phase) + part.samples[i] * Math.sin(phase);
    }
    if (part.samples.length > blend) output.set(part.samples.subarray(blend), at + blend);
    cursor = at + part.samples.length;
  });

  return { samples: output.slice(0, Math.max(0, cursor)), starts };
}
