#!/usr/bin/env tsx
/**
 * Playback is a stage too.
 *
 * The engine renders at 16 kHz and nearly every device runs at 44.1 or 48 kHz, so
 * something converts the rate before you hear it. When the browser did that, it was
 * linear interpolation, and linear interpolation folds images of the speech band
 * back into the audible top end. That is an effect on every single render, and no
 * switch in the app could turn it off, because it was not one of ours.
 *
 * These checks measure the conversion instead of asserting it is good.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resampleToRate } from '../src/utils/audioDspEngine';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const failures: string[] = [];
function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const tone = (frequency: number, rate: number, seconds: number): Float32Array => {
  const samples = new Float32Array(Math.round(rate * seconds));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = 0.5 * Math.sin((2 * Math.PI * frequency * index) / rate);
  }
  return samples;
};

const rms = (samples: Float32Array): number => {
  let total = 0;
  for (const value of samples) total += value * value;
  return Math.sqrt(total / Math.max(1, samples.length));
};

const dB = (ratio: number): string => (20 * Math.log10(Math.max(ratio, 1e-12))).toFixed(1);

console.log('\nrate conversion');

const source = tone(1000, 16000, 1);
const up = resampleToRate(source, 16000, 48000);
check('resampling 16 kHz to 48 kHz returns three times as many samples', up.length === source.length * 3, `${up.length} samples`);
check(
  'and keeps the amplitude',
  Math.abs(rms(up.slice(4800, up.length - 4800)) - rms(source.slice(1600, source.length - 1600))) < 0.005,
  `${rms(up.slice(4800, up.length - 4800)).toFixed(4)} vs ${rms(source).toFixed(4)}`,
);

// How far is the resampled tone from the ideal tone at the new rate?
const ideal = tone(1000, 48000, 1);
let error = 0;
let signal = 0;
for (let index = 4800; index < ideal.length - 4800; index += 1) {
  const difference = up[index] - ideal[index];
  error += difference * difference;
  signal += ideal[index] * ideal[index];
}
const errorDb = 20 * Math.log10(Math.sqrt(error / signal));
check('the reconstruction error is inaudible', errorDb < -60, `${errorDb.toFixed(1)} dB relative to the tone`);

const identity = resampleToRate(source, 16000, 16000);
check('a rate that already matches is left alone, value for value',
  identity.length === source.length && identity.every((value, index) => value === source[index]));
check('and it is still a copy', identity.buffer !== source.buffer);

console.log('\nanti-aliasing');

// 9 kHz content cannot survive a 16 kHz grid: it has to be filtered, not folded.
const high = tone(9000, 48000, 0.5);
const down = resampleToRate(high, 48000, 16000);
const low = resampleToRate(tone(1000, 48000, 0.5), 48000, 16000);
const interior = (samples: Float32Array) => samples.slice(1600, samples.length - 1600);
const rejection = rms(interior(down)) / Math.max(1e-9, rms(interior(low)));
check(
  'content above the new Nyquist is filtered out instead of folded back',
  rejection < 0.01,
  `${dB(rejection)} dB relative to a passing tone`,
);

console.log('\nand on a real recording, in the band where imaging shows');

const wavPath = join(ROOT, 'public', 'samples', 'cmu_slt_arctic_a0001.wav');
const wav = readFileSync(wavPath);
const wavRate = wav.readUInt32LE(24);
const dataAt = (() => {
  let offset = 12;
  while (offset < wav.length - 8) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === 'data') return offset + 8;
    offset += 8 + size + (size % 2);
  }
  return 44;
})();
const frames = (wav.length - dataAt) / 2;
const speech = new Float32Array(frames);
for (let index = 0; index < frames; index += 1) speech[index] = wav.readInt16LE(dataAt + index * 2) / 32768;
check('the reference recording loads', wavRate === 16000 && speech.length > 40000, `${frames} samples at ${wavRate} Hz`);

const linear = (samples: Float32Array, factor: number): Float32Array => {
  const out = new Float32Array(samples.length * factor);
  for (let index = 0; index < out.length; index += 1) {
    const position = index / factor;
    const base = Math.floor(position);
    const fraction = position - base;
    out[index] = (samples[base] ?? 0) * (1 - fraction) + (samples[base + 1] ?? 0) * fraction;
  }
  return out;
};

/** Total energy between two frequencies, by direct DFT over a few windowed frames. */
function bandEnergy(samples: Float32Array, rate: number, from: number, to: number): number {
  const size = 4096;
  let total = 0;
  let framesSeen = 0;
  const stride = Math.floor(samples.length / 9);
  for (let start = 0; start + size <= samples.length && framesSeen < 8; start += stride) {
    for (let bin = Math.floor((from * size) / rate); bin < Math.floor((to * size) / rate); bin += 3) {
      let re = 0;
      let im = 0;
      for (let n = 0; n < size; n += 1) {
        const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / size);
        const value = samples[start + n] * window;
        const angle = (2 * Math.PI * bin * n) / size;
        re += value * Math.cos(angle);
        im -= value * Math.sin(angle);
      }
      total += re * re + im * im;
    }
    framesSeen += 1;
  }
  return total / Math.max(1, framesSeen);
}

const linearImage = bandEnergy(linear(speech, 3), 48000, 8500, 15000);
const sincImage = bandEnergy(resampleToRate(speech, 16000, 48000), 48000, 8500, 15000);
const improvement = 10 * Math.log10(linearImage / Math.max(sincImage, 1e-30));
check(
  'above 8 kHz, the sinc conversion is far quieter than linear interpolation',
  improvement > 40,
  `${improvement.toFixed(0)} dB less imaging than linear (${(10 * Math.log10(linearImage / bandEnergy(speech, 16000, 300, 4000))).toFixed(0)} dB → ${(10 * Math.log10(sincImage / bandEnergy(speech, 16000, 300, 4000))).toFixed(0)} dB relative to speech)`,
);

console.log(`\n${passed}/${passed + failures.length} playback checks passed.`);
if (failures.length) {
  console.log('Failures:');
  for (const failure of failures) console.log(`  FAIL  ${failure}`);
  process.exitCode = 1;
}
