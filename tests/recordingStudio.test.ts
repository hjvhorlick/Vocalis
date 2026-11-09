import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRecordingProject, STARTER_PROMPTS } from '../src/utils/recordingPrompts';
import { assemblePhrases, decodeProjectWav, encodeMonoWav, inspectRecording, RECORDING_SAMPLE_RATE } from '../src/utils/recordingAudio';
import { exportRecordingArchive, importRecordingArchive, PROJECT_FORMAT, PHRASE_VOICE_FORMAT } from '../src/utils/recordingArchive';

function signal(seconds = 1, amplitude = 0.2) {
  return Float32Array.from({ length: RECORDING_SAMPLE_RATE * seconds }, (_, i) => Math.sin(i * 0.05) * amplitude);
}
function projectWithTake() {
  const project = createRecordingProject();
  project.permissionConfirmed = true;
  project.recordings.welcome = { promptId: 'welcome', audio: encodeMonoWav(signal()), quality: inspectRecording(signal()), recordedAt: new Date().toISOString() };
  return project;
}

test('starter prompts are distinct, bounded and independent across projects', () => {
  const a = createRecordingProject(), b = createRecordingProject();
  assert.equal(STARTER_PROMPTS.length, 20);
  assert.equal(new Set(STARTER_PROMPTS.map(p => p.id)).size, 20);
  a.prompts[0].text = 'changed';
  assert.notEqual(a.prompts[0].text, b.prompts[0].text);
  assert.notEqual(a.id, b.id);
  assert.equal(a.permissionConfirmed, false);
});

test('PCM WAV is canonical and preserves samples', async () => {
  const source = signal();
  const wav = encodeMonoWav(source);
  assert.equal(wav.size, 44 + source.length * 2);
  const decoded = decodeProjectWav(await wav.arrayBuffer());
  assert.equal(decoded.length, source.length);
  assert.ok(Math.abs(decoded[103] - source[103]) < 0.0001);
  assert.throws(() => decodeProjectWav(new ArrayBuffer(10)), /Invalid WAV/);
  const corrupt = await wav.arrayBuffer(); new DataView(corrupt).setUint32(24, 8000, true);
  assert.throws(() => decodeProjectWav(corrupt), /Unsupported recording/);
});

test('level checks reject silence/short takes and flag clipping', () => {
  assert.equal(inspectRecording(new Float32Array(24000)).usable, false);
  assert.equal(inspectRecording(signal(0.1)).usable, false);
  assert.equal(inspectRecording(signal()).usable, true);
  assert.ok(inspectRecording(signal(1, 0.01)).warnings.some(w => w.includes('quiet')));
  assert.ok(inspectRecording(new Float32Array(24000).fill(1)).warnings.some(w => w.includes('distortion')));
});

test('project round trip preserves exact audio and transcripts but requires fresh permission', async () => {
  const original = projectWithTake();
  const archive = await exportRecordingArchive(original);
  const data = JSON.parse(await archive.text());
  assert.equal(data.format, PROJECT_FORMAT);
  const imported = await importRecordingArchive(archive);
  assert.notEqual(imported.id, original.id);
  assert.equal(imported.permissionConfirmed, false);
  assert.deepEqual(imported.prompts, original.prompts);
  assert.deepEqual(await imported.recordings.welcome.audio.arrayBuffer(), await original.recordings.welcome.audio.arrayBuffer());
});

test('phrase voice includes only recorded phrases and explicitly limits synthesis', async () => {
  const original = projectWithTake();
  const archive = await exportRecordingArchive(original, true);
  const data = JSON.parse(await archive.text());
  assert.equal(data.format, PHRASE_VOICE_FORMAT);
  assert.equal(data.synthesis, 'recorded-phrases-only');
  assert.equal(data.prompts.length, 1);
  assert.equal((await importRecordingArchive(archive)).prompts.length, 1);
  original.permissionConfirmed = false;
  await assert.rejects(exportRecordingArchive(original), /permission/);
  const empty = createRecordingProject(); empty.permissionConfirmed = true;
  await assert.rejects(exportRecordingArchive(empty, true), /at least one/);
});

test('reject unsafe, corrupt, unsupported and incomplete archives', async () => {
  const data = JSON.parse(await (await exportRecordingArchive(projectWithTake())).text());
  const read = (value: unknown) => importRecordingArchive(new Blob([JSON.stringify(value)]));
  await assert.rejects(read({ ...data, version: 100 }), /Unsupported/);
  await assert.rejects(read({ ...data, prompts: [data.prompts[0], data.prompts[0]] }), /duplicate sentence/);
  await assert.rejects(read({ ...data, prompts: [{ ...data.prompts[0], id: 'constructor' }] }), /Invalid/);
  await assert.rejects(read({ ...data, recordings: [...data.recordings, ...data.recordings] }), /duplicate recording/);
  await assert.rejects(read({ ...data, recordings: [{ ...data.recordings[0], wavBase64: 'invalid%' }] }), /Corrupt/);
  await assert.rejects(read({ ...data, format: PHRASE_VOICE_FORMAT, version: 1 }), /every sentence/);
  await assert.rejects(importRecordingArchive(new Blob(['not json'])), /not a valid/);
});

test('phrase assembly follows order, inserts pauses, rejects empty and excessive sequences', async () => {
  const one = encodeMonoWav(signal(1, 0.2)), two = encodeMonoWav(signal(1, 0.4));
  const result = decodeProjectWav(await (await assemblePhrases([one, two])).arrayBuffer());
  assert.equal(result.length, 48000 + 4320);
  assert.equal(result[25000], 0);
  assert.ok(Math.abs(result[24000 + 4320 + 1030]) > Math.abs(result[1030]));
  await assert.rejects(assemblePhrases([]), /Choose/);
  await assert.rejects(assemblePhrases(Array(21).fill(one)), /Choose/);
});
