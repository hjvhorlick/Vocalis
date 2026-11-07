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
 *     the speaker sounds like. `formantPreservation` measures the long-term
 *     spectral envelope before and after the shift and puts part of the
 *     envelope back, so a lower pitch sounds like the same person in a lower
 *     register rather than a different, larger creature.
 *   - The three resonance sliders (throat, oral, air) are applied here, which is
 *     the whole point of having them: before this module existed they were only
 *     heard on the reference-recording audition and silently did nothing to
 *     generated speech.
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

/** Spectral envelope analysis for formant preservation. */
const ENVELOPE_FRAME = 512;
const ENVELOPE_HOP = 256;
const ENVELOPE_BANDS = 18;
const ENVELOPE_LOW_HZ = 90;
const ENVELOPE_HIGH_HZ = 7200;
/**
 * Bounds on the formant correction.
 *
 * The correction only restores the vocal tract, not the recording: it is
 * limited to the range where vowels and consonants carry identity, it never
 * moves a band by more than 6 dB, and neighbouring bands are smoothed together
 * so a single noisy measurement cannot become a whistle. Without these bounds a
 * down-shift asks for a large high-frequency lift, which turns room noise into
 * hiss and makes the voice harsher than the un-corrected version.
 */
const ENVELOPE_MIN_HZ = 100;
const ENVELOPE_MAX_HZ = 5000;
const ENVELOPE_MAX_GAIN_DB = 6;

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

/** Log-spaced band centres used by the envelope measurement. */
function envelopeBands(sampleRate: number): Array<{ centre: number; width: number }> {
  const bands: Array<{ centre: number; width: number }> = [];
  const ratio = Math.pow(ENVELOPE_HIGH_HZ / ENVELOPE_LOW_HZ, 1 / (ENVELOPE_BANDS - 1));
  for (let index = 0; index < ENVELOPE_BANDS; index += 1) {
    const centre = ENVELOPE_LOW_HZ * Math.pow(ratio, index);
    if (centre >= sampleRate / 2) break;
    bands.push({ centre, width: centre * (ratio - 1) });
  }
  return bands;
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
  // tilt rather than a row of independent spikes.
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
      return peakingBand(peakingBand(input, 150, 220, 4.5, sampleRate), 420, 320, 2, sampleRate);
    case 'energetic':
      return peakingBand(peakingBand(input, 3000, 1600, 3.5, sampleRate), 6200, 3000, 2, sampleRate);
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

  const pitch = clamp(settings.pitch, 0.25, 4);
  const rate = clamp(settings.rate, 0.55, 2.5);
  const preservation = clamp(settings.formantPreservation ?? DEFAULT_FORMANT_PRESERVATION, 0, 1);

  const shifted = shiftPitchBandLimited(samples, pitch);
  const corrected =
    Math.abs(pitch - 1) > PITCH_DEADBAND
      ? preserveFormants(samples, shifted, preservation, sampleRate)
      : shifted;

  const targetLength = Math.max(1, Math.floor(samples.length / rate));
  const paced = stretchTime(corrected, targetLength, sampleRate);

  const styled = applyToneStyle(paced, settings.toneStyle, sampleRate);

  // The sliders name formant regions, so their centres move with the tract: at
  // full preservation F1 stays at 450 Hz, at none it moves with F0.
  const tractScale = Math.pow(pitch, 1 - preservation);
  let resonated = styled;
  const bands: Array<[number, number, number]> = [
    [(settings.throatWarmth ?? 0), 450, 260],
    [(settings.oralClarity ?? 0), 1800, 700],
    [(settings.airPresence ?? 0), 4200, 1600],
  ];
  for (const [gain, frequency, bandwidth] of bands) {
    resonated = peakingBand(resonated, frequency * tractScale, bandwidth * tractScale, gain, sampleRate);
  }

  return resonated;
}
