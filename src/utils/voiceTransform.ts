/**
 * Vocalis voice transformation — the stage that sits between assembled
 * recordings and the finished render.
 *
 * The recorded-unit assembly in `cmuDiphoneSynthesizer.ts` produces the base
 * voice; this module decides what a *profile* does to it: pitch, pace, vocal
 * tract resonance and tone character. It never touches the recordings and never
 * invents a voice — every sample it emits is a filtered, retimed copy of the
 * speaker's own audio.
 *
 * Design notes, because the previous version failed in ways that were audible
 * but invisible:
 *
 *   - Pitch is moved by resampling, which also moves duration. The resampler is
 *     windowed-sinc and low-passes before it decimates, so pitching a voice up
 *     does not fold high frequencies back into the band (that aliasing is what
 *     makes a voice sound like a metal box). Time is then put back by the
 *     stretcher, measured from the ORIGINAL length, so pitch and pace stay
 *     independent controls.
 *   - Pace is changed by overlap-add on a fixed 20 ms grid, where every new
 *     grain is aligned by normalised cross-correlation against the waveform
 *     that would naturally have followed the previous grain. Aligning is what
 *     keeps a periodic signal periodic: without it the two overlapping grains
 *     cancel each other's harmonics and the voice goes hollow and buzzy.
 *   - Moving pitch by resampling moves the formants with it, which changes who
 *     the speaker sounds like. The timbre correction measures the long-term
 *     spectrum before and after the shift and puts part of it back, over five
 *     wide bands, so a lower pitch sounds like the same person in a lower
 *     register rather than a different, larger creature.
 *   - The three resonance sliders (throat, oral, air) are applied here, which is
 *     the whole point of having them: before this module existed they were only
 *     heard on the reference-recording audition and silently did nothing to
 *     generated speech.
 *   - Every character filter is capped at COLOUR_MAX_GAIN_DB and made wide
 *     enough not to ring. That cap is what the second listening test required:
 *     the algorithms were clean, but the *sum* of the character filters put
 *     +13 dB through the 315–500 Hz region of a deep profile, and a barrel
 *     around a 90 Hz fundamental reads as a buzz, not as warmth.
 *
 * All of it is original Vocalis code. Where an idea is borrowed it is a
 * published concept, credited in docs/VOICE_SYNTHESIS_RESEARCH.md and
 * docs/PHASE3_VOICE_TRANSFORM.md; the statements of the algorithms here are
 * written from the concept, not from anybody's source.
 */

export type ToneStyle = 'natural' | 'deep' | 'energetic' | 'whisper' | 'radio' | 'robot';

export interface VoiceTransformSettings {
  /** F0 multiplier: 1 is the speaker's own pitch. */
  pitch: number;
  /** Pace multiplier: 1 is the recorded pace, 2 speaks twice as fast. */
  rate: number;
  toneStyle: ToneStyle;
  /** Vocal tract resonance in dB at the formant centres, -10…+10. */
  throatWarmth?: number;
  oralClarity?: number;
  airPresence?: number;
  /**
   * How much of the spectral envelope survives a pitch shift, 0…1.
   * 0 moves the formants with F0 (a different-sized speaker); 1 keeps the
   * formants where they were (the same speaker in another register).
   */
  formantPreservation?: number;
  /**
   * Stages switched off by name. A bypassed stage is not run at all — it is not
   * "run with a neutral value", which is the difference between a switch that does
   * something and one that only looks like it does.
   */
  bypass?: Partial<
    Record<'pitch' | 'rate' | 'tone' | 'throatWarmth' | 'oralClarity' | 'airPresence' | 'contour', boolean>
  >;
}

/**
 * How much formant movement is cancelled by default.
 *
 * Real voices do lower their formants slightly when they speak lower, so full
 * preservation can sound like a small person pretending to be large. Two thirds
 * keeps the vowel colour recognisable while still letting a deep profile darken.
 */
export const DEFAULT_FORMANT_PRESERVATION = 0.5;

/** Below these deviations nothing is worth processing: the audio is left alone. */
const PITCH_DEADBAND = 0.008;
const RATE_DEADBAND = 0.01;

/**
 * Resampler: taps either side of the read position, and how far below the new
 * Nyquist the anti-alias cutoff sits. A longer kernel and a wider margin mean a
 * steeper stopband, which is the difference between removing content that cannot
 * be represented and folding it back into the voice as a whistle.
 */
const SINC_HALF_TAPS = 16;
const ANTI_ALIAS_MARGIN = 0.85;

/** Overlap-add grid for pace: a 20 ms hop under a 40 ms raised-cosine window. */
const STRETCH_HOP_SECONDS = 0.02;
const STRETCH_ALIGN_SECONDS = 0.01;
const STRETCH_STEP = 4;

/** Spectral analysis for timbre matching: wide bands, one frame per 16 ms. */
const ENVELOPE_FRAME = 512;
const ENVELOPE_HOP = 256;
/**
 * The number of wide bands the timbre correction is allowed to use.
 *
 * This is the second version of the correction. The first measured eighteen
 * narrow bands and corrected each with its own peaking section, which put
 * eighteen filters in series behind every profile; measured against the
 * pitch-shifted voice it drove neighbouring third-octave bands more than 6 dB
 * apart and left a comb through the vowel region — colour, not correction.
 * Five overlapping wide bands can only express a tilt, and a tilt is the whole
 * of what "same speaker, lower register" means.
 */
const ENVELOPE_BANDS = 5;
/**
 * Bounds on the timbre correction, in dB, applied to the shifted voice.
 *
 * The correction restores the vocal tract, not the recording: three decibels is
 * roughly the difference between two vowels of the same speaker, and staying
 * inside it keeps a deep profile sounding like the speaker rather than like a
 * resonant tube. Every colouring filter in this module is bounded by the same
 * budget — see COLOUR_MAX_GAIN_DB.
 */
const ENVELOPE_MIN_HZ = 150;
const ENVELOPE_MAX_HZ = 5000;
const ENVELOPE_MAX_GAIN_DB = 3;

/**
 * The most any single profile control may move one region of the spectrum.
 *
 * This constant is the fix for what actually made the profiles sound wrong.
 * Pitch, pace and the resampler measured clean: no jitter, no aliases, no grain
 * buzz. What did not measure clean was the sum of the character filters. The
 * eight shipped profiles asked for throatWarmth up to +7 dB at 450 Hz *and* a
 * "deep" tone style that boosted 150 and 420 Hz, so Marcus's finished render
 * carried +13 dB between 315 and 500 Hz against the recording it was built
 * from — a barrel, on a voice whose fundamental is 90 Hz, which is exactly what
 * a boom plus buzz sounds like. Each control is now capped here and given a
 * bandwidth wide enough that the bands cannot stack into a resonance peak.
 */
export const COLOUR_MAX_GAIN_DB = 3;

// ---------------------------------------------------------------------------
// Small signal-processing primitives
// ---------------------------------------------------------------------------

const clamp = (value: number, low: number, high: number) => (value < low ? low : value > high ? high : value);

/** Raised-cosine window of `length` samples, peaking at 1 in the middle. */
function raisedCosine(length: number): Float32Array {
  const window = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (index + 0.5)) / length);
  }
  return window;
}

/** Band-limited interpolation kernel: sinc shaped by a raised-cosine window. */
function sincKernel(distance: number, cutoff: number): number {
  const angle = Math.PI * distance;
  const narrowed = angle * cutoff;
  const sinc = Math.abs(narrowed) < 1e-9 ? 1 : Math.sin(narrowed) / narrowed;
  const tap = Math.abs(distance) / SINC_HALF_TAPS;
  const window = tap >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * tap);
  return sinc * window * cutoff;
}

/**
 * Iterative radix-2 FFT, in place. Only ever used on power-of-two buffers, and
 * only to measure spectra — it never shapes the audio itself.
 */
function fftInPlace(real: Float64Array, imaginary: Float64Array): void {
  const size = real.length;
  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) {
      const swapReal = real[index];
      const swapImaginary = imaginary[index];
      real[index] = real[reversed];
      imaginary[index] = imaginary[reversed];
      real[reversed] = swapReal;
      imaginary[reversed] = swapImaginary;
    }
  }
  for (let span = 2; span <= size; span <<= 1) {
    const angle = (-2 * Math.PI) / span;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    const half = span >> 1;
    for (let start = 0; start < size; start += span) {
      let phasorReal = 1;
      let phasorImaginary = 0;
      for (let offset = 0; offset < half; offset += 1) {
        const evenIndex = start + offset;
        const oddIndex = evenIndex + half;
        const oddReal = real[oddIndex] * phasorReal - imaginary[oddIndex] * phasorImaginary;
        const oddImaginary = real[oddIndex] * phasorImaginary + imaginary[oddIndex] * phasorReal;
        real[oddIndex] = real[evenIndex] - oddReal;
        imaginary[oddIndex] = imaginary[evenIndex] - oddImaginary;
        real[evenIndex] += oddReal;
        imaginary[evenIndex] += oddImaginary;
        const nextPhasorReal = phasorReal * stepReal - phasorImaginary * stepImaginary;
        phasorImaginary = phasorReal * stepImaginary + phasorImaginary * stepReal;
        phasorReal = nextPhasorReal;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pitch: band-limited resampling
// ---------------------------------------------------------------------------

/**
 * Change pitch by resampling, without folding aliases back into the band.
 *
 * Reading the waveform faster raises both F0 and every formant, and shortens the
 * audio by the same factor — the caller puts the duration back. When the read
 * position advances faster than one input sample the signal must be low-passed
 * first, otherwise everything above the new Nyquist lands inside the voice as a
 * metallic whistle; the cutoff in the kernel does that in the same pass.
 */
export function shiftPitchBandLimited(input: Float32Array, factor: number): Float32Array {
  if (input.length === 0) return new Float32Array(0);
  const bounded = clamp(factor, 0.25, 4);
  if (Math.abs(bounded - 1) < PITCH_DEADBAND) return Float32Array.from(input);

  const length = Math.max(1, Math.floor(input.length / bounded));
  const output = new Float32Array(length);
  const cutoff = bounded > 1 ? clamp(ANTI_ALIAS_MARGIN / bounded, 0.1, 1) : 1;

  for (let index = 0; index < length; index += 1) {
    const position = index * bounded;
    const nearest = Math.floor(position);
    let weighted = 0;
    let weight = 0;
    for (let tap = -SINC_HALF_TAPS + 1; tap <= SINC_HALF_TAPS; tap += 1) {
      const source = nearest + tap;
      if (source < 0 || source >= input.length) continue;
      const kernel = sincKernel(position - source, cutoff);
      weighted += input[source] * kernel;
      weight += kernel;
    }
    // Normalising keeps the level flat where the kernel is truncated at the
    // very start and end of the render.
    output[index] = weight > 1e-6 ? weighted / weight : 0;
  }
  return output;
}

// ---------------------------------------------------------------------------
// Pace: correlation-aligned overlap-add
// ---------------------------------------------------------------------------

/** Normalised cross-correlation of two equal-length windows. */
function similarity(a: Float32Array, aStart: number, b: Float32Array, bStart: number, length: number): number {
  let dot = 0;
  let energyA = 0;
  let energyB = 0;
  for (let index = 0; index < length; index += 1) {
    const left = a[aStart + index] ?? 0;
    const right = b[bStart + index] ?? 0;
    dot += left * right;
    energyA += left * left;
    energyB += right * right;
  }
  const norm = Math.sqrt(energyA * energyB);
  return norm > 1e-9 ? dot / norm : 0;
}

/**
 * Change pace by overlap-add, aligning every grain before it is mixed in.
 *
 * The grid is fixed — 20 ms in, 20 ms out — so the cost is linear and the result
 * is deterministic. What is not fixed is *which* 40 ms of the input each output
 * grain reads: the candidate that best continues what was just written wins, so
 * the overlap never mixes two grains whose periods disagree. A fixed grid with
 * unaligned grains is exactly the flanging, hollow, "clunky" artefact that makes
 * a stretched voice sound synthetic.
 */
export function stretchTime(input: Float32Array, targetLength: number, sampleRate: number): Float32Array {
  const target = Math.max(1, Math.round(targetLength));
  if (input.length === 0) return new Float32Array(target);

  const stretch = target / input.length;
  if (Math.abs(stretch - 1) < RATE_DEADBAND) {
    if (target === input.length) return Float32Array.from(input);
    // A pace change this small is not audible; resampling linearly would change
    // pitch instead, so the render keeps the samples it already has.
    const copy = new Float32Array(target);
    copy.set(input.subarray(0, Math.min(input.length, target)));
    return copy;
  }

  const hop = Math.max(32, Math.round(STRETCH_HOP_SECONDS * sampleRate));
  const windowLength = hop * 2;
  const search = Math.max(STRETCH_STEP, Math.round(STRETCH_ALIGN_SECONDS * sampleRate));

  if (input.length < windowLength * 2) {
    // Too short to overlap-add: a straight read is the least harmful option.
    const direct = new Float32Array(target);
    for (let index = 0; index < target; index += 1) {
      const position = (index * input.length) / target;
      const left = Math.min(input.length - 1, Math.floor(position));
      const right = Math.min(input.length - 1, left + 1);
      const fraction = position - left;
      direct[index] = input[left] * (1 - fraction) + input[right] * fraction;
    }
    return direct;
  }

  const window = raisedCosine(windowLength);
  const analysisHop = hop / stretch;
  const padded = new Float32Array(target + windowLength);
  const weights = new Float32Array(padded.length);
  const furthestStart = input.length - windowLength;
  let source = 0;
  let written = 0;

  while (written < target) {
    if (written > 0) {
      const expected = Math.round(source + analysisHop);
      const continuation = source + hop;
      const compareLength = Math.min(hop, input.length - continuation);
      let best = clamp(expected, 0, furthestStart);
      if (compareLength > 0) {
        let bestScore = -Infinity;
        const from = Math.max(0, expected - search);
        const to = Math.min(furthestStart, expected + search);
        for (let candidate = from; candidate <= to; candidate += STRETCH_STEP) {
          const score = similarity(input, candidate, input, continuation, compareLength);
          if (score > bestScore) {
            bestScore = score;
            best = candidate;
          }
        }
      }
      source = clamp(best, 0, furthestStart);
    }
    const span = Math.min(windowLength, input.length - source, padded.length - written);
    for (let index = 0; index < span; index += 1) {
      const weight = window[index];
      padded[written + index] += input[source + index] * weight;
      weights[written + index] += weight;
    }
    written += hop;
  }

  const output = new Float32Array(target);
  for (let index = 0; index < target; index += 1) {
    output[index] = weights[index] > 1e-6 ? padded[index] / weights[index] : 0;
  }
  return output;
}

// ---------------------------------------------------------------------------
// Resonance: two-pole peaking bands
// ---------------------------------------------------------------------------

/**
 * One peaking band: a unit-height bandpass around `frequency`, scaled by the
 * requested gain and added back to the dry signal.
 *
 * Deriving the bandpass from its pole radius means the bandwidth is a real
 * quantity in Hz rather than a filter-order guess, and the gain at the centre is
 * exact because the section is normalised numerically — no coefficient cookbook
 * is needed for a filter this simple.
 */
function peakingBand(input: Float32Array, frequency: number, bandwidth: number, gainDb: number, sampleRate: number): Float32Array {
  if (Math.abs(gainDb) < 0.05 || frequency <= 0 || frequency >= sampleRate / 2) return input;

  const radius = Math.exp((-Math.PI * Math.min(bandwidth, sampleRate / 2.5)) / sampleRate);
  const angle = (2 * Math.PI * frequency) / sampleRate;
  // Two-pole bandpass, numerator 1 - z⁻² so the response is zero at DC and at
  // Nyquist and peaks between them, exactly on the requested frequency.
  const feedthrough = (1 - radius * radius) / 2;
  const feedback1 = -2 * radius * Math.cos(angle);
  const feedback2 = radius * radius;

  // Height of the band at its own centre, from the transfer function itself, so
  // the gain that is asked for is the gain that arrives.
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const numeratorReal = feedthrough * (1 - Math.cos(2 * angle));
  const numeratorImaginary = feedthrough * Math.sin(2 * angle);
  const denominatorReal = 1 + feedback1 * cosine + feedback2 * Math.cos(2 * angle);
  const denominatorImaginary = -feedback1 * sine - feedback2 * Math.sin(2 * angle);
  const denominator = Math.hypot(denominatorReal, denominatorImaginary);
  const height = denominator > 1e-12 ? Math.hypot(numeratorReal, numeratorImaginary) / denominator : 0;
  if (height < 1e-4) return input;
  const scale = (Math.pow(10, gainDb / 20) - 1) / height;

  const output = new Float32Array(input.length);
  let input1 = 0;
  let input2 = 0;
  let delay1 = 0;
  let delay2 = 0;
  for (let index = 0; index < input.length; index += 1) {
    const sample = input[index];
    const band =
      feedthrough * (sample - input2) - feedback1 * delay1 - feedback2 * delay2;
    input2 = input1;
    input1 = sample;
    delay2 = delay1;
    delay1 = band;
    const shaped = sample + scale * band;
    output[index] = Number.isFinite(shaped) ? shaped : sample;
  }
  return output;
}

// ---------------------------------------------------------------------------
// Formant preservation
// ---------------------------------------------------------------------------

/** Wide, overlapping band centres used by the timbre measurement. */
const TIMBRE_BANDS: Array<{ centre: number; width: number }> = [
  { centre: 180, width: 300 },
  { centre: 450, width: 400 },
  { centre: 1100, width: 800 },
  { centre: 2400, width: 1500 },
  { centre: 4500, width: 2000 },
];

/** The bands actually used, trimmed to `ENVELOPE_BANDS` and to Nyquist. */
function envelopeBands(sampleRate: number): Array<{ centre: number; width: number }> {
  return TIMBRE_BANDS.filter((band) => band.centre < sampleRate / 2).slice(0, ENVELOPE_BANDS);
}

/**
 * Average power per band over the whole render, in dB.
 *
 * Welch-style: overlapping raised-cosine frames, mean power spectrum, band
 * integration. Silent frames are skipped so a long pause cannot drag the
 * envelope down and turn the correction into a bass boost.
 */
function measureEnvelope(input: Float32Array, sampleRate: number): Float32Array {
  const bands = envelopeBands(sampleRate);
  const power = new Float64Array(bands.length);
  const counted = new Float64Array(bands.length);
  const window = raisedCosine(ENVELOPE_FRAME);
  const real = new Float64Array(ENVELOPE_FRAME);
  const imaginary = new Float64Array(ENVELOPE_FRAME);
  const binHz = sampleRate / ENVELOPE_FRAME;
  let frames = 0;

  for (let start = 0; start + ENVELOPE_FRAME <= input.length; start += ENVELOPE_HOP) {
    let energy = 0;
    for (let index = 0; index < ENVELOPE_FRAME; index += 1) {
      const sample = input[start + index];
      energy += sample * sample;
      real[index] = sample * window[index];
      imaginary[index] = 0;
    }
    if (energy / ENVELOPE_FRAME < 1e-5) continue;
    fftInPlace(real, imaginary);
    frames += 1;
    for (let band = 0; band < bands.length; band += 1) {
      const { centre, width } = bands[band];
      const from = Math.max(1, Math.round((centre - width / 2) / binHz));
      const to = Math.min(ENVELOPE_FRAME / 2 - 1, Math.round((centre + width / 2) / binHz));
      let sum = 0;
      for (let bin = from; bin <= to; bin += 1) sum += real[bin] * real[bin] + imaginary[bin] * imaginary[bin];
      power[band] += sum / Math.max(1, to - from + 1);
      counted[band] += 1;
    }
  }

  const envelope = new Float32Array(bands.length);
  for (let band = 0; band < bands.length; band += 1) {
    const mean = counted[band] > 0 ? power[band] / counted[band] : 0;
    envelope[band] = mean > 0 ? 10 * Math.log10(mean) : -120;
  }
  return frames > 0 ? envelope : new Float32Array(0);
}

/**
 * Put part of the original spectral envelope back after a pitch shift.
 *
 * `original` is the audio before the shift and `shifted` the audio after it.
 * The correction is the difference between the two measured envelopes, scaled by
 * `amount`: at 0 nothing changes, at 1 the vocal tract is back where it was.
 * Both the band set (five wide bands) and the gain bound
 * (`ENVELOPE_MAX_GAIN_DB`) keep this a tilt; see the note on ENVELOPE_BANDS for
 * why a finer measurement made the voice worse rather than better.
 */
export function preserveFormants(
  original: Float32Array,
  shifted: Float32Array,
  amount: number,
  sampleRate: number,
): Float32Array {
  if (amount <= 0.01 || original.length < ENVELOPE_FRAME * 2 || shifted.length < ENVELOPE_FRAME * 2) {
    return shifted;
  }
  const before = measureEnvelope(original, sampleRate);
  const after = measureEnvelope(shifted, sampleRate);
  if (!before.length || !after.length) return shifted;

  const bands = envelopeBands(sampleRate);
  const gains = new Float32Array(bands.length);
  for (let band = 0; band < bands.length; band += 1) {
    // A missing band (silence in one of the two) would ask for an infinite
    // boost, so it is left alone.
    if (before[band] <= -100 || after[band] <= -100) {
      gains[band] = 0;
      continue;
    }
    gains[band] = (before[band] - after[band]) * amount;
  }
  // Smooth across neighbouring bands before clamping, so the correction is a
  // tilt rather than a row of independent spikes. With wide bands there is
  // little left for this to do, which is the point: it can no longer build a
  // row of spikes out of a noisy measurement.
  const smoothed = new Float32Array(bands.length);
  for (let band = 0; band < bands.length; band += 1) {
    const left = gains[Math.max(0, band - 1)];
    const right = gains[Math.min(bands.length - 1, band + 1)];
    const inRange = bands[band].centre >= ENVELOPE_MIN_HZ && bands[band].centre <= ENVELOPE_MAX_HZ;
    smoothed[band] = inRange
      ? clamp((left + 2 * gains[band] + right) / 4, -ENVELOPE_MAX_GAIN_DB, ENVELOPE_MAX_GAIN_DB)
      : 0;
  }

  let corrected = shifted;
  for (let band = 0; band < bands.length; band += 1) {
    corrected = peakingBand(corrected, bands[band].centre, bands[band].width, smoothed[band], sampleRate);
  }
  return corrected;
}

// ---------------------------------------------------------------------------
// Tone character
// ---------------------------------------------------------------------------

/**
 * The profile's tone style, as a filter rather than as a secret pitch change.
 *
 * `deep` and `energetic` used to multiply pitch and pace behind the scenes, so a
 * slider reading 0.72 delivered 0.66 and the interface was wrong about its own
 * audio. They now shape resonance only; pitch and pace stay exactly what the
 * profile asked for. `whisper`, `radio` and `robot` are deliberately synthetic
 * characters and keep their sample-domain treatment.
 */
function applyToneStyle(input: Float32Array, style: ToneStyle, sampleRate: number): Float32Array {
  switch (style) {
    case 'deep':
      // One wide band below the first formant, at half the budget. The previous
      // version stacked two bands here *and* was stacked on top of the throat
      // slider, which is where the +13 dB barrel came from. Deepness itself is
      // the pitch control, not this filter: this only takes the edge off.
      return peakingBand(input, 190, 300, COLOUR_MAX_GAIN_DB * 0.5, sampleRate);
    case 'energetic':
      return peakingBand(input, 2800, 2200, COLOUR_MAX_GAIN_DB * 0.5, sampleRate);
    case 'whisper':
    case 'radio':
    case 'robot':
      return applyCharacterEffect(input, style, sampleRate);
    default:
      return input;
  }
}

/** The three deliberately synthetic characters, applied per sample. */
function applyCharacterEffect(input: Float32Array, style: ToneStyle, sampleRate: number): Float32Array {
  const output = new Float32Array(input.length);
  let previous = 0;
  let phase = 0;
  for (let index = 0; index < input.length; index += 1) {
    const sample = input[index];
    if (style === 'radio') {
      // Band-limited to the old broadcast band, then gently saturated. The
      // emphasis is on "gently": hard clipping is what makes a vintage effect
      // sound like a broken speaker.
      const highPassed = sample - previous * 0.91;
      previous = sample;
      output[index] = Math.tanh(highPassed * 2.4) * 0.8;
    } else if (style === 'robot') {
      // A slow amplitude ring modulation, the intentional mechanical character.
      output[index] = sample * (0.72 + 0.28 * Math.sin(phase));
      phase += (2 * Math.PI * 34) / sampleRate;
    } else {
      // A softened, brighter, quieter timbre. This is a filtered speaking
      // voice, not a true whisper recording, and the interface says so.
      const highPassed = sample - previous * 0.96;
      previous = sample;
      output[index] = sample * 0.42 + highPassed * 0.42;
    }
  }
  return output;
}

/**
 * Keep the level where it was, so a profile changes the shape of the voice and
 * not its volume.
 *
 * Every filter in this module is a wide boost, and a wide boost is not free: it
 * lifts its own region and, because the addition carries phase, leans on the
 * neighbourhood too. Broadband measurement showed the three sliders at their cap
 * moving the root-mean-square level by about 12 %, which is heard as "this
 * profile is quieter" whenever nothing downstream re-normalises — the audition
 * path, for one. The render path normalises by peak afterwards, so this is the
 * only place where a stable level can be guaranteed for both.
 *
 * Note what it does not do: it cannot stop a boost from raising the crest
 * factor, and a peak normaliser then has to turn the whole render down a
 * decibel. That is physics, not a bug, and it is why the shipped profiles keep
 * their colouring inside three decibels.
 */
function levelMatched(reference: Float32Array, shaped: Float32Array): Float32Array {
  const meanSquare = (samples: Float32Array) => {
    let total = 0;
    for (let index = 0; index < samples.length; index += 1) total += samples[index] * samples[index];
    return samples.length > 0 ? total / samples.length : 0;
  };
  const before = meanSquare(reference);
  const after = meanSquare(shaped);
  if (before <= 0 || after <= 0) return shaped;
  const scale = Math.sqrt(before / after);
  if (Math.abs(scale - 1) < 1e-6) return shaped;
  const output = new Float32Array(shaped.length);
  for (let index = 0; index < shaped.length; index += 1) output[index] = shaped[index] * scale;
  return output;
}

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

/**
 * Apply a profile to freshly assembled recorded audio.
 *
 * Order matters: pitch first (band-limited, so nothing folds back), then the
 * formant correction on the shifted signal, then pace (which must not change
 * pitch), then the tone character, then the resonance sliders at last — those
 * belong to the finished voice, and their band centres follow whatever the pitch
 * shift did to the vocal tract.
 */
export function transformRecordedVoice(
  samples: Float32Array,
  settings: VoiceTransformSettings,
  sampleRate: number,
): Float32Array {
  if (samples.length === 0) return samples;

  const bypass = settings.bypass ?? {};
  const pitch = clamp(settings.pitch, 0.25, 4);
  const rate = clamp(settings.rate, 0.55, 2.5);
  const preservation = clamp(settings.formantPreservation ?? DEFAULT_FORMANT_PRESERVATION, 0, 1);

  // Every switch removes its stage rather than neutralising it, so "pitch off" is
  // the recorded pitch and not a pitch shift by 1.0 — those are different code
  // paths, and only one of them can be trusted to leave the samples alone.
  const pitchOn = !bypass.pitch && Math.abs(pitch - 1) > PITCH_DEADBAND;
  const shifted = pitchOn ? shiftPitchBandLimited(samples, pitch) : samples;
  const corrected = pitchOn ? preserveFormants(samples, shifted, preservation, sampleRate) : shifted;

  // Pace is measured against the recording, and the signal has to end up that many
  // samples long whatever the pitch stage did to its length on the way through. So
  // the stage runs when the pace is not neutral *or* when the pitch resample changed
  // the length — restoring a length is not a pace change, and skipping it would make
  // the switch that turns pace off change the duration.
  const effectiveRate = bypass.rate ? 1 : rate;
  const targetLength = Math.max(1, Math.floor(samples.length / effectiveRate));
  const needsStretch = Math.abs(effectiveRate - 1) > RATE_DEADBAND || corrected.length !== targetLength;
  const paced = needsStretch ? stretchTime(corrected, targetLength, sampleRate) : corrected;

  const styled =
    bypass.tone || settings.toneStyle === 'natural'
      ? paced
      : applyToneStyle(paced, settings.toneStyle, sampleRate);

  // The sliders name formant regions, so their centres move with the tract: at
  // full preservation F1 stays at 450 Hz, at none it moves with F0.
  const tractScale = Math.pow(pitch, 1 - preservation);
  let resonated = styled;
  // Wide bands on purpose: at a quarter of an octave wide these three sections
  // overlapped around 400 Hz and added up to a resonance. At a little over one
  // octave each they tilt, and the cap keeps every one of them inside the same
  // three-decibel budget as the timbre correction.
  const bands: Array<[number, number, number]> = [
    bypass.throatWarmth
      ? [0, 450, 450]
      : [clamp(settings.throatWarmth ?? 0, -COLOUR_MAX_GAIN_DB, COLOUR_MAX_GAIN_DB), 450, 450],
    bypass.oralClarity
      ? [0, 1800, 1800]
      : [clamp(settings.oralClarity ?? 0, -COLOUR_MAX_GAIN_DB, COLOUR_MAX_GAIN_DB), 1800, 1800],
    bypass.airPresence
      ? [0, 4200, 2600]
      : [clamp(settings.airPresence ?? 0, -COLOUR_MAX_GAIN_DB, COLOUR_MAX_GAIN_DB), 4200, 2600],
  ];
  for (const [gain, frequency, bandwidth] of bands) {
    // A band at 0 dB is unity, but it is still a filter; skipping it keeps an
    // all-switches-off render sample-for-sample identical to the recording.
    if (gain === 0) continue;
    resonated = peakingBand(resonated, frequency * tractScale, bandwidth * tractScale, gain, sampleRate);
  }

  // Nothing ran: hand back a copy of exactly what came in.
  if (resonated === paced && paced === corrected && corrected === samples) {
    return Float32Array.from(samples);
  }
  return levelMatched(paced, resonated);
}
