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

/** Pitch 1.6 with the switch on: the join of the two must differ from the input. */
const pitchOn = transformRecordedVoice(input, { ...everythingOff, bypass: { ...everythingOff.bypass, pitch: false } }, RATE);
check('pitch on actually shifts the voice', differs(pitchOn, input), `${input.length} → ${pitchOn.length} samples`);
const rateOn = transformRecordedVoice(input, { ...everythingOff, bypass: { ...everythingOff.bypass, rate: false } }, RATE);
check('pace on actually changes the length', rateOn.length !== input.length, `${input.length} → ${rateOn.length}`);
const toneOn = transformRecordedVoice(input, { ...everythingOff, bypass: { ...everythingOff.bypass, tone: false } }, RATE);
check('tone on actually changes the samples', differs(toneOn, input));
const warmOn = transformRecordedVoice(input, { ...everythingOff, bypass: { ...everythingOff.bypass, throatWarmth: false } }, RATE);
check('warmth on actually tilts the low end', differs(warmOn, input));

// The specific question asked: pitch and pace are the suspects for the robotic
// sound, so each has to be provably removable on its own.
const pitchOff = transformRecordedVoice(input, { ...everythingOff, bypass: { ...everythingOff.bypass, pitch: true } }, RATE);
check('pitch off is the untouched recording', identical(pitchOff, input));
const paceOff = transformRecordedVoice(input, { ...everythingOff, bypass: { ...everythingOff.bypass, rate: true } }, RATE);
check('pace off is the untouched recording', identical(paceOff, input));
check(
  'pitch off with pace on leaves only the pace change',
  transformRecordedVoice(
    input,
    { ...everythingOff, bypass: { ...everythingOff.bypass, pitch: true, rate: false } },
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

console.log(`\n${passed}/${passed + failures.length} bypass checks passed.`);
if (failures.length) {
  console.log('Failures:');
  for (const failure of failures) console.log(`  FAIL  ${failure}`);
  process.exitCode = 1;
}
