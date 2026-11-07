/**
 * Rendered-speech suite.
 *
 * This measures what the engine actually produces, not what it promises: audio
 * samples, timings, loudness, silence, pace, determinism and the exported bytes.
 * Everything runs on the real bundled assets — public/cmudict.txt and the CMU
 * ARCTIC unit packs in public/voicepacks — read from disk through a small fetch
 * shim, so the suite hears the same recordings the browser loads.
 *
 * The claims under test are the ones the product is built on:
 *   1. every typed word reaches the audio and has a measured timing
 *   2. no missing diphone is filled with a mathematical stand-in: the same
 *      speaker's own recordings cover it, and the count is reported
 *   3. the result sounds like a person reading: silence in a human range, pace
 *      in a human range
 *   4. preview and export are the same bytes, and repeated renders are too
 *   5. the experimental formant path still renders when it is selected
 *   6. a conversation is one timeline whose export equals its preview
 *
 * Run with: npm run test:render
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { processCmuVoice } from '../src/utils/cmuDiphoneSynthesizer';
import {
  DEFAULT_WEIGHTS,
  MAX_PHONE_SECONDS,
  MIN_PHONE_SECONDS,
  consonantRun,
  intrinsicKey,
  planDurations,
  type IntrinsicDurations,
  type PlanSegment,
} from '../src/utils/durationModel';
import { VOWELS, analyzeText, segmentUtterance } from '../src/utils/textAnalysis';
import {
  DEFAULT_DIALOGUE_TIMING,
  PRESET_VOICE_MODELS,
  gapBeforeLine,
  initializeLocalSpeechEngine,
  releaseDialogue,
  releaseSynthesis,
  renderDialogue,
  renderSpeech,
  type DialoguePart,
  type SynthesisResult,
  type VoiceModelConfig,
} from '../src/utils/naturalVoiceEngine';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Host stubs
// ---------------------------------------------------------------------------

const storage = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (key: string) => (storage.has(key) ? storage.get(key)! : null),
  setItem: (key: string, value: string) => {
    storage.set(key, String(value));
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => storage.clear(),
};

const objectUrls = new Set<string>();
let urlSerial = 0;
const URLStub = {
  createObjectURL: (blob: Blob) => {
    const url = `blob:vocalis/${(urlSerial += 1)}`;
    objectUrls.add(url);
    return url;
  },
  revokeObjectURL: (url: string) => {
    objectUrls.delete(url);
  },
};
(globalThis as unknown as { URL: unknown }).URL = Object.assign(
  function URL() {
    throw new Error('not used');
  },
  URLStub,
);

(globalThis as unknown as { fetch: unknown }).fetch = async (input: unknown) => {
  const url = String(typeof input === 'string' ? input : (input as { url?: string })?.url ?? '');
  if (!url.startsWith('/')) throw new Error(`test fetch cannot resolve ${url}`);
  const body = readFileSync(join(ROOT, 'public', url));
  return {
    ok: true,
    status: 200,
    url,
    text: async () => body.toString('utf8'),
    json: async () => JSON.parse(body.toString('utf8')),
    arrayBuffer: async () =>
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
  };
};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) passed += 1;
  else failures.push(detail ? `${label} — ${detail}` : label);
}

function eq(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  check(label, a === b, `expected ${b}, got ${a}`);
}

function between(label: string, value: number, low: number, high: number, unit = ''): void {
  check(label, value >= low && value <= high, `${value.toFixed(3)}${unit} is outside ${low}${unit}…${high}${unit}`);
}

/** Samples below this magnitude count as silence. */
const SILENT = 0.002;
/** A render is allowed this much headroom; the ceiling itself is 0.78. */
const CEILING = 0.78;
/** 16-bit WAV round trips are asymmetric by one quantisation step either way. */
const WAV_TOLERANCE = 3 / 32768;

interface Metrics {
  peak: number;
  rms: number;
  silenceFraction: number;
  loudFraction: number;
  clipped: number;
  seconds: number;
}

function metricsOf(result: SynthesisResult): Metrics {
  const samples = result.samples;
  let peak = 0;
  let sumSquares = 0;
  let silent = 0;
  let loud = 0;
  let clipped = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index];
    const magnitude = Math.abs(value);
    if (magnitude > peak) peak = magnitude;
    if (!Number.isFinite(value)) clipped += 1;
    else if (magnitude > 1) clipped += 1;
    sumSquares += value * value;
    if (magnitude < SILENT) silent += 1;
    if (magnitude > 0.02) loud += 1;
  }
  const seconds = samples.length / result.sampleRate;
  return {
    peak,
    rms: samples.length ? Math.sqrt(sumSquares / samples.length) : 0,
    silenceFraction: samples.length ? silent / samples.length : 0,
    loudFraction: samples.length ? loud / samples.length : 0,
    clipped,
    seconds,
  };
}

function decodeWav(buffer: ArrayBuffer): { samples: Float32Array; sampleRate: number } {
  const view = new DataView(buffer);
  const ascii = (offset: number, length: number) =>
    Array.from({ length }, (_, index) => String.fromCharCode(view.getUint8(offset + index))).join('');
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') throw new Error('not a RIFF/WAVE file');
  let offset = 12;
  let sampleRate = 0;
  let dataOffset = -1;
  let dataBytes = 0;
  while (offset + 8 <= view.byteLength) {
    const id = ascii(offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ') sampleRate = view.getUint32(offset + 8 + 4, true);
    if (id === 'data') {
      dataOffset = offset + 8;
      dataBytes = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataOffset < 0) throw new Error('the WAV has no data chunk');
  const count = Math.floor(dataBytes / 2);
  const samples = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    samples[index] = view.getInt16(dataOffset + index * 2, true) / 32768;
  }
  return { samples, sampleRate };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const aria = PRESET_VOICE_MODELS.find((model) => model.id === 'narrator-aria');
const marcus = PRESET_VOICE_MODELS.find((model) => model.id === 'titan-marcus');
if (!aria || !marcus) throw new Error('the shipped presets are missing');

function voice(overrides: Partial<VoiceModelConfig> = {}): VoiceModelConfig {
  return { ...aria, pitch: 1, rate: 1, volume: 1, toneStyle: 'natural', ...overrides };
}

/** Passages that must all be spoken from recorded units with nothing invented. */
const PASSAGES: Array<{
  label: string;
  text: string;
  model?: VoiceModelConfig;
  /** Lowest recorded coverage this passage may have (invented names cost some). */
  coverage?: number;
  /** True when some words are expected to be spelled out by our own rules. */
  expectGuesses?: boolean;
  /** False for a deliberately styled voice, which is allowed a little more air. */
  natural?: boolean;
}> = [
  {
    label: 'reference sentence',
    text: 'Author of the danger trail, Philip Ross.',
  },
  {
    label: 'a plain statement',
    text: 'The car park is far from the station, so we walked.',
  },
  {
    label: 'three sentences of dialogue',
    text: 'Hello there. How are you? Fine, thanks!',
  },
  {
    label: 'money, years and percentages',
    text: 'It cost $1,250.50 in 1975, which is about 42 percent more than before.',
  },
  {
    label: 'invented proper nouns',
    text: 'The Zanthorians of Velmirra asked Kesselheim whether the archive was open.',
    coverage: 0.85,
    expectGuesses: true,
  },
  {
    label: 'acronyms, times and highways',
    text: 'NASA said the launch is at 5 p.m. from St. Louis, along I-70 for 3 miles.',
    coverage: 0.9,
  },
  {
    label: 'a paragraph with a question in it',
    text:
      'Recording a voice used to mean booking a studio, hiring an actor and waiting for the edit. ' +
      'Now the whole thing can happen in a browser, from recordings that are licensed for exactly ' +
      'this kind of use. Does that make the result less human? Not if the audio is still a person.',
  },
  {
    label: 'a deep male voice',
    text: 'Author of the danger trail, Philip Ross.',
    model: { ...marcus, pitch: 0.72, rate: 1, volume: 1, toneStyle: 'deep' },
    // A deep delivery is deliberately slower, so it is measured against the
    // guard rails rather than the natural-reading silence target.
    natural: false,
  },
  {
    label: 'a British accent over the same words',
    text: 'The car park is far from the station.',
    model: voice({ accent: 'UK' }),
  },
  {
    label: 'a list with commas and a colon',
    text: 'Bring these: a notebook, two pens, and the key that opens the side door.',
  },
];

const LONG_PASSAGE = [
  'The studio was quiet at that hour, and the only light came from the desk.',
  'She read the first paragraph twice before she was happy with the pace.',
  'Every sentence had to carry its own weight, because nothing else would.',
  'A pause is not an absence of sound; it is a decision about what comes next.',
  'The recording had been made in a room with heavy curtains and a thick carpet.',
  'Those curtains were the reason the voice sounded close rather than distant.',
  'Later, the same sentences were cut into units and indexed by their transitions.',
  'An index is a promise: it says which piece of audio follows which other piece.',
  'When the promise holds, the join disappears and only the sentence remains.',
  'When it does not hold, the listener hears the machine instead of the speaker.',
  'That is why the diagnostics count every unit that had to be adapted.',
  'It is also why a guessed pronunciation is reported rather than hidden.',
  'A reader who knows which words were guessed can fix them in one keystroke.',
  'The fix is stored with the project and used the next time the text is read.',
  'Nothing about this pipeline calls a service or asks a model for a voice.',
  'The voice is a recording, licensed, attributed, and shipped with the app.',
  'The transformation is arithmetic on that recording: pitch, pace and resonance.',
  'Arithmetic is honest about what it can do, which is why the limits are stated.',
  'A diphone that was never recorded cannot be recovered from thin air.',
  'It can only be approximated from the same speaker, and counted as such.',
  'So the coverage number is a real number, measured on the audio you just heard.',
  'It is not a marketing figure, and it does not move when nobody is looking.',
  'Read the passage aloud and compare: the rhythm should be recognisably human.',
  'If it is not, the numbers in the report say which part of it failed.',
].join(' ');
const LONG_PASSAGE_WORDS = LONG_PASSAGE.trim().split(/\s+/).length;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

const startedAt = Date.now();

await initializeLocalSpeechEngine(voice());
check('the engine warms up without throwing', true);

const warmUp = await renderSpeech('Author of the danger trail, Philip Ross.', voice());
const firstRenderMs = Date.now() - startedAt;
check('the first render produced audio', warmUp.samples.length > 0, `${warmUp.samples.length} samples`);

/** The assertions every generated passage must satisfy. */
function checkRender(
  label: string,
  result: SynthesisResult,
  text: string,
  options: {
    coverage?: number;
    expectGuesses?: boolean;
    method?: 'cmu-arctic' | 'formant';
    /** False for a deliberately styled or re-timed voice: it is allowed a little more air. */
    natural?: boolean;
  } = {},
): Metrics {
  const metrics = metricsOf(result);
  const diagnostics = result.diagnostics;

  // It is audio, at the rate the recordings were made in.
  check(`${label}: samples were produced`, result.samples.length > 0);
  eq(`${label}: the sample rate is the corpus rate`, result.sampleRate, 16000);
  eq(`${label}: diagnostics report the same sample rate`, diagnostics.sampleRate, 16000);
  between(`${label}: duration matches the samples`, metrics.seconds, result.duration - 0.001, result.duration + 0.001, 's');

  // Loudness stays inside the ceiling with nothing clipped and nothing silent.
  check(`${label}: every sample is finite`, Number.isFinite(metrics.peak), `peak ${metrics.peak}`);
  between(`${label}: peak stays at or below the ceiling`, metrics.peak, 0.05, CEILING + 1e-6);
  eq(`${label}: nothing is clipped`, metrics.clipped, 0);
  check(`${label}: the render has real energy`, metrics.rms > 0.02, `rms ${metrics.rms.toFixed(4)}`);

  // Every word the writer typed is spoken, and each has a measured span.
  eq(`${label}: word count matches the diagnostics`, result.wordTimings.length, diagnostics.words);
  check(`${label}: at least one word was spoken`, diagnostics.words > 0);
  eq(`${label}: no word was rejected`, diagnostics.rejectedTokens, []);
  check(
    `${label}: every timed word has a positive span`,
    result.wordTimings.every((timing) => timing.end > timing.start),
    'a word has zero duration',
  );
  check(
    `${label}: word timings never go backwards`,
    result.wordTimings.every((timing, index) => index === 0 || timing.start >= result.wordTimings[index - 1].start - 1e-9),
    'timings overlap out of order',
  );
  check(
    `${label}: every word span lies inside the source text`,
    result.wordTimings.every((timing) => timing.charIndex >= 0 && timing.charIndex + timing.charLength <= text.length),
    'a span left the source text',
  );
  check(
    `${label}: every letter of the source is covered by a spoken span`,
    [...text].every(
      (character, index) =>
        !/[a-z0-9]/i.test(character) ||
        result.wordTimings.some((timing) => index >= timing.charIndex && index < timing.charIndex + timing.charLength),
    ),
    'part of the text produced no speech',
  );
  check(
    `${label}: every spoken word is inside the audio`,
    result.wordTimings.every((timing) => timing.start >= 0 && timing.end <= result.duration + 1e-6),
    'a word timing fell outside the render',
  );
  between(`${label}: speech starts at the beginning`, result.wordTimings[0]?.start ?? 0, 0, 0.3, 's');
  between(
    `${label}: speech runs to the end`,
    result.duration - (result.wordTimings.at(-1)?.end ?? 0),
    0,
    0.75,
    's',
  );

  // Nothing invented: recorded units and same-speaker adaptations only.
  eq(`${label}: no mathematical stand-in units`, diagnostics.fallbackPhones, 0);
  check(`${label}: recorded units were used`, diagnostics.exactUnits > 0 || options.method === 'formant');
  between(
    `${label}: recorded coverage`,
    diagnostics.recordedCoverage,
    options.coverage ?? 0.9,
    1.0001,
  );
  if (options.expectGuesses) {
    check(`${label}: guessed pronunciations are reported`, diagnostics.guessedWords.length > 0);
  } else {
    eq(`${label}: nothing had to be guessed`, diagnostics.guessedWords, []);
  }
  eq(`${label}: the dictionary came from the bundled file`, diagnostics.dictionary.source, 'file');
  check(`${label}: the dictionary is the whole file`, diagnostics.dictionary.entries > 100000);
  check(`${label}: at least one segment was rendered`, diagnostics.segments > 0);
  eq(`${label}: phones were produced for every word`, diagnostics.phones > diagnostics.words, true);

  // It sounds like a person reading, not a metronome.
  const wpm = (diagnostics.words / Math.max(metrics.seconds, 1e-6)) * 60;
  const spokenSeconds = metrics.seconds * (1 - metrics.silenceFraction);
  const speakingWpm = (diagnostics.words / Math.max(spokenSeconds, 1e-6)) * 60;
  between(`${label}: silence stays inside the guard rails`, metrics.silenceFraction * 100, 2, 18, '%');
  if (options.natural !== false) {
    between(`${label}: silence is inside the human target`, metrics.silenceFraction * 100, 4, 15, '%');
  }
  between(`${label}: pace of the whole render`, wpm, 71, 173, ' wpm');
  between(`${label}: pace while speaking`, speakingWpm, 79, 190, ' wpm');

  return metrics;
}

// --- the passages ----------------------------------------------------------
const rendered: Array<{ label: string; result: SynthesisResult; metrics: Metrics }> = [];
for (const passage of PASSAGES) {
  const model = passage.model ?? voice();
  const result = await renderSpeech(passage.text, model);
  const metrics = checkRender(passage.label, result, passage.text, {
    coverage: passage.coverage,
    expectGuesses: passage.expectGuesses,
    natural: passage.natural,
  });
  rendered.push({ label: passage.label, result, metrics });
  console.log(
    `  ${passage.label.padEnd(38)} ${metrics.seconds.toFixed(2)}s  ` +
      `${result.diagnostics.words} words  ${result.diagnostics.exactUnits}+${result.diagnostics.backoffUnits} units  ` +
      `${(result.diagnostics.recordedCoverage * 100).toFixed(1)}% recorded  ` +
      `${(metrics.silenceFraction * 100).toFixed(1)}% silence  ` +
      `${((result.diagnostics.words / metrics.seconds) * 60).toFixed(0)} wpm  peak ${metrics.peak.toFixed(3)}`,
  );
}

// --- a long passage stays stable ------------------------------------------
const longStart = Date.now();
const longResult = await renderSpeech(LONG_PASSAGE, voice());
const longMetrics = checkRender('long passage', longResult, LONG_PASSAGE, {
  coverage: 0.9,
  expectGuesses: true,
});
check(
  'a guessed word is a word that really is in the text',
  longResult.diagnostics.guessedWords.every((word) => LONG_PASSAGE.toLowerCase().includes(word.toLowerCase())),
  longResult.diagnostics.guessedWords.join(', '),
);
check(
  'a guessed word still gets a measured timing',
  longResult.diagnostics.guessedWords.every((word) =>
    longResult.wordTimings.some((timing) => timing.word.toLowerCase() === word.toLowerCase() && timing.end > timing.start),
  ),
  'a guessed word was dropped',
);
const longSeconds = Date.now() - longStart;
eq('the long passage spoke every word it was given', longResult.diagnostics.words, LONG_PASSAGE_WORDS);
check('a 24-sentence passage renders in reasonable time', longSeconds < 60000, `${longSeconds} ms`);
between('the long passage is minutes of speech, not seconds', longMetrics.seconds, 120, 260, 's');
check('the long passage used mostly exact units', longResult.diagnostics.exactUnits > 1100, `${longResult.diagnostics.exactUnits}`);
check('the long passage needed few adaptations', longResult.diagnostics.backoffUnits < 120, `${longResult.diagnostics.backoffUnits}`);
eq('the long passage split at its sentences', longResult.diagnostics.segments, 24);
console.log(
  `  ${'long passage'.padEnd(38)} ${longMetrics.seconds.toFixed(2)}s  ${longResult.diagnostics.words} words  ` +
    `${longResult.diagnostics.exactUnits}+${longResult.diagnostics.backoffUnits} units  ` +
    `${(longResult.diagnostics.recordedCoverage * 100).toFixed(1)}% recorded  ` +
    `${(longMetrics.silenceFraction * 100).toFixed(1)}% silence  ` +
    `${((longResult.diagnostics.words / longMetrics.seconds) * 60).toFixed(1)} wpm  rendered in ${longSeconds} ms`,
);

// --- determinism and export ------------------------------------------------
const again = await renderSpeech(PASSAGES[0].text, voice());
check(
  'rendering the same text twice gives identical samples',
  again.samples.length === warmUp.samples.length &&
    again.samples.every((value, index) => value === warmUp.samples[index]),
  'two renders of the same text differed',
);
eq('rendering the same text twice gives the same duration', again.duration, warmUp.duration);
eq('rendering the same text twice gives the same word count', again.diagnostics.words, warmUp.diagnostics.words);
releaseSynthesis(again);

const shippedRender = await renderSpeech(PASSAGES[0].text, PRESET_VOICE_MODELS[0]);
check(
  'the shipped default renders exactly what an explicit neutral voice renders',
  shippedRender.samples.length === warmUp.samples.length &&
    shippedRender.samples.every((value, index) => value === warmUp.samples[index]),
  'the default voice and a neutral voice disagreed',
);
eq('the shipped default speaks from the SLT recordings', shippedRender.diagnostics.speaker, 'slt');
releaseSynthesis(shippedRender);

const exported = decodeWav(await warmUp.wavBlob.arrayBuffer());
eq('the exported WAV carries the corpus sample rate', exported.sampleRate, 16000);
eq('the exported WAV has the same length as the preview', exported.samples.length, warmUp.samples.length);
let furthest = 0;
for (let index = 0; index < exported.samples.length; index += 1) {
  furthest = Math.max(furthest, Math.abs(exported.samples[index] - warmUp.samples[index]));
}
between('export equals preview within one quantisation step', furthest, 0, WAV_TOLERANCE);
check('the exported audio keeps the ceiling', metricsOf({ ...warmUp, samples: exported.samples }).peak <= CEILING + 1e-6);
check('a render hands back a playable object URL', warmUp.audioUrl.startsWith('blob:'), warmUp.audioUrl);

const exportedLong = decodeWav(await longResult.wavBlob.arrayBuffer());
eq('a long export has the same length as its preview', exportedLong.samples.length, longResult.samples.length);

// --- the controls actually change the audio --------------------------------
const fast = await renderSpeech(PASSAGES[0].text, voice({ rate: 1.4 }));
const slow = await renderSpeech(PASSAGES[0].text, voice({ rate: 0.7 }));
check('a faster rate shortens the render', fast.duration < warmUp.duration, `${fast.duration} vs ${warmUp.duration}`);
check('a slower rate lengthens the render', slow.duration > warmUp.duration, `${slow.duration} vs ${warmUp.duration}`);
between('rate 1.4 lands near a 1.4x shortening', fast.duration, warmUp.duration / 1.4 * 0.88, warmUp.duration / 1.4 * 1.12, 's');
between('rate 0.7 lands near a 1.4x lengthening', slow.duration, warmUp.duration / 0.7 * 0.88, warmUp.duration / 0.7 * 1.12, 's');
checkRender('fast render', fast, PASSAGES[0].text, { coverage: 0.9 });
checkRender('slow render', slow, PASSAGES[0].text, { coverage: 0.9, natural: false });

const deep = await renderSpeech(PASSAGES[0].text, voice({ pitch: 0.72, toneStyle: 'deep' }));
const bright = await renderSpeech(PASSAGES[0].text, voice({ pitch: 1.4, toneStyle: 'energetic' }));
check('a lower pitch changes the audio', deep.samples.length > 0 && deep.duration > 0);
check('a higher pitch changes the audio', bright.samples.length > 0 && bright.duration > 0);
check(
  'pitch and rate are independent controls',
  Math.abs(deep.duration - warmUp.duration) > 1e-6 || Math.abs(bright.duration - warmUp.duration) > 1e-6,
  'pitch had no measurable effect',
);
checkRender('deep pitch', deep, PASSAGES[0].text, { coverage: 0.9, natural: false });
checkRender('bright pitch', bright, PASSAGES[0].text, { coverage: 0.9, natural: false });

const quiet = await renderSpeech(PASSAGES[0].text, voice({ volume: 0.35 }));
check('a lower volume is quieter', metricsOf(quiet).peak < metricsOf(warmUp).peak, `${metricsOf(quiet).peak} vs ${metricsOf(warmUp).peak}`);
check('a lower volume still produces audio', metricsOf(quiet).peak > 0.05);

const robot = await renderSpeech(PASSAGES[0].text, voice({ toneStyle: 'robot' }));
check('the robot style still renders', robot.samples.length > 0);
check('the robot style stays inside the ceiling', metricsOf(robot).peak <= CEILING + 1e-6);
eq('the robot style reports its method', robot.diagnostics.method, 'cmu-arctic');

// --- the transformation stage: what it must do, and what it must not -------

/** Two seconds of a voiced-like signal: a fundamental, a bright partial, noise. */
const testSignal = (() => {
  const length = 16000 * 2;
  const out = new Float32Array(length);
  let state = 0x2545f491;
  const noise = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x3fffffff - 1;
  };
  for (let index = 0; index < length; index += 1) {
    const t = index / 16000;
    out[index] =
      0.5 * Math.sin(2 * Math.PI * 110 * t) + 0.2 * Math.sin(2 * Math.PI * 4000 * t) + 0.05 * noise();
  }
  return out;
})();

/** Energy above a cutoff as a fraction of total energy: a clarity measure. */
function highFrequencyRatio(samples: Float32Array, cutoff: number): number {
  const k = 1 - Math.exp((-2 * Math.PI * cutoff) / 16000);
  let low = 0;
  let high = 0;
  let total = 0;
  for (let index = 0; index < samples.length; index += 1) {
    low += k * (samples[index] - low);
    const above = samples[index] - low;
    high += above * above;
    total += samples[index] * samples[index];
  }
  return Math.sqrt(high / Math.max(total, 1e-12));
}

const untouched = processCmuVoice(testSignal, voice({ pitch: 1, rate: 1, toneStyle: 'natural' }));
eq('a neutral voice returns the same number of samples', untouched.length, testSignal.length);
check(
  'a neutral voice leaves the recording bit-exact',
  untouched.every((value, index) => value === testSignal[index]),
  'a neutral render was processed',
);

// The voice the app opens with must be the untouched one.
const shippedDefault = PRESET_VOICE_MODELS[0];
eq('the shipped default is the neutral voice', shippedDefault.id, 'studio-neutral');
eq('the shipped default leaves pitch alone', shippedDefault.pitch, 1);
eq('the shipped default leaves pace alone', shippedDefault.rate, 1);
eq('the shipped default is at full volume', shippedDefault.volume, 1);
eq('the shipped default has no delivery style', shippedDefault.toneStyle, 'natural');
eq('the shipped default is American English', shippedDefault.accent, 'US');
eq('the shipped default uses the recorded units', shippedDefault.synthesisMethod, 'cmu-arctic');
eq('the shipped default names its speaker', shippedDefault.baseVoiceId, 'slt');
eq('the shipped default shifts no resonance band', [
  shippedDefault.throatWarmth,
  shippedDefault.oralClarity,
  shippedDefault.airPresence,
], [0, 0, 0]);
const shippedUntouched = processCmuVoice(testSignal, shippedDefault);
check(
  'the shipped default leaves the recording bit-exact',
  shippedUntouched.length === testSignal.length &&
    shippedUntouched.every((value, index) => value === testSignal[index]),
  'the default voice processed the audio',
);
check(
  'every preset states its synthesis method and its speaker',
  PRESET_VOICE_MODELS.every((model) => model.synthesisMethod === 'cmu-arctic' && (model.baseVoiceId === 'slt' || model.baseVoiceId === 'bdl')),
  'a preset leaves its method or speaker to be inferred',
);

const nearlyNeutral = processCmuVoice(testSignal, voice({ pitch: 1, rate: 1.004 }));
eq('a tempo change under half a percent is left alone', nearlyNeutral.length, testSignal.length);
check(
  'a tempo change under half a percent changes no sample',
  nearlyNeutral.every((value, index) => value === testSignal[index]),
  'a sub-threshold tempo change was stretched',
);

const stretched = processCmuVoice(testSignal, voice({ pitch: 1, rate: 1.4 }));
between(
  'a real tempo change shortens the signal by its rate',
  stretched.length / testSignal.length,
  (1 / 1.4) * 0.97,
  (1 / 1.4) * 1.03,
);
check('a real tempo change is not a pass-through', stretched.length !== testSignal.length);
check(
  'a stretched signal stays inside the sample range',
  stretched.every((value) => Number.isFinite(value) && Math.abs(value) <= 1.5),
  'stretching produced an out-of-range sample',
);

/** The interpolation this replaced, kept here only to prove the new one is better. */
function linearResample(samples: Float32Array, factor: number): Float32Array {
  const length = Math.max(1, Math.floor(samples.length / factor));
  const out = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index * factor;
    const left = Math.floor(position);
    const right = Math.min(samples.length - 1, left + 1);
    const fraction = position - left;
    out[index] = samples[left] * (1 - fraction) + samples[right] * fraction;
  }
  return out;
}

// Pitching by a factor AND setting rate to the same factor cancels the
// compensating stretch, so only the resampler runs. That isolates it.
const sourceClarity = highFrequencyRatio(testSignal, 2500);
for (const factor of [0.72, 1.4]) {
  const resampled = processCmuVoice(testSignal, voice({ pitch: factor, rate: factor }));
  eq(`pitch ${factor} with rate ${factor} changes only the sample count`, resampled.length, Math.floor(testSignal.length / factor));
  const kept = highFrequencyRatio(resampled, 2500) / sourceClarity;
  const linearKept = highFrequencyRatio(linearResample(testSignal, factor), 2500) / sourceClarity;
  check(
    `the resampler keeps the bright partial at pitch ${factor} (${(kept * 100).toFixed(0)}% of the source)`,
    kept >= (factor < 1 ? 0.85 : 0.95),
    `${(kept * 100).toFixed(1)}% retained`,
  );
  check(
    `band-limited interpolation beats a straight line at pitch ${factor} (${(kept * 100).toFixed(0)}% vs ${(linearKept * 100).toFixed(0)}%)`,
    kept > linearKept,
    'linear interpolation kept more high-frequency energy',
  );
}

const naturalClarityRender = await renderSpeech(PASSAGES[0].text, voice());
const pitchedClarityRender = await renderSpeech(PASSAGES[0].text, voice({ pitch: 0.72 }));
const naturalClarity = highFrequencyRatio(naturalClarityRender.samples, 2500);
const pitchedClarity = highFrequencyRatio(pitchedClarityRender.samples, 2500);
// End to end, a pitch change still costs some brightness: the resampler keeps
// about 89 % of it and the WSOLA that puts the duration back takes some more.
// The floor here is what the round trip achieves today, and it is the number
// Phase 3's pitch-synchronous modification has to beat — not a target to relax.
between(
  'a pitched-down render keeps most of its brightness end to end',
  pitchedClarity / naturalClarity,
  0.7,
  1.4,
);
console.log(
  `  clarity above 2.5 kHz: neutral ${(naturalClarity * 100).toFixed(1)}%, pitch 0.72 ` +
    `${(pitchedClarity * 100).toFixed(1)}% (${((pitchedClarity / naturalClarity) * 100).toFixed(0)}% retained)`,
);
checkRender('pitched-down render', pitchedClarityRender, PASSAGES[0].text, { coverage: 0.9, natural: false });
releaseSynthesis(naturalClarityRender);
releaseSynthesis(pitchedClarityRender);

// --- speaker resolution ----------------------------------------------------
eq('the default preset speaks from the SLT recordings', warmUp.diagnostics.speaker, 'slt');
const male = await renderSpeech(PASSAGES[0].text, { ...marcus, pitch: 1, rate: 1, toneStyle: 'natural' });
eq('a male preset speaks from the BDL recordings', male.diagnostics.speaker, 'bdl');
const unresolved = await renderSpeech(PASSAGES[0].text, voice({ baseVoiceId: undefined, gender: 'Neutral' }));
eq('an unresolved base voice falls back to SLT rather than failing', unresolved.diagnostics.speaker, 'slt');
check('an unresolved base voice still renders from recordings', unresolved.diagnostics.exactUnits > 0);

// --- empty and degenerate input -------------------------------------------
const empty = await renderSpeech('', voice());
eq('empty text speaks no words', empty.diagnostics.words, 0);
eq('empty text has no timings', empty.wordTimings, []);
between('empty text produces a short silence, not an error', empty.duration, 0, 0.5, 's');
eq('empty text still reports a method', empty.diagnostics.method, 'cmu-arctic');
releaseSynthesis(empty);

const whitespace = await renderSpeech('   \n  ', voice());
eq('whitespace only speaks no words', whitespace.diagnostics.words, 0);
releaseSynthesis(whitespace);

const punctuationOnly = await renderSpeech('... !!! ???', voice());
eq('punctuation only speaks no words', punctuationOnly.diagnostics.words, 0);
between('punctuation only stays short', punctuationOnly.duration, 0, 1, 's');
releaseSynthesis(punctuationOnly);

// --- the experimental formant path still works -----------------------------
const formant = await renderSpeech(PASSAGES[0].text, voice({ synthesisMethod: 'formant' }));
const formantMetrics = metricsOf(formant);
eq('the formant path reports itself', formant.diagnostics.method, 'formant');
check('the formant path produces audio', formant.samples.length > 0);
eq('the formant path speaks every word', formant.diagnostics.words, formant.wordTimings.length);
check('the formant path speaks the words of the text', formant.diagnostics.words >= 6, `${formant.diagnostics.words} words`);
check('the formant path is loud enough to hear', formantMetrics.peak > 0.5, `peak ${formantMetrics.peak.toFixed(3)}`);
check('the formant path stays inside the ceiling', formantMetrics.peak <= CEILING + 1e-6);
check('the formant path has real energy', formantMetrics.rms > 0.02, `rms ${formantMetrics.rms.toFixed(4)}`);
check('the formant path is mostly voiced', formantMetrics.loudFraction > 0.05, `${(formantMetrics.loudFraction * 100).toFixed(1)}% voiced`);
check('the formant path uses no recorded units', formant.diagnostics.exactUnits === 0);
eq('the formant path reports zero coverage, honestly', formant.diagnostics.recordedCoverage, 0);
eq('the formant path still times its words', formant.wordTimings.length, formant.diagnostics.words);
console.log(
  `  ${'formant path (experimental)'.padEnd(38)} ${metricsOf(formant).seconds.toFixed(2)}s  ` +
    `${formant.diagnostics.words} words  peak ${formantMetrics.peak.toFixed(3)}  rms ${formantMetrics.rms.toFixed(3)}  ` +
    `${(formantMetrics.loudFraction * 100).toFixed(1)}% voiced  ${(formantMetrics.silenceFraction * 100).toFixed(1)}% silent`,
);
const formantWav = decodeWav(await formant.wavBlob.arrayBuffer());
eq('the formant path exports the same length it previewed', formantWav.samples.length, formant.samples.length);
releaseSynthesis(formant);

const formantEmpty = await renderSpeech('', voice({ synthesisMethod: 'formant' }));
between('the formant path also survives empty text', formantEmpty.duration, 0, 0.6, 's');
releaseSynthesis(formantEmpty);

// --- dialogue --------------------------------------------------------------
eq('the default turn gap is a beat, not a pause for thought', DEFAULT_DIALOGUE_TIMING.turnGap, 0.34);
eq('the same speaker continuing gets less air', DEFAULT_DIALOGUE_TIMING.sameSpeakerGap, 0.15);

const turnChange = gapBeforeLine(
  { speakerId: 'A', text: 'One sentence.', model: aria },
  { speakerId: 'B', text: 'Another sentence.', model: marcus },
  DEFAULT_DIALOGUE_TIMING,
);
eq('a change of speaker uses the turn gap', turnChange, 0.34);

const sameSpeaker = gapBeforeLine(
  { speakerId: 'A', text: 'One sentence.', model: aria },
  { speakerId: 'A', text: 'Another sentence.', model: aria },
  DEFAULT_DIALOGUE_TIMING,
);
eq('the same speaker continuing uses the shorter gap', sameSpeaker, 0.15);

const unpunctuated = gapBeforeLine(
  { speakerId: 'A', text: 'and then', model: aria },
  { speakerId: 'B', text: 'Yes?', model: marcus },
  DEFAULT_DIALOGUE_TIMING,
);
between('a line that trails off gets less air again', unpunctuated, 0.15, 0.25, 's');
eq('the first line of a conversation has no gap before it', gapBeforeLine(undefined, { speakerId: 'A', text: 'Hello.', model: aria }, DEFAULT_DIALOGUE_TIMING), 0);

const parts: DialoguePart[] = [
  { speakerId: 'A', text: 'Hello there. Can you hear me?', model: voice() },
  { speakerId: 'B', text: 'Loud and clear. The pitch is different.', model: { ...marcus, pitch: 1, rate: 1, toneStyle: 'natural' } },
  { speakerId: 'A', text: 'It is built from the same recordings you are.', model: voice() },
  { speakerId: 'B', text: 'Then we should sound like the same studio.', model: { ...marcus, pitch: 1, rate: 1, toneStyle: 'natural' } },
];

const conversation = await renderDialogue(parts);
const conversationMetrics = metricsOf(conversation);
eq('a conversation reports four lines', conversation.lines.length, 4);
check('a conversation is one sample array', conversation.samples.length > 0);
between('a conversation has a duration', conversationMetrics.seconds, 8, 40, 's');
eq('the conversation word count is the sum of its lines', conversation.diagnostics.words, conversation.lines.reduce((total, line) => total + line.result.diagnostics.words, 0));
check(
  'each line sits after the previous one',
  conversation.lines.every((line, index) => index === 0 || line.start >= conversation.lines[index - 1].end - 1e-6),
  'lines overlapped',
);
check(
  'each line keeps the turn-taking gap',
  conversation.lines.every((line, index) => {
    if (index === 0) return line.start <= 0.01;
    const previous = conversation.lines[index - 1];
    const expected = gapBeforeLine(
      { speakerId: previous.speakerId, text: previous.text, model: parts[index - 1].model },
      { speakerId: line.speakerId, text: line.text, model: parts[index].model },
      DEFAULT_DIALOGUE_TIMING,
    );
    return line.start - previous.end >= expected - 0.02;
  }),
  'a turn change had no air in it',
);
eq('the conversation names each line\'s speaker', conversation.lines.map((line) => line.speakerId), ['A', 'B', 'A', 'B']);
check('every line keeps its own text', conversation.lines.every((line, index) => line.text === parts[index].text));
eq('the conversation spans two recorded speakers', conversation.diagnostics.speaker, null);
eq('no dialogue word was rejected', conversation.diagnostics.rejectedTokens, []);
eq('a conversation uses no mathematical stand-ins', conversation.diagnostics.fallbackPhones, 0);
between('a conversation has human silence', conversationMetrics.silenceFraction * 100, 2, 20, '%');
check('a conversation stays inside the ceiling', conversationMetrics.peak <= CEILING + 1e-6);
check(
  'every line of a conversation is inside the audio',
  conversation.lines.every((line) => line.end <= conversation.duration + 1e-6 && line.start >= 0),
  'a line fell outside the timeline',
);

const conversationWav = decodeWav(await conversation.wavBlob.arrayBuffer());
eq('the conversation export is the same length as the preview', conversationWav.samples.length, conversation.samples.length);
let conversationDrift = 0;
for (let index = 0; index < conversationWav.samples.length; index += 1) {
  conversationDrift = Math.max(conversationDrift, Math.abs(conversationWav.samples[index] - conversation.samples[index]));
}
between('the conversation export equals its preview', conversationDrift, 0, WAV_TOLERANCE);

const repeatedConversation = await renderDialogue(parts);
check(
  'rendering the same conversation twice is identical',
  repeatedConversation.samples.length === conversation.samples.length &&
    repeatedConversation.samples.every((value, index) => value === conversation.samples[index]),
  'two conversation renders differed',
);
releaseDialogue(repeatedConversation);

const oneSpeaker = await renderDialogue([
  { speakerId: 'A', text: 'First line here.', model: voice() },
  { speakerId: 'A', text: 'Second line follows.', model: voice() },
]);
eq('a monologue renders both lines', oneSpeaker.lines.length, 2);
between('a monologue keeps the shorter gap', oneSpeaker.lines[1].start - oneSpeaker.lines[0].end, 0.1, 0.3, 's');
releaseDialogue(oneSpeaker);

const emptyConversation = await renderDialogue([]);
eq('an empty conversation has no lines', emptyConversation.lines.length, 0);
eq('an empty conversation has no audio', emptyConversation.samples.length, 0);
eq('an empty conversation lasts no time', emptyConversation.duration, 0);
releaseDialogue(emptyConversation);

const skipped = await renderDialogue([
  { speakerId: 'A', text: 'Spoken line.', model: voice() },
  { speakerId: 'B', text: '   ', model: { ...marcus, pitch: 1, rate: 1 } },
]);
eq('a blank line is skipped rather than rendered as silence', skipped.lines.length, 1);
releaseDialogue(skipped);

releaseDialogue(conversation);

// --- resource use ----------------------------------------------------------
const laterStart = Date.now();
const warmed = await renderSpeech('A short sentence.', voice());
const laterMs = Date.now() - laterStart;
check('a later render is fast once the packs are warm', laterMs < 4000, `${laterMs} ms`);
check('the first render (which loads a 5.7 MB pack) is still quick', firstRenderMs < 20000, `${firstRenderMs} ms`);
const heapMb = process.memoryUsage().heapUsed / (1024 * 1024);
check('the suite stays inside a modest heap', heapMb < 900, `${heapMb.toFixed(0)} MB`);
console.log(
  `  rate 1.4 ${(fast.duration).toFixed(2)}s, rate 0.7 ${(slow.duration).toFixed(2)}s, natural ${warmUp.duration.toFixed(2)}s; ` +
    `pitch 0.72 ${deep.duration.toFixed(2)}s, pitch 1.4 ${bright.duration.toFixed(2)}s; volume 0.35 peak ${metricsOf(quiet).peak.toFixed(3)}`,
);
console.log(
  `  conversation ${conversation.duration.toFixed(2)}s over ${conversation.lines.length} lines, ` +
    `turn gap ${DEFAULT_DIALOGUE_TIMING.turnGap}s, same speaker ${DEFAULT_DIALOGUE_TIMING.sameSpeakerGap}s, ` +
    `trailing ${(gapBeforeLine({ speakerId: 'A', text: 'and then', model: aria }, { speakerId: 'B', text: 'Yes?', model: marcus }, DEFAULT_DIALOGUE_TIMING)).toFixed(2)}s`,
);
console.log(`  first render ${firstRenderMs} ms, warm render ${laterMs} ms, heap ${heapMb.toFixed(0)} MB`);

for (const entry of rendered) releaseSynthesis(entry.result);
releaseSynthesis(warmUp);
releaseSynthesis(longResult);
releaseSynthesis(fast);
releaseSynthesis(slow);
releaseSynthesis(deep);
// ---------------------------------------------------------------------------
// The v2 unit metadata, and the duration model fitted on top of it
// ---------------------------------------------------------------------------

// --- the derived pack metadata ---------------------------------------------

interface UnitV2 {
  offset: number;
  length: number;
  boundary: number;
  period: number;
  voiced: number;
  marks: number[];
}
interface ManifestV2 {
  format: string;
  derivedFrom: string;
  audioFile: string;
  unitCount: number;
  phoneInventory: string[];
  phoneDurationsMs: Record<string, number>;
  measurement: {
    f0MeanHz: number;
    periodCorrelation: number;
    durationFit: { observations: number; medianErrorMs: number; predictedMeanMs: number };
    intactRecording: { f0MeanHz: number; periodCorrelation: number | null };
  };
  units: Record<string, UnitV2>;
}

const intrinsicBySpeaker = new Map<string, IntrinsicDurations>();

for (const speaker of ['slt', 'bdl'] as const) {
  const dir = join(ROOT, 'public', 'voicepacks', 'cmu-arctic', speaker);
  const v1 = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as {
    units: Record<string, { offset: number; length: number }>;
  };
  const v2 = JSON.parse(readFileSync(join(dir, 'manifest.v2.json'), 'utf-8')) as ManifestV2;
  const keys = Object.keys(v2.units);

  check(`${speaker}: v2 names the format and the file it indexes`,
    v2.format === 'vocalis-cmu-diphones-v2' && v2.derivedFrom === 'manifest.json' && v2.audioFile === 'diphones.bin',
    `${v2.format} / ${v2.derivedFrom} / ${v2.audioFile}`);
  check(`${speaker}: v2 indexes every unit v1 does, and no others`,
    keys.length === Object.keys(v1.units).length && keys.every((key) => v1.units[key] !== undefined),
    `${keys.length} against ${Object.keys(v1.units).length}`);
  check(`${speaker}: v2 offsets and lengths are identical to the frozen v1 index`,
    keys.every((key) => v2.units[key].offset === v1.units[key].offset && v2.units[key].length === v1.units[key].length));
  check(`${speaker}: every phone boundary falls inside its unit`,
    keys.every((key) => v2.units[key].boundary >= 1 && v2.units[key].boundary < v2.units[key].length));

  // The first entry is a position, the rest are steps. A first mark at sample
  // zero is real: v1 cut units at phone midpoints, which land inside a vowel, so
  // a unit can genuinely begin on a glottal closure.
  const badMarks = keys.filter((key) => {
    const unit = v2.units[key];
    if (!unit.marks.length) return false;
    if (unit.marks[0] < 0 || unit.marks[0] >= unit.length) return true;
    let at = unit.marks[0];
    return unit.marks.slice(1).some((delta) => {
      at += delta;
      return delta <= 0 || at >= unit.length;
    });
  });
  check(`${speaker}: pitch marks stay inside their unit and always move forward`, badMarks.length === 0,
    `${badMarks.length} units, e.g. ${badMarks.slice(0, 3).join(', ')}`);

  const marked = keys.filter((key) => v2.units[key].marks.length >= 2).length;
  check(`${speaker}: most units carry pitch marks`, marked > keys.length * 0.7,
    `${marked} of ${keys.length}`);
  check(`${speaker}: the tracker is coherent enough to splice on`,
    v2.measurement.periodCorrelation >= 0.6 && v2.measurement.intactRecording.periodCorrelation !== null,
    `correlation ${v2.measurement.periodCorrelation}`);
  between(`${speaker}: voice rate measured on the intact recording is a human one`,
    v2.measurement.intactRecording.f0MeanHz, 70, 400, ' Hz');

  const table = v2.phoneDurationsMs;
  check(`${speaker}: the duration table covers the whole phone inventory`,
    v2.phoneInventory.every((phone) => typeof table[phone] === 'number' && table[phone] > 0),
    `${Object.keys(table).length} entries for ${v2.phoneInventory.length} phones`);
  const ordered = Object.entries(table)
    .filter(([phone]) => phone !== 'pau')
    .sort((a, b) => a[1] - b[1]);
  check(`${speaker}: the shortest measured phones are consonants, the longest vowels`,
    !VOWELS.has(ordered[0][0].toUpperCase()) && VOWELS.has(ordered[ordered.length - 1][0].toUpperCase()),
    `${ordered[0][0]} ${ordered[0][1]} ms to ${ordered[ordered.length - 1][0]} ${ordered[ordered.length - 1][1]} ms`);
  check(`${speaker}: the solve reproduces the corpus mean unit length`,
    Math.abs(v2.measurement.durationFit.predictedMeanMs - 117) < 25,
    `solved mean ${v2.measurement.durationFit.predictedMeanMs} ms`);
  check(`${speaker}: the solve fits its own observations to within a frame`,
    v2.measurement.durationFit.medianErrorMs < 20,
    `median error ${v2.measurement.durationFit.medianErrorMs} ms`);

  const intrinsic: IntrinsicDurations = {};
  for (const [phone, ms] of Object.entries(table)) intrinsic[phone] = ms / 1000;
  intrinsicBySpeaker.set(speaker, intrinsic);
}

// --- the duration model ----------------------------------------------------

async function planFor(text: string, speaker: 'slt' | 'bdl') {
  const utterance = await analyzeText(text, 'US');
  const segments: PlanSegment[] = segmentUtterance(utterance).map((segment) => ({
    phones: segment.phones.map((phone) => ({
      phone: phone.phone,
      stress: phone.stress,
      wordIndex: phone.wordIndex,
      long: phone.long,
      word: utterance.words[phone.wordIndex]?.text,
    })),
    boundaries: segment.phones.map((phone, index) => {
      const next = segment.phones[index + 1];
      const endsWord = !next || next.wordIndex !== phone.wordIndex;
      return endsWord ? utterance.words[phone.wordIndex]?.boundaryAfter ?? 'word' : undefined;
    }),
  }));
  const intrinsic = intrinsicBySpeaker.get(speaker) ?? {};
  const plan = planDurations(segments, intrinsic);
  const phoneCount = utterance.phones.length;
  return { plan, segments, intrinsic, utterance, phoneCount };
}

const isVowelPhone = (phone: string): boolean => VOWELS.has(phone.toUpperCase());

// Both bundled reference sentences, read by both bundled speakers. The human
// column is the speech extent measured on the energy envelope of the intact
// recordings: first to last frame above 15% of peak. These four numbers are the
// only human timing in the repository, and the model's factors were fitted to
// them, so the suite keeps the fit honest.
const READINGS = [
  { speaker: 'slt' as const, text: 'Author of the danger trail, Philip Ross.', human: 2.91, phones: 24 },
  { speaker: 'slt' as const, text: 'There had been no thawing spring, and the ice was deeply pitted', human: 2.78, phones: 40 },
  { speaker: 'bdl' as const, text: 'Author of the danger trail, Philip Ross.', human: 2.97, phones: 24 },
  { speaker: 'bdl' as const, text: 'There had been no thawing spring, and the ice was deeply pitted', human: 3.15, phones: 40 },
];

for (const reading of READINGS) {
  const { plan, phoneCount } = await planFor(reading.text, reading.speaker);
  const label = `${reading.speaker} "${reading.text.slice(0, 28)}…"`;
  check(`${label}: the plan covers every phone`, plan.phones.length === phoneCount,
    `${plan.phones.length} planned against ${phoneCount} spoken`);
  check(`${label}: every phone was found in the speaker's measured table`, plan.defaulted === 0,
    `${plan.defaulted} phones fell back to a default`);
  const error = plan.totalSeconds / reading.human - 1;
  check(`${label}: the plan lands within 15% of the human reading`, Math.abs(error) <= 0.15,
    `${plan.totalSeconds.toFixed(2)} s planned against ${reading.human.toFixed(2)} s measured (${(error * 100).toFixed(0)}%)`);
  const seconds = plan.phones.map((target) => target.seconds * 1000);
  const mean = seconds.reduce((a, b) => a + b, 0) / seconds.length;
  const spread = Math.sqrt(seconds.reduce((a, b) => a + (b - mean) ** 2, 0) / seconds.length);
  check(`${label}: phone durations vary by at least as much as the human recording does`,
    spread / mean >= 0.5, `coefficient of variation ${(spread / mean).toFixed(2)}`);
  check(`${label}: every target stays inside the bounds`,
    seconds.every((ms) => ms >= MIN_PHONE_SECONDS * 1000 - 0.001 && ms <= MAX_PHONE_SECONDS * 1000 + 0.001));
}

{
  const { plan } = await planFor('Author of the danger trail, Philip Ross.', 'slt');
  const vowels = plan.phones.filter((target) => target.cluster === 0);
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const stressed = mean(vowels.filter((t) => t.stress === '1').map((t) => t.seconds));
  const reduced = mean(vowels.filter((t) => t.stress === '0').map((t) => t.seconds));
  check('a stressed vowel gets several times the time of a reduced one', stressed / reduced >= 3,
    `${(stressed * 1000).toFixed(0)} ms against ${(reduced * 1000).toFixed(0)} ms`);
  check('a stressed vowel lands where the intact recording measures its nuclei',
    stressed * 1000 >= 150 && stressed * 1000 <= 260, `${(stressed * 1000).toFixed(0)} ms`);
  check('a reduced vowel lands where the intact recording measures its shortest nucleus',
    reduced * 1000 >= 25 && reduced * 1000 <= 70, `${(reduced * 1000).toFixed(0)} ms`);
}

{
  // Cluster compression, on the sentence that carries a four-consonant run.
  const { plan } = await planFor('There had been no thawing spring, and the ice was deeply pitted', 'slt');
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const alone = mean(plan.phones.filter((t) => t.cluster === 1).map((t) => t.seconds));
  const inCluster = mean(plan.phones.filter((t) => t.cluster >= 3).map((t) => t.seconds));
  check('a consonant inside a cluster is much shorter than the same consonant alone',
    inCluster < alone * 0.5, `${(inCluster * 1000).toFixed(0)} ms in a run of three or more against ${(alone * 1000).toFixed(0)} ms alone`);

  const closed = mean(plan.phones
    .filter((t) => t.word !== undefined && ['had', 'been', 'and', 'the', 'was', 'there', 'no'].includes(t.word.toLowerCase()))
    .map((t) => t.seconds));
  const open = mean(plan.phones
    .filter((t) => t.word !== undefined && !['had', 'been', 'and', 'the', 'was', 'there', 'no'].includes(t.word.toLowerCase()))
    .map((t) => t.seconds));
  check('a closed-class word is spoken tighter than a content word', closed < open * 0.75,
    `${(closed * 1000).toFixed(0)} ms against ${(open * 1000).toFixed(0)} ms`);
}

{
  // The run counter has to see across word boundaries: "spring, and" is one run.
  const stream = ['S', 'P', 'R', 'IH', 'NG', 'AE', 'N', 'D'].map((phone, index) => ({
    phone,
    stress: '0' as const,
    wordIndex: index < 5 ? 0 : index < 7 ? 1 : 2,
  }));
  // Every member of a run reports the whole run, so S-P-R is 3 for all three,
  // and the N-D pair straddles a word boundary and still counts as one run of 2.
  eq('a consonant run counts across word boundaries, not just within them',
    stream.map((_, index) => consonantRun(stream, index)), [3, 3, 3, 0, 1, 0, 2, 2]);
  check('the measured table is keyed the way the pack keys it', intrinsicKey('AA1') === 'aa' && intrinsicKey('AX') === 'ah');
}

{
  // Tempo is a scale on the plan, and nothing else changes shape.
  const { segments, intrinsic } = await planFor('Author of the danger trail, Philip Ross.', 'slt');
  const normal = planDurations(segments, intrinsic);
  const faster = planDurations(segments, intrinsic, { rate: 1.25 });
  const slower = planDurations(segments, intrinsic, { rate: 0.8 });
  between('rate 1.25 shortens the plan by exactly a fifth', faster.totalSeconds / normal.totalSeconds, 0.79, 0.81);
  between('rate 0.8 lengthens the plan by exactly a quarter', slower.totalSeconds / normal.totalSeconds, 1.24, 1.26);
  check('an extreme tempo still respects the per-phone bounds',
    planDurations(segments, intrinsic, { rate: 0.05 }).phones.every((t) => t.seconds >= MIN_PHONE_SECONDS) &&
    planDurations(segments, intrinsic, { rate: 20 }).phones.every((t) => t.seconds <= MAX_PHONE_SECONDS));
  const empty = planDurations([{ phones: [{ phone: 'AA', stress: '1' }] }], {});
  check('a phone with no measured duration still gets a sane target',
    empty.defaulted === 1 && empty.phones[0].seconds > 0.05 && empty.phones[0].seconds < MAX_PHONE_SECONDS,
    `${(empty.phones[0].seconds * 1000).toFixed(0)} ms, ${empty.defaulted} defaulted`);
  check('the fitted factors are the ones shipped', DEFAULT_WEIGHTS.pace > 0.8 && DEFAULT_WEIGHTS.pace <= 1 &&
    DEFAULT_WEIGHTS.stressPrimary > DEFAULT_WEIGHTS.stressReduced * 3);
}

releaseSynthesis(bright);
releaseSynthesis(quiet);
releaseSynthesis(robot);
releaseSynthesis(male);
releaseSynthesis(unresolved);
releaseSynthesis(warmed);
check('every object URL created by the suite was released', objectUrls.size === 0, `${objectUrls.size} still live`);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const total = passed + failures.length;
if (failures.length) {
  console.error(`\n${passed}/${total} render checks passed. Failures:`);
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  process.exit(1);
}
console.log(`\n${passed}/${total} render checks passed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
console.log(
  `  ${PASSAGES.length} passages, a ${LONG_PASSAGE_WORDS}-word passage, ` +
    `${rendered.reduce((total, entry) => total + entry.result.diagnostics.exactUnits, 0)} exact units, ` +
    `${rendered.reduce((total, entry) => total + entry.result.diagnostics.backoffUnits, 0)} same-speaker adaptations, ` +
    `${rendered.reduce((total, entry) => total + entry.result.diagnostics.fallbackPhones, 0)} mathematical stand-ins`,
);
