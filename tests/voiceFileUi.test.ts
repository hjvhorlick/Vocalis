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
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { VoiceSettingRow } from '../src/components/VoiceSettingRow';
import { VoiceManipulator } from '../src/components/VoiceManipulator';
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

console.log('\nand on the Text to Speech panels');

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
check('every voice-changer slider has a switch beside it', switchCount === sliderCount, `${switchCount} switches, ${sliderCount} sliders`);
check('the switches start on for a saved voice', (panel.match(/aria-checked="true"/g) ?? []).length === switchCount, `${switchCount} switches`);

console.log(`\n${passed}/${passed + failures.length} switch checks passed.`);
if (failures.length) {
  console.log('Failures:');
  for (const failure of failures) console.log(`  FAIL  ${failure}`);
  process.exitCode = 1;
}
