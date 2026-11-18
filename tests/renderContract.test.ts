import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PRESET_VOICE_MODELS } from '../src/utils/naturalVoiceEngine';
import {
  assertVoiceRenderEligibility,
  createVoiceRenderRequest,
  VOICE_RENDER_CONTRACT_VERSION,
} from '../src/utils/voiceRenderContract';
import { roomEnvironmentForId, roomRecipeId } from '../src/utils/roomEnvironment';
import { immutableOriginalProfile, originalSourceHash, originalSourceRecord } from '../src/utils/voiceProvenance';
import { ORIGINAL_SOURCE_SHA256 } from '../src/utils/originalSourceHashes';
import { NATURAL_HUMAN_SAMPLES } from '../src/utils/naturalHumanAudio';
import { validateAiCreationEligibility } from '../src/utils/aiVoiceCreation';
import type { VoiceAsset } from '../src/types/voiceAsset';
import { transformPitchAndRate } from '../src/utils/cmuDiphoneSynthesizer';

const original = PRESET_VOICE_MODELS[0];

test('original profiles are immutable records with an inventory hash, not mutable custom definitions', () => {
  assert.equal(original.sourceType, 'original');
  assert.equal(original.reviewState, 'original-locked');
  assert.equal(original.isLockedOriginal, true);
  assert.equal(immutableOriginalProfile(original), true);
  assert.match(originalSourceHash(original) || '', /^[a-f0-9]{64}$/);
  assert.equal(originalSourceRecord(original.sourceId)?.immutable, true);
});

test('checked-in original source hashes detect a changed import without rendering from it', async () => {
  for (const sample of NATURAL_HUMAN_SAMPLES) {
    const bytes = await readFile(new URL(`../public${sample.url}`, import.meta.url));
    const actual = createHash('sha256').update(bytes).digest('hex');
    assert.equal(actual, ORIGINAL_SOURCE_SHA256[sample.id], sample.id);
  }
});

test('audition, validation and final requests pin the selected voice and room recipe', () => {
  const audition = createVoiceRenderRequest(original, 'A short voice check.', { environmentId: 'office', purpose: 'audition' });
  const validation = createVoiceRenderRequest(original, 'A short voice check.', { environmentId: 'office', purpose: 'validation' });
  const final = createVoiceRenderRequest(original, 'A short voice check.', { environmentId: 'office', purpose: 'final' });
  assert.equal(audition.contractVersion, VOICE_RENDER_CONTRACT_VERSION);
  assert.equal(audition.voiceDefinitionId, validation.voiceDefinitionId);
  assert.equal(audition.voiceDefinitionId, final.voiceDefinitionId);
  assert.equal(audition.voiceRecipeId, validation.voiceRecipeId);
  assert.equal(audition.environmentRecipeId, validation.environmentRecipeId);
  assert.equal(audition.environmentRecipeId, roomRecipeId(roomEnvironmentForId('office')));
  assert.doesNotThrow(() => assertVoiceRenderEligibility(original, final));
});

test('a final render cannot bypass required review of a derived candidate', () => {
  const candidate = {
    ...original,
    id: 'derived-for-test',
    isCustom: true,
    sourceType: 'derived' as const,
    parentVoiceDefinitionId: original.id,
    recipeId: 'derived-local-v1:test',
    reviewState: 'candidate' as const,
    isLockedOriginal: false,
  };
  const request = createVoiceRenderRequest(candidate, 'The validation sentence is stable.', { purpose: 'final' });
  assert.throws(() => assertVoiceRenderEligibility(candidate, request), /review candidate/);
  assert.doesNotThrow(() => assertVoiceRenderEligibility({
    ...candidate,
    reviewState: 'approved',
    validatedRecipeId: request.voiceRecipeId,
    approvedEnvironmentRecipeIds: [request.environmentRecipeId!],
  }, request));
  assert.throws(() => assertVoiceRenderEligibility({ ...candidate, reviewState: 'approved', validatedRecipeId: request.voiceRecipeId }, request), /room treatment/);
});

test('derived DSP keeps pitch and duration controls separate', () => {
  const source = Float32Array.from({ length: 1600 }, (_, index) => Math.sin(2 * Math.PI * index / 45));
  const paced = transformPitchAndRate(source, 1, 0.8);
  const pitchedAndPaced = transformPitchAndRate(source, 1.35, 0.8);
  assert.equal(paced.length, Math.floor(source.length / 0.8));
  assert.equal(pitchedAndPaced.length, paced.length, 'pitch must not change target duration');
  assert.notDeepEqual([...pitchedAndPaced.slice(0, 400)], [...paced.slice(0, 400)], 'pitch must alter samples at the same pace');
});

test('AI creation requires an exact consented source hash before a job can exist', () => {
  const source: VoiceAsset = {
    id: 'source-1', role: 'original', profileId: original.id, sourceHash: 'a'.repeat(64), audioHash: 'a'.repeat(64),
    createdAt: '2026-11-18T00:00:00.000Z', reviewState: 'locked', immutableOriginal: true, disclosure: 'source only',
  };
  const consent = {
    id: 'consent-1', sourceAssetId: 'source-1', sourceHash: 'a'.repeat(64), speakerOrRightsHolder: 'Test holder',
    releaseScope: 'own-voice' as const, permitsAiDerivedAudio: true as const, permitsFreeLibraryDistribution: true as const,
    retentionEndsAt: '2099-01-01T00:00:00.000Z', revocable: true, confirmedAt: '2026-11-18T00:00:00.000Z',
  };
  assert.doesNotThrow(() => validateAiCreationEligibility(source, consent));
  assert.throws(() => validateAiCreationEligibility(source, { ...consent, sourceHash: 'b'.repeat(64) }), /exact source asset hash/);
});

test('dry reference is a true bypass recipe while modelled rooms preserve their distinct identity', () => {
  const dry = roomEnvironmentForId('dry-reference');
  const hall = roomEnvironmentForId('theatre-hall');
  assert.equal(dry.kind, 'dry');
  assert.equal(dry.wet, 0);
  assert.equal(hall.kind, 'modelled');
  assert.ok(hall.rt60 > dry.rt60);
  assert.notEqual(roomRecipeId(dry), roomRecipeId(hall));
});
