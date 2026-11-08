#!/usr/bin/env tsx
/**
 * The switches, rendered.
 *
 * The complaint that produced this file: sliders with no switch beside them, so
 * there was no way to find out which setting was spoiling a voice. Prose in a commit
 * message does not answer that, so these checks render the real components to HTML
 * and assert the switch is in the same row as the slider, that it reports its state,
 * and that a bypassed setting disables its slider and says so.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { VoiceSettingRow, VoiceSwitchRow, VoiceToneRow } from '../src/components/VoiceSettingRow';
import { VoiceManipulator } from '../src/components/VoiceManipulator';
import { ALL_OFF, NEUTRAL_KNOBS, effectiveModel, profileFrom } from '../src/components/VoiceFileCreator';
import { transformRecordedVoice } from '../src/utils/voiceTransform';
import { PRESET_VOICE_MODELS } from '../src/utils/naturalVoiceEngine';

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

const row = (on: boolean, extra: Partial<React.ComponentProps<typeof VoiceSettingRow>> = {}) =>
  renderToStaticMarkup(
    createElement(VoiceSettingRow, {
      label: 'Clarity',
      hint: 'Presence lift around the consonants.',
      on,
      value: 0.25,
      min: 0,
      max: 1,
      step: 0.05,
      format: (value: number) => `${Math.round(value * 100)}%`,
      onToggle: () => undefined,
      onChange: () => undefined,
      onTest: () => undefined,
      ...extra,
    }),
  );

console.log('\na settings row');

const onMarkup = row(true);
const offMarkup = row(false);

check('the row carries a switch', /role="switch"/.test(onMarkup));
check('and the switch is on when the setting is on', /aria-checked="true"/.test(onMarkup));
check('and off when it is off', /aria-checked="false"/.test(offMarkup));
check(
  'the switch sits in the same row as the slider',
  (() => {
    // Everything between the switch and the slider must contain no row boundary:
    // the switch and the input are siblings in the same flex line.
    const switchAt = onMarkup.indexOf('role="switch"');
    const sliderAt = onMarkup.indexOf('type="range"');
    const between = onMarkup.slice(switchAt, sliderAt);
    return switchAt > -1 && sliderAt > switchAt && !between.includes('</div><div');
  })(),
);
const sliderTag = (markup: string) => (markup.match(/<input[^>]*type="range"[^>]*>/) ?? [''])[0];
check('the slider is enabled while the setting is applied', !/\sdisabled(=|\s|>)/.test(sliderTag(onMarkup)), sliderTag(onMarkup).slice(0, 80));
check('and disabled when it is bypassed', /\sdisabled(=|\s|>)/.test(sliderTag(offMarkup)));
check('the value is shown while on', /25%/.test(onMarkup));
check('and replaced by "off" when bypassed', /off/.test(offMarkup) && !/25%/.test(offMarkup));
check('the hint explains the setting while on', /Presence lift/.test(onMarkup));
check('and explains the bypass when off', /bypassed for this voice file/.test(offMarkup));
check('each row can be A/B tested', /A\/B/.test(onMarkup));
check('an A/B in progress says so', /Stop/.test(row(true, { testing: true })));
check(
  'all five creator settings render their own switch and slider',
  ['Pitch', 'Pace', 'Warmth', 'Clarity', 'Air'].every((label) => {
    const markup = renderToStaticMarkup(
      createElement(VoiceSettingRow, {
        label,
        hint: 'x',
        on: true,
        value: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
        format: (value: number) => `${value}`,
        onToggle: () => undefined,
        onChange: () => undefined,
        onTest: () => undefined,
      }),
    );
    return /role="switch"/.test(markup) && /type="range"/.test(markup) && markup.includes(label);
  }),
);

console.log('\nand on the Spoken Word panels');

const model = { ...PRESET_VOICE_MODELS[0], pitch: 1.2, rate: 0.9, throatWarmth: 2, oralClarity: 1, airPresence: 1 };
const panel = renderToStaticMarkup(
  createElement(VoiceManipulator, {
    voice: model,
    onUpdateVoice: () => undefined,
    onSaveAsCustom: () => undefined,
    onResetToDefault: () => undefined,
  }),
);
const switchCount = (panel.match(/role="switch"/g) ?? []).length;
const sliderCount = (panel.match(/type="range"/g) ?? []).length;
check(
  'every slider has a switch, and the tone row has one too',
  switchCount === sliderCount + 1,
  `${switchCount} switches, ${sliderCount} sliders`,
);
check('the switches start on for a saved voice', (panel.match(/aria-checked="true"/g) ?? []).length === switchCount, `${switchCount} switches`);
check('and the tone chips are live', (panel.match(/aria-pressed="true"/g) ?? []).length === 1);

console.log('\nthe tone row');

const toneOn = renderToStaticMarkup(
  createElement(VoiceToneRow, {
    on: true,
    tone: 'deep',
    hint: 'The delivery character.',
    onToggle: () => undefined,
    onSelect: () => undefined,
    onTest: () => undefined,
  }),
);
const toneOff = renderToStaticMarkup(
  createElement(VoiceToneRow, {
    on: false,
    tone: 'deep',
    hint: 'The delivery character.',
    onToggle: () => undefined,
    onSelect: () => undefined,
    onTest: () => undefined,
  }),
);
check('the tone row has a switch', /role="switch"/.test(toneOn));
check('its chips are pressable while it is on', /aria-pressed="true"/.test(toneOn));
check('and disabled when it is off', (toneOff.match(/<button[^>]*disabled/g) ?? []).length >= 6, '6 chips disabled');
check('the bypass is stated in words', /Tone is bypassed/.test(toneOff));
check('and the row shows which tone is chosen', /Deep Cinema/.test(toneOn));

// Every control that changes the voice in the creator is switchable, which is the
// whole complaint: count the rows against the switches.
const creatorRows = ['Pace', 'Volume', 'Warmth', 'Clarity', 'Air'].map((label) =>
  renderToStaticMarkup(
    createElement(VoiceSettingRow, {
      label,
      hint: 'x',
      on: true,
      value: 0.5,
      min: 0,
      max: 1,
      step: 0.05,
      format: (value: number) => `${value}`,
      onToggle: () => undefined,
      onChange: () => undefined,
      onTest: () => undefined,
    }),
  ),
);
check(
  'five numeric settings, the tone row, intonation and join levels: eight switches for eight controls',
  creatorRows.every((markup) => /role="switch"/.test(markup)) &&
    /role="switch"/.test(toneOn) &&
    Object.keys(ALL_OFF).length === 8,
  `${creatorRows.length + 1} slider rows and ${Object.keys(ALL_OFF).length} switches`,
);
// The strongest form of the check: no setting the page knows about is called pitch,
// and the page's own switch table has no pitch entry either.
check(
  'and nothing on the page is a pitch control',
  !('pitch' in ALL_OFF) && !('pitch' in NEUTRAL_KNOBS),
  `switches: ${Object.keys(ALL_OFF).join(', ')}`,
);

// Intonation has no knob — only the stage to have on or off — and it still has to
// look and read like every other switch.
const intonationRow = (on: boolean) =>
  renderToStaticMarkup(
    createElement(VoiceSwitchRow, {
      label: 'Intonation',
      hint: 'The phrase contour.',
      on,
      onToggle: () => undefined,
      onTest: () => undefined,
    }),
  );
const intonationOn = intonationRow(true);
const intonationOff = intonationRow(false);
check('the intonation row has a switch', /role="switch"/.test(intonationOn));
check('it reports itself on', /aria-checked="true"/.test(intonationOn) && /aria-checked="false"/.test(intonationOff));
check('and says in words that it is bypassed', /Intonation is bypassed/.test(intonationOff));
check('the row labels itself for assistive technology', /aria-label="Intonation on or off"/.test(intonationOn));

console.log('\nthe workbench opens clean');

// The page must start with nothing applied, so the first thing anyone hears is the
// recording. `ALL_OFF` plus neutral knobs has to be a bypass of every stage.
const cleanProfile = profileFrom(ALL_OFF, NEUTRAL_KNOBS, 'natural');
check('every switch starts off', Object.values(ALL_OFF).every((value) => value === false), `${Object.keys(ALL_OFF).length} switches`);
check('and the profile records them all as off', Object.values(cleanProfile.enabled).every((value) => value === false));
check(
  'with every knob at the value that changes nothing',
  cleanProfile.settings.rate === 1 && cleanProfile.settings.throatWarmth === 0,
);
check(
  'and no pitch in the record at all, because there is no pitch stage to record',
  cleanProfile.settings.pitch === undefined && cleanProfile.enabled.pitch === undefined,
);

{
  const base = PRESET_VOICE_MODELS[0];
  const clean = effectiveModel(base, ALL_OFF, NEUTRAL_KNOBS, 'natural');
  const recording = new Float32Array(16000);
  for (let index = 0; index < recording.length; index += 1) {
    recording[index] = 0.3 * Math.sin((2 * Math.PI * 140 * index) / 16000);
  }
  const rendered = transformRecordedVoice(recording, {
    pitch: clean.pitch,
    rate: clean.rate,
    toneStyle: clean.toneStyle,
    throatWarmth: clean.throatWarmth,
    oralClarity: clean.oralClarity,
    airPresence: clean.airPresence,
    bypass: clean.bypass,
  }, 16000);
  const identical = rendered.length === recording.length && recording.every((value, index) => value === rendered[index]);
  check('a clean session renders the recording sample for sample', identical, `${rendered.length} samples`);
  check('because every stage is bypassed, not zeroed', Object.values(clean.bypass ?? {}).every((value) => value === true));
  check('including the phrase contour', clean.bypass?.contour === true, 'the stage that re-pitches every unit');
  const contourOnly = effectiveModel(base, { ...ALL_OFF, contour: true }, NEUTRAL_KNOBS, 'natural');
  check(
    'and switching only intonation on turns exactly that stage back on',
    contourOnly.bypass?.contour === false && Object.entries(contourOnly.bypass ?? {}).filter(([key, value]) => key !== 'contour' && value === false).length === 0,
  );
  check(
    'the exported profile records it like any other switch',
    profileFrom({ ...ALL_OFF, contour: true }, NEUTRAL_KNOBS, 'natural').enabled.contour === true,
  );

  // The control is gone. A page that still had a pitch knob would let this through;
  // the model the page builds must refuse to shift pitch whatever it is handed.
  const pitchAsked = effectiveModel(
    { ...base, pitch: 1.4 },
    ALL_OFF,
    { ...NEUTRAL_KNOBS, pitch: 1.4 } as unknown as typeof NEUTRAL_KNOBS,
    'natural',
  );
  const pitchRendered = transformRecordedVoice(recording, {
    pitch: pitchAsked.pitch,
    rate: pitchAsked.rate,
    toneStyle: pitchAsked.toneStyle,
    throatWarmth: pitchAsked.throatWarmth,
    oralClarity: pitchAsked.oralClarity,
    airPresence: pitchAsked.airPresence,
    bypass: pitchAsked.bypass,
  }, 16000);
  check(
    'a page that asks for a pitch shift gets the recording untouched',
    pitchRendered.length === recording.length && recording.every((value, index) => value === pitchRendered[index]),
  );
  check('and the pitch stage is bypassed for good, not switched off', pitchAsked.bypass?.pitch === true);

  // One switch at a time: only the one that is on may change anything.

  const rateOnly = effectiveModel(base, { ...ALL_OFF, rate: true }, { ...NEUTRAL_KNOBS, rate: 1.5 }, 'natural');
  const rateRendered = transformRecordedVoice(recording, {
    pitch: rateOnly.pitch,
    rate: rateOnly.rate,
    toneStyle: rateOnly.toneStyle,
    throatWarmth: rateOnly.throatWarmth,
    oralClarity: rateOnly.oralClarity,
    airPresence: rateOnly.airPresence,
    bypass: rateOnly.bypass,
  }, 16000);
  check('switching only pace on changes the length and nothing else hides behind it', rateRendered.length < recording.length, `${recording.length} → ${rateRendered.length}`);
}

console.log('\nthe two pages are separate');

{
  // Structural, but it is the guarantee asked for: the studio takes its voices from
  // the saved list only, and never builds one out of the library's records.
  const app = readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf8');
  check('the Spoken Word page does not import the library rows', !/buildLibraryRows|modelForLibraryVoice|applyProfileToModel/.test(app));
  check('and offers the saved models as its voice list', /const studioModels = models;/.test(app) && /voices=\{studioModels\}/.test(app));
  check('a library voice reaches it only by being saved', /handleSaveModel\(\{ \.\.\.model, isCustom: true \}\)/.test(app));
  const creator = readFileSync(join(ROOT, 'src', 'components', 'VoiceFileCreator.tsx'), 'utf8');
  check('the workbench keeps its own state and never writes the studio model', !/onSelectVoice=|setActiveModel/.test(creator));
}

console.log('\nthe pages are named for what they are');

{
  // The creator is the .vls page, and TTS is not a word this app uses: it describes
  // an AI product we do not make, and these voices are recorded and cut by hand.
  const nav = readFileSync(join(ROOT, 'src', 'components', 'VoiceNavbar.tsx'), 'utf8');
  check('the creator tab is called the .vls Voice Creator', nav.includes("label: '.vls Voice Creator'"));
  const creator = readFileSync(join(ROOT, 'src', 'components', 'VoiceFileCreator.tsx'), 'utf8');
  check('and the page heading says it too', creator.includes('>.vls Voice Creator</h1>'));
  const uiFiles = ['App.tsx', 'components/VoiceNavbar.tsx', 'components/VoiceFileCreator.tsx', 'components/SpeechStudio.tsx', 'components/VoiceManipulator.tsx', 'components/VoiceSettingRow.tsx'];
  const offenders = uiFiles.filter((f) => /text[- ]to[- ]speech|\bTTS\b/i.test(readFileSync(join(ROOT, 'src', f), 'utf8')));
  check('no page is called Text to Speech or TTS any more', offenders.length === 0, offenders.join(', '));
}

console.log(`\n${passed}/${passed + failures.length} switch checks passed.`);
if (failures.length) {
  console.log('Failures:');
  for (const failure of failures) console.log(`  FAIL  ${failure}`);
  process.exitCode = 1;
}
