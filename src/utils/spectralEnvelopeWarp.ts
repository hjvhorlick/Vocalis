/**
 * Bounded STFT spectral-envelope warp. The carrier phase/harmonic locations are
 * retained while the smoothed log-magnitude envelope is sampled at a new
 * frequency axis, which moves broad vocal-tract resonances rather than merely
 * boosting fixed EQ bands. Use only on a decoded working copy.
 */
function fft(real: Float64Array, imaginary: Float64Array, inverse = false): void {
  const count = real.length;
  for (let index = 1, reversed = 0; index < count; index++) {
    let bit = count >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }
  for (let size = 2; size <= count; size <<= 1) {
    const angle = (inverse ? 2 : -2) * Math.PI / size;
    const stepReal = Math.cos(angle), stepImaginary = Math.sin(angle);
    for (let start = 0; start < count; start += size) {
      let unitReal = 1, unitImaginary = 0;
      const half = size >> 1;
      for (let offset = 0; offset < half; offset++) {
        const even = start + offset, odd = even + half;
        const transformedReal = real[odd] * unitReal - imaginary[odd] * unitImaginary;
        const transformedImaginary = real[odd] * unitImaginary + imaginary[odd] * unitReal;
        const evenReal = real[even], evenImaginary = imaginary[even];
        real[even] = evenReal + transformedReal; imaginary[even] = evenImaginary + transformedImaginary;
        real[odd] = evenReal - transformedReal; imaginary[odd] = evenImaginary - transformedImaginary;
        const nextReal = unitReal * stepReal - unitImaginary * stepImaginary;
        unitImaginary = unitReal * stepImaginary + unitImaginary * stepReal;
        unitReal = nextReal;
      }
    }
  }
  if (inverse) for (let index = 0; index < count; index++) { real[index] /= count; imaginary[index] /= count; }
}

function interpolate(values: Float64Array, position: number): number {
  const lower = Math.max(0, Math.min(values.length - 1, Math.floor(position)));
  const upper = Math.min(values.length - 1, lower + 1);
  const amount = position - lower;
  return values[lower] * (1 - amount) + values[upper] * amount;
}

export function warpSpectralEnvelope(input: Float32Array, factor: number): Float32Array {
  const bounded = Math.max(0.85, Math.min(1.15, factor));
  if (Math.abs(bounded - 1) < 0.002 || input.length < 1024) return input.slice();
  const size = 1024, hop = 256, half = size / 2;
  const output = new Float64Array(input.length + size);
  const weights = new Float64Array(output.length);
  const window = Float64Array.from({ length: size }, (_, index) => 0.5 - 0.5 * Math.cos(2 * Math.PI * index / (size - 1)));
  for (let start = 0; start < input.length; start += hop) {
    const real = new Float64Array(size), imaginary = new Float64Array(size);
    for (let index = 0; index < size; index++) real[index] = (input[start + index] || 0) * window[index];
    fft(real, imaginary);
    const envelope = new Float64Array(half + 1);
    for (let bin = 0; bin <= half; bin++) {
      let sum = 0, count = 0;
      for (let neighbor = Math.max(0, bin - 8); neighbor <= Math.min(half, bin + 8); neighbor++) {
        sum += Math.log(Math.max(1e-9, Math.hypot(real[neighbor], imaginary[neighbor]))); count++;
      }
      envelope[bin] = sum / count;
    }
    for (let bin = 0; bin <= half; bin++) {
      const shifted = interpolate(envelope, bin / bounded);
      // Large frame-to-frame envelope gains are a common source of zipper-like
      // ticks. This deliberately conservative range, plus the dry blend below,
      // preserves the audible direction of the control without allowing a
      // narrow spectral spike to create a clipped transient.
      const gain = Math.max(0.5, Math.min(2, Math.exp(shifted - envelope[bin])));
      real[bin] *= gain; imaginary[bin] *= gain;
      if (bin && bin < half) { real[size - bin] *= gain; imaginary[size - bin] *= gain; }
    }
    fft(real, imaginary, true);
    for (let index = 0; index < size && start + index < output.length; index++) {
      output[start + index] += real[index] * window[index];
      weights[start + index] += window[index] * window[index];
    }
  }
  const result = new Float32Array(input.length);
  const wet = Math.min(0.78, Math.abs(bounded - 1) / 0.15 * 0.78);
  for (let index = 0; index < result.length; index++) {
    const warped = output[index] / Math.max(1e-8, weights[index]);
    result[index] = Number.isFinite(warped) ? input[index] * (1 - wet) + warped * wet : input[index];
  }
  return result;
}
