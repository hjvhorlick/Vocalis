import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseVoiceRatings } from '../src/utils/voiceRatings';
import { VoiceRating } from '../src/components/VoiceRating';
import { VoiceRatingsProvider } from '../src/components/VoiceRatingsProvider';
import { PRESET_VOICE_MODELS } from '../src/utils/naturalVoiceEngine';

test('empty and malformed storage safely becomes unrated', () => {
  for (const value of [null, '', 'broken', 'null', '[]', '5', '"text"']) {
    assert.deepEqual(parseVoiceRatings(value), {});
  }
});

test('only whole-number grades from 1 to 5 are accepted', () => {
  assert.deepEqual(parseVoiceRatings(JSON.stringify({ a: 1, b: 5, c: 0, d: 6, e: 2.5, f: '4', g: null, h: true })), { a: 1, b: 5 });
});

test('all 60 presets have independent five-star controls and unique radio groups', () => {
  assert.equal(PRESET_VOICE_MODELS.length, 60);
  assert.equal(new Set(PRESET_VOICE_MODELS.map(v => v.id)).size, 60);
  const html = renderToStaticMarkup(
    <VoiceRatingsProvider>
      {PRESET_VOICE_MODELS.map(voice => <VoiceRating key={voice.id} voiceId={voice.id} voiceName={voice.name} />)}
    </VoiceRatingsProvider>
  );
  assert.equal((html.match(/type="radio"/g) || []).length, 300);
  assert.equal((html.match(/Not rated/g) || []).length, 60);
  const groups = [...html.matchAll(/name="(voice-rating-[^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(groups).size, 60);
  for (const name of new Set(groups)) assert.equal(groups.filter(group => group === name).length, 5);
});
