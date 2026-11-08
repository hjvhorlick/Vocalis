#!/usr/bin/env tsx
/**
 * Switched off means switched off.
 *
 * The complaint behind this file: a switch that sets a control to its neutral value
 * still runs that stage, so it is not the same as not having the stage at all — and
 * it cannot answer "is the pitch what makes this voice sound like a robot?".
 *
 * These checks are about arithmetic, not opinion: a bypassed stage must leave the
 * samples bit-identical, and a stage that is still on must still change them.
 */
import { transformRecordedVoice } from '../src/utils/voiceTransform';
import { processCmuVoice } from '../src/utils/cmuDiphoneSynthesizer';
import { PRESET_VOICE_MODELS } from '../src/utils/naturalVoiceEngine';

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

const RATE = 16000;

/** Two voiced seconds with a moving envelope: enough for every stage to act on. */
function recording(seconds = 2): Float32Array {
  const samples = new Float32Array(Math.round(RATE * seconds));
  for (let index = 0; index < samples.length; index += 1) {
    const t = index / RATE;
    const envelope = 0.5 + 0.5 * Math.sin(2 * Math.PI * 1.5 * t);
    samples[index] =
      0.4 *
      envelope *
      (Math.sin(2 * Math.PI * 118 * t) + 0.5 * Math.sin(2 * Math.PI * 236 * t) + 0.2 * Math.sin(2 * Math.PI * 900 * t));
  }
  return samples;
}

const input = recording();
const identical = (candidate: Float32Array, reference: Float32Array): boolean => {
  if (candidate.length !== reference.length) return false;
  for (let index = 0; index < reference.length; index += 1) {
    if (candidate[index] !== reference[index]) return false;
  }
  return true;
};
const differs = (candidate: Float32Array, reference: Float32Array): boolean =>
  candidate.length !== reference.length || !identical(candidate, reference);

const everythingOff = {
  pitch: 1.6,
  rate: 0.7,
  toneStyle: 'robot' as const,
  throatWarmth: 3,
  oralClarity: -3,
  airPresence: 3,
  bypass: {
    pitch: true,
    rate: true,
    tone: true,
    throatWarmth: true,
    oralClarity: true,
    airPresence: true,
  },
};

console.log('\nall stages bypassed');

const untouched = transformRecordedVoice(input, everythingOff, RATE);
check('the transform returns the recording exactly', identical(untouched, input), `${input.length} samples`);
check('and it is a copy, not the same buffer', untouched.buffer !== input.buffer);
check('it did not need to level-match anything', untouched[4000] === input[4000]);

console.log('\none switch at a time keeps its stage off and leaves the others on');

// Pitch has no switch and no stage. This used to assert that turning pitch on
// shifted the voice; the control is gone, so what it must assert now is the
// opposite — a profile asking for 1.6 gets the recording at its own pitch.
const pitchAsked = transformRecordedVoice(input, { ...everythingOff, bypass: { ...everythingOff.bypass, pitch: false } }, RATE);
check('a profile asking for a pitch shift is refused', identical(pitchAsked, input), `${input.length} samples, unchanged`);
const rateOn = transformRecordedVoice(input, { ...everythingOff, bypass: { ...everythingOff.bypass, rate: false } }, RATE);
check('pace on actually changes the length', rateOn.length !== input.length, `${input.length} → ${rateOn.length}`);
const toneOn = transformRecordedVoice(input, { ...everythingOff, bypass: { ...everythingOff.bypass, tone: false } }, RATE);
check('tone on actually changes the samples', differs(toneOn, input));
const warmOn = transformRecordedVoice(input, { ...everythingOff, bypass: { ...everythingOff.bypass, throatWarmth: false } }, RATE);
check('warmth on actually tilts the low end', differs(warmOn, input));

// The specific question asked: pitch and pace are the suspects for the robotic
// sound, so each has to be provably removable on its own. Pitch is now removed for
// every caller, not only for a switched-off one.
check('pitch is the untouched recording whether it is switched off or not', identical(pitchAsked, input));
const paceOff = transformRecordedVoice(input, { ...everythingOff, bypass: { ...everythingOff.bypass, rate: true } }, RATE);
check('pace off is the untouched recording', identical(paceOff, input));
check(
  'pace on with a pitch asked for leaves only the pace change',
  transformRecordedVoice(
    input,
    { ...everythingOff, bypass: { ...everythingOff.bypass, pitch: false, rate: false } },
    RATE,
  ).length !== input.length,
);

console.log('\nthe same through the CMU stage the app actually calls');

const model = {
  ...PRESET_VOICE_MODELS[0],
  pitch: 1.6,
  rate: 0.7,
  toneStyle: 'robot' as const,
  throatWarmth: 3,
  oralClarity: -3,
  airPresence: 3,
  bypass: {
    pitch: true,
    rate: true,
    tone: true,
    throatWarmth: true,
    oralClarity: true,
    airPresence: true,
  },
};
const cmuOff = processCmuVoice(input, model);
check('processCmuVoice with every switch off returns the recording', identical(cmuOff, input));
const cmuPitchOffOnly = processCmuVoice(input, {
  ...model,
  bypass: { ...model.bypass, rate: false },
});
check('and with pace on, only the pace stage runs', cmuPitchOffOnly.length !== input.length);
check(
  'pitch stays off in that render, so the length is the pace change alone',
  Math.abs(cmuPitchOffOnly.length - Math.floor(input.length / 0.7)) < 400,
  `${cmuPitchOffOnly.length} vs ${Math.floor(input.length / 0.7)}`,
);

console.log('\nthe two stages that ran with no switch at all');

// Finding from the second complaint: with all seven switches off the render was
// still 69 % different from the assembled units. Two stages ran unconditionally —
// the phrase contour, which re-pitches every unit onto one line, and the output
// leveller, which lifted the assembled recording by about 1 dB. Both are now off
// with their switch, and this is the measurement that says so on the real pack.
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { registerOptionalVoiceSource, unregisterOptionalVoiceSource } = await import(
    '../src/utils/optionalVoicePacks'
  );
  const { renderSpeech, initializeLocalSpeechEngine } = await import('../src/utils/naturalVoiceEngine');
  const { AUDITION_PHRASE } = await import('../src/utils/voiceLibrary');
  const { normaliseSamples } = await import('../src/utils/phonemeSynthesizer');

  const root = join(import.meta.dirname, '..');
  const dir = join(root, 'public', 'optional-voices', 'arctic-awb');
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const audio = readFileSync(join(dir, 'diphones.bin'));
  registerOptionalVoiceSource({
    id: 'bypass-probe',
    displayName: 'bypass probe',
    loadPack: async () => ({
      manifest,
      audio: audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer,
    }),
  });

  const base = {
    ...PRESET_VOICE_MODELS[0],
    id: 'bypass-probe',
    name: 'bypass probe',
    baseVoiceId: 'bypass-probe',
    synthesisMethod: 'cmu-arctic' as const,
    pitch: 1,
    rate: 1,
    volume: 1,
    toneStyle: 'natural' as const,
    throatWarmth: 0,
    oralClarity: 0,
    airPresence: 0,
  };
  const off = {
    pitch: true,
    rate: true,
    volume: true,
    tone: true,
    throatWarmth: true,
    oralClarity: true,
    airPresence: true,
    contour: true,
    joinLevel: true,
  };
  await initializeLocalSpeechEngine(base as never);
  const clean = await renderSpeech(AUDITION_PHRASE, { ...base, bypass: off } as never);
  const withContour = await renderSpeech(AUDITION_PHRASE, { ...base, bypass: { ...off, contour: false } } as never);

  let changed = 0;
  for (let index = 0; index < Math.min(clean.samples.length, withContour.samples.length); index += 1) {
    if (Math.abs(clean.samples[index] - withContour.samples[index]) > 1e-4) changed += 1;
  }
  const changedPct = (100 * changed) / clean.samples.length;
  check(
    'the phrase contour is a real stage, not a rounding error',
    changedPct > 20,
    `${changedPct.toFixed(1)}% of samples move when it is the only difference`,
  );

  const peakOf = (samples: Float32Array) => {
    let peak = 0;
    for (const value of samples) peak = Math.max(peak, Math.abs(value));
    return peak;
  };
  check(
    'with Volume off the render keeps the level the units arrived at',
    Math.abs(peakOf(clean.samples) - 0.685) < 0.04,
    `peak ${peakOf(clean.samples).toFixed(3)}, and the leveller alone would take it to 0.780`,
  );
  check(
    'and switching Volume on still levels it to the output ceiling',
    Math.abs(peakOf(normaliseSamples(clean.samples, 1)) - Math.min(0.78, 0.685 * 4)) < 0.01,
    `peak ${peakOf(normaliseSamples(clean.samples, 1)).toFixed(3)}`,
  );

  const repeat = await renderSpeech(AUDITION_PHRASE, { ...base, bypass: off } as never);
  let identicalRepeat = repeat.samples.length === clean.samples.length;
  for (let index = 0; identicalRepeat && index < clean.samples.length; index += 1) {
    if (repeat.samples[index] !== clean.samples[index]) identicalRepeat = false;
  }
  check('a clean render is repeatable to the sample', identicalRepeat, `${clean.samples.length} samples`);

  unregisterOptionalVoiceSource('bypass-probe');
}

console.log('\nthe joins are levelled, not stepped');

// Measured complaint: a unit's loudness spans about 17 dB across the pack, so two
// chunks meeting at a phone midpoint could be 10-20 dB apart. Before the join
// leveller the loudness step across a join was a median of 6.2 dB against 2.9 dB
// inside ordinary speech — twice the natural variation, 7.5 times a second. That
// step is heard as roughness, and roughness is most of what "metallic" means.
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { registerOptionalVoiceSource, unregisterOptionalVoiceSource } = await import(
    '../src/utils/optionalVoicePacks'
  );
  const { initializeLocalSpeechEngine, PRESET_VOICE_MODELS: presets } = await import(
    '../src/utils/naturalVoiceEngine'
  );
  const { renderCmuDiphones } = await import('../src/utils/cmuDiphoneSynthesizer');
  const { AUDITION_PHRASE } = await import('../src/utils/voiceLibrary');
  const { analyzeText, segmentUtterance } = await import('../src/utils/textAnalysis');

  const root = join(import.meta.dirname, '..');
  const dir = join(root, 'public', 'voicepacks', 'cmu-arctic', 'bdl');
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const audio = readFileSync(join(dir, 'diphones.bin'));
  registerOptionalVoiceSource({
    id: 'join-probe',
    displayName: 'join probe',
    loadPack: async () => ({
      manifest,
      audio: audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer,
    }),
  });

  const base = {
    ...presets[1],
    id: 'join-probe',
    name: 'join probe',
    baseVoiceId: 'join-probe',
    synthesisMethod: 'cmu-arctic' as const,
    pitch: 1,
    rate: 1,
    volume: 1,
    toneStyle: 'natural' as const,
    throatWarmth: 0,
    oralClarity: 0,
    airPresence: 0,
    bypass: {
      pitch: true,
      rate: true,
      volume: true,
      tone: true,
      throatWarmth: true,
      oralClarity: true,
      airPresence: true,
      contour: true,
    },
  };
  await initializeLocalSpeechEngine(base as never);
  const utterance = await analyzeText(AUDITION_PHRASE, 'US');
  const segments = segmentUtterance(utterance);
  const rendered = await renderCmuDiphones(
    segments.map((segment) => ({ phones: segment.phones, terminal: segment.terminal })),
    base as never,
    () => new Float32Array(400),
    0,
  );

  const samples = rendered.samples;
  const windowSamples = Math.round(0.03 * 16000);
  const rmsOf = (slice: Float32Array) => {
    let energy = 0;
    for (const value of slice) energy += value * value;
    return Math.sqrt(energy / Math.max(1, slice.length));
  };
  const stepAt = (position: number): number | null => {
    if (position <= windowSamples || position >= samples.length - windowSamples) return null;
    const before = rmsOf(samples.subarray(position - windowSamples, position));
    const after = rmsOf(samples.subarray(position, position + windowSamples));
    if (before < 1e-4 || after < 1e-4) return null;
    return Math.abs(20 * Math.log10(after / before));
  };
  const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  const atJoins = rendered.phoneOffsets.map((offset) => stepAt(Math.round(offset))).filter((v): v is number => v !== null);
  const inside: number[] = [];
  for (let position = windowSamples * 3; position < samples.length - windowSamples * 3; position += Math.round(0.11 * 16000)) {
    const step = stepAt(position);
    if (step !== null) inside.push(step);
  }
  const joinMedian = median(atJoins);
  const insideMedian = median(inside);
  check(
    'with the switch on, a join steps in level no more than ordinary speech does',
    joinMedian <= insideMedian + 1,
    `${joinMedian.toFixed(2)} dB median at ${atJoins.length} joins against ${insideMedian.toFixed(2)} dB inside speech (6.17 dB before the leveller)`,
  );

  // The other half of the claim: it really is a switch, and switching it off puts
  // the step back. A correction you cannot turn off is the flaw this app keeps
  // being pulled up on.
  const raw = await renderCmuDiphones(
    segments.map((segment) => ({ phones: segment.phones, terminal: segment.terminal })),
    { ...base, bypass: { ...(base as { bypass: Record<string, boolean> }).bypass, joinLevel: true } } as never,
    () => new Float32Array(400),
    0,
  );
  const rawSamples = raw.samples;
  const rawStepAt = (position: number): number | null => {
    if (position <= windowSamples || position >= rawSamples.length - windowSamples) return null;
    const before = rmsOf(rawSamples.subarray(position - windowSamples, position));
    const after = rmsOf(rawSamples.subarray(position, position + windowSamples));
    if (before < 1e-4 || after < 1e-4) return null;
    return Math.abs(20 * Math.log10(after / before));
  };
  const rawJoinMedian = median(
    raw.phoneOffsets.map((offset) => rawStepAt(Math.round(offset))).filter((v): v is number => v !== null),
  );
  check(
    'with it off, the joins step exactly as the recording cuts do',
    rawJoinMedian > joinMedian + 1.5,
    `${rawJoinMedian.toFixed(2)} dB levelling off against ${joinMedian.toFixed(2)} dB levelling on`,
  );

  unregisterOptionalVoiceSource('join-probe');
}

console.log(`\n${passed}/${passed + failures.length} bypass checks passed.`);
if (failures.length) {
  console.log('Failures:');
  for (const failure of failures) console.log(`  FAIL  ${failure}`);
  process.exitCode = 1;
}
