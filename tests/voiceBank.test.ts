import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRecordingProject } from '../src/utils/recordingPrompts';
import { encodeMonoWav, decodeProjectWav, inspectRecording } from '../src/utils/recordingAudio';
import { buildVoiceBank, bankCoverage, renderBankWords, selectVoiceUnits, validateAlignment, seedAlignment, joinSoundChunks } from '../src/utils/voiceBankEngine';
import { exportVoiceBank, importVoiceBank } from '../src/utils/voiceBankArchive';
import { exportRecordingArchive, importRecordingArchive } from '../src/utils/recordingArchive';
import { parsePhones, planWords, validatePronunciations } from '../src/utils/voicePhonetics';
import { generateSpokenAudioWav, PRESET_VOICE_MODELS } from '../src/utils/naturalVoiceEngine';

function fixture() {
  const project = createRecordingProject();
  project.name = 'Test speaker'; project.permissionConfirmed = true;
  project.prompts = [{ id: 'bee', text: 'Bee.', category: 'Test' }];
  const audio = Float32Array.from({ length: 24000 }, (_, i) => Math.sin(i / (i < 12000 ? 16 : 22)) * 0.2);
  project.recordings.bee = { promptId: 'bee', audio: encodeMonoWav(audio), quality: inspectRecording(audio), recordedAt: new Date().toISOString(), alignment: { reviewed: true, segments: [{ phone: 'B', start: 0, end: 0.5 }, { phone: 'IY', start: 0.5, end: 1 }] } };
  return project;
}

test('alignment seeds are explicitly unreviewed; validation rejects overlaps and bad labels', () => {
  assert.equal(seedAlignment(['B', 'IY'], 1).reviewed, false);
  assert.equal(validateAlignment(fixture().recordings.bee.alignment, 1).segments.length, 2);
  assert.throws(() => validateAlignment({ reviewed: true, segments: [{ phone: 'X', start: 0, end: 1 }] }, 1), /boundaries/);
  assert.throws(() => validateAlignment({ reviewed: true, segments: [{ phone: 'B', start: 0, end: 0.6 }, { phone: 'IY', start: 0.5, end: 1 }] }, 1), /overlaps/);
  assert.throws(() => validateAlignment({ reviewed: true, segments: [{ phone: 'B', start: NaN, end: 1 }] }, 1), /boundaries/);
  assert.throws(() => validateAlignment({ reviewed: true, segments: [{ phone: 'B', start: 0, end: 2 }] }, 1), /boundaries/);
});

test('bank build uses only reviewed recordings and reports honest inventory coverage', async () => {
  const project = fixture();
  project.recordings.bee.alignment!.reviewed = false;
  await assert.rejects(buildVoiceBank(project), /review/);
  project.recordings.bee.alignment!.reviewed = true;
  const bank = await buildVoiceBank(project);
  assert.equal(bank.units.length, 3); // B, B|IY, IY
  assert.deepEqual(bankCoverage(bank).present, ['B', 'IY']);
  assert.equal(bankCoverage(bank).missing.length, 37);
  project.permissionConfirmed = false;
  await assert.rejects(buildVoiceBank(project), /permission/);
});

test('selector preserves a longer matching unit and speech length depends on new text', async () => {
  const bank = await buildVoiceBank(fixture());
  const audio = decodeProjectWav(await bank.audio.arrayBuffer());
  const chosen = selectVoiceUnits(['B', 'IY'], bank, audio);
  assert.equal(chosen.length, 1);
  assert.deepEqual(chosen[0].phones, ['B', 'IY']);
  const dictionary = new Map([['bee', ['B', 'IY']], ['be', ['B', 'IY']], ['tea', ['T', 'IY']]]);
  const one = await renderBankWords(planWords('bee', dictionary).words, bank);
  const two = await renderBankWords(planWords('be bee', dictionary).words, bank);
  assert.equal(two.duration, one.duration * 2);
  assert.equal(two.wordTimings.length, 2);
  assert.ok(two.audio.size > one.audio.size);
  await assert.rejects(renderBankWords(planWords('tea', dictionary).words, bank), /Missing sounds: T/);
  assert.throws(() => selectVoiceUnits(['T'], bank, audio), /cannot cover/);
});

test('bank export/import validates audio hash, bounds, formats and notices', async () => {
  const bank = await buildVoiceBank(fixture());
  const file = await exportVoiceBank(bank);
  const imported = await importVoiceBank(file);
  assert.notEqual(imported.id, bank.id);
  assert.deepEqual(imported.units, bank.units);
  assert.deepEqual(await imported.audio.arrayBuffer(), await bank.audio.arrayBuffer());
  assert.ok(imported.notices.some(notice => notice.includes('Carnegie')));
  const data = JSON.parse(await file.text());
  const read = (value: unknown) => importVoiceBank(new Blob([JSON.stringify(value)]));
  await assert.rejects(read({ ...data, audio: { ...data.audio, sha256: '0'.repeat(64) } }), /checksum/);
  await assert.rejects(read({ ...data, units: [{ ...data.units[0], offset: 999999999 }] }), /offsets/);
  await assert.rejects(read({ ...data, notices: [] }), /notices/);
  await assert.rejects(read({ ...data, version: 99 }), /Expected/);
});

test('v2 projects preserve reviewed labels and pronunciation entries; v1 still loads', async () => {
  const project = fixture(); project.pronunciations = { beee: ['B', 'IY'] };
  const file = await exportRecordingArchive(project);
  const data = JSON.parse(await file.text()); assert.equal(data.version, 2);
  const imported = await importRecordingArchive(file);
  assert.deepEqual(imported.recordings.bee.alignment, project.recordings.bee.alignment);
  assert.deepEqual(imported.pronunciations, project.pronunciations);
  delete data.recordings[0].alignment; delete data.pronunciations; data.version = 1;
  const legacy = await importRecordingArchive(new Blob([JSON.stringify(data)]));
  assert.equal(legacy.recordings.bee.alignment, undefined);
  assert.equal(legacy.permissionConfirmed, false);
});

test('English planner reports unknown words; never silently drops numbers or foreign text', () => {
  const dictionary = new Map([['bee', ['B', 'IY']]]);
  assert.deepEqual(planWords('bee xyz', dictionary).unknown, ['xyz']);
  assert.deepEqual(planWords('bee xyz', dictionary, { xyz: ['Z'] }).unknown, []);
  assert.throws(() => planWords('bee 23', dictionary), /Spell out/);
  assert.throws(() => planWords('café', dictionary), /English/);
  assert.throws(() => validatePronunciations({ word: ['INVALID'] }), /Invalid/);
  assert.deepEqual(parsePhones('b iy1'), ['B', 'IY']);
  assert.throws(() => parsePhones('SIL'), /Use space/);
  assert.deepEqual(parsePhones('SIL B', true), ['SIL', 'B']);
});

test('joining very short chunks has bounded output and no negative allocation', () => {
  assert.equal(joinSoundChunks([]).length, 0);
  const result = joinSoundChunks([new Float32Array([0.1]), new Float32Array([0.2]), new Float32Array([0.3])]);
  assert.ok(result.length > 0 && result.length <= 3);
  assert.ok([...result].every(Number.isFinite));
});

test('main WAV export now synthesizes text instead of reading unrelated source recordings', async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/')) {
      requests.push(url);
      assert.ok(!url.startsWith('/samples/'), 'Text generation must not load an original demo recording');
      return new Response(await readFile(new URL(`../public${url}`, import.meta.url)));
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  let first = '', second = '';
  try {
    first = (await generateSpokenAudioWav('Hello.', PRESET_VOICE_MODELS[0])).audioUrl;
    second = (await generateSpokenAudioWav('The garden is quiet today.', PRESET_VOICE_MODELS[0])).audioUrl;
    const a = await (await originalFetch(first)).arrayBuffer(), b = await (await originalFetch(second)).arrayBuffer();
    assert.notDeepEqual(a, b);
    assert.ok(requests.some(url => url.includes('diphones.bin')));
    await assert.rejects(generateSpokenAudioWav('', PRESET_VOICE_MODELS[0]), /Enter/);
  } finally { globalThis.fetch = originalFetch; if (first) URL.revokeObjectURL(first); if (second) URL.revokeObjectURL(second); }
});
