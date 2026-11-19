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
import { revokeAiConsent, validateAiCreationEligibility } from '../src/utils/aiVoiceCreation';
import type { VoiceAsset } from '../src/types/voiceAsset';
import { transformPitchAndRate, transformVoicedPitch } from '../src/utils/cmuDiphoneSynthesizer';
import { ORIGINAL_PERSONALITY_SHA256 } from '../src/utils/originalPersonalityFingerprints';
import { analysePcm } from '../src/utils/voiceAnalysis';
import { inspectPcmQuality } from '../src/utils/voiceQuality';
import { warpSpectralEnvelope } from '../src/utils/spectralEnvelopeWarp';
import { stabilizeDspPcm } from '../src/utils/audioDspEngine';
import { ORIGINAL_VOICE_PACK_SHA256 } from '../src/utils/originalVoicePackHashes';
import { createFreeLibraryManifest } from '../src/utils/freeLibraryPublication';
import { createBlindListeningTrial, validateBlindListeningResponse } from '../src/utils/blindListeningTest';

const original = PRESET_VOICE_MODELS[0];

test('original profiles are immutable records with an inventory hash, not mutable custom definitions', () => {
  assert.equal(original.sourceType, 'original');
  assert.equal(Object.isFrozen(original), true);
  assert.equal(original.reviewState, 'original-locked');
  assert.equal(original.isLockedOriginal, true);
  assert.equal(immutableOriginalProfile(original), true);
  assert.match(originalSourceHash(original) || '', /^[a-f0-9]{64}$/);
  assert.equal(originalSourceRecord(original.sourceId)?.immutable, true);
  assert.equal(originalSourceRecord(original.sourceId)?.aiCreationStatus, 'not-reviewed');
});

test('existing personality and source-profile fields remain unchanged', () => {
  assert.equal(Object.keys(ORIGINAL_PERSONALITY_SHA256).length, PRESET_VOICE_MODELS.length);
  for (const profile of PRESET_VOICE_MODELS) {
    const personality = {
      id: profile.id, name: profile.name, archetype: profile.archetype, description: profile.description,
      gender: profile.gender, accent: profile.accent, flag: profile.flag, samplePhrase: profile.samplePhrase,
      avatarColor: profile.avatarColor, baseSampleId: profile.baseSampleId, baseVoiceId: profile.baseVoiceId || null,
      synthesisMethod: profile.synthesisMethod || null, unitVoiceId: profile.unitVoiceId || null,
      realSpeakerName: profile.realSpeakerName || null, pitch: profile.pitch, rate: profile.rate,
      volume: profile.volume, toneStyle: profile.toneStyle,
    };
    const digest = createHash('sha256').update(JSON.stringify(personality)).digest('hex');
    assert.equal(digest, ORIGINAL_PERSONALITY_SHA256[profile.id], profile.id);
  }
});

test('only packaged CMU BDL and SLT source packs may render arbitrary local text', () => {
  for (const profile of PRESET_VOICE_MODELS) {
    const hasPack = /^(cmu-slt|cmu-bdl)-/.test(profile.baseSampleId);
    assert.equal(profile.renderMode === 'script-renderable', hasPack, profile.id);
  }
});

test('checked-in original source hashes detect a changed import without rendering from it', async () => {
  for (const sample of NATURAL_HUMAN_SAMPLES) {
    const bytes = await readFile(new URL(`../public${sample.url}`, import.meta.url));
    const actual = createHash('sha256').update(bytes).digest('hex');
    assert.equal(actual, ORIGINAL_SOURCE_SHA256[sample.id], sample.id);
  }
});

test('checked-in CMU voice-pack imports remain byte-identical', async () => {
  for (const [relativePath, expected] of Object.entries(ORIGINAL_VOICE_PACK_SHA256)) {
    const bytes = await readFile(new URL(`../public/voicepacks/${relativePath}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, relativePath);
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

test('source-clip-only variants cannot be turned into arbitrary-text render requests', () => {
  const variant = {
    ...original, id: 'source-clip-variant', isCustom: true, sourceType: 'derived' as const,
    parentVoiceDefinitionId: original.id, recipeId: 'derived-local-v2:source-clip', reviewState: 'approved' as const,
    isLockedOriginal: false, renderMode: 'source-clip-only' as const,
  };
  const request = createVoiceRenderRequest(variant, 'A different script', { environmentId: 'dry-reference', purpose: 'audition' });
  assert.throws(() => assertVoiceRenderEligibility(variant, request), /finite derived version|cannot be used to render/i);
});

test('derived DSP keeps pitch and duration controls separate', () => {
  const source = Float32Array.from({ length: 1600 }, (_, index) => Math.sin(2 * Math.PI * index / 45));
  const paced = transformPitchAndRate(source, 1, 0.8);
  const pitchedAndPaced = transformPitchAndRate(source, 1.35, 0.8);
  assert.equal(paced.length, Math.floor(source.length / 0.8));
  assert.equal(pitchedAndPaced.length, paced.length, 'pitch must not change target duration');
  assert.notDeepEqual([...pitchedAndPaced.slice(0, 400)], [...paced.slice(0, 400)], 'pitch must alter samples at the same pace');
});

test('voiced-only pitch transform preserves unvoiced/silent regions and clip duration', () => {
  const sampleRate = 16_000;
  const input = new Float32Array(sampleRate);
  for (let index = 4_000; index < 12_000; index++) input[index] = 0.2 * Math.sin(2 * Math.PI * 160 * index / sampleRate);
  const shifted = transformVoicedPitch(input, sampleRate, 1.2);
  assert.equal(shifted.length, input.length);
  assert.deepEqual([...shifted.slice(0, 3_000)], [...input.slice(0, 3_000)]);
  assert.notDeepEqual([...shifted.slice(5_000, 7_000)], [...input.slice(5_000, 7_000)]);
});

test('bounded spectral-envelope warp creates a separate resonance transform without changing length', () => {
  const source = Float32Array.from({ length: 4096 }, (_, index) => 0.18 * Math.sin(2 * Math.PI * index / 51) + 0.08 * Math.sin(2 * Math.PI * index / 19));
  const unchanged = warpSpectralEnvelope(source, 1);
  const shifted = warpSpectralEnvelope(source, 1.12);
  assert.equal(shifted.length, source.length);
  assert.deepEqual([...unchanged], [...source]);
  assert.notDeepEqual([...shifted.slice(700, 1500)], [...source.slice(700, 1500)]);
});

test('variant DSP applies finite headroom protection and click-safe clip edges', () => {
  const stressed = Float32Array.from({ length: 4_800 }, (_, index) => index % 17 === 0 ? 1.8 : Math.sin(index / 7) * 1.25);
  const protectedPcm = stabilizeDspPcm(stressed, 16_000);
  assert.ok(protectedPcm.every(Number.isFinite));
  assert.ok(Math.max(...protectedPcm.map(Math.abs)) <= 0.93);
  assert.ok(Math.abs(protectedPcm[0]) < 1e-6);
  assert.ok(Math.abs(protectedPcm[protectedPcm.length - 1]) < 1e-6);
});

test('analysis exposes real voiced-frame F0, envelope and objective quality guardrails', () => {
  const sampleRate = 16_000;
  const voiced = Float32Array.from({ length: sampleRate }, (_, index) => 0.2 * Math.sin(2 * Math.PI * 160 * index / sampleRate));
  const analysis = analysePcm(voiced, sampleRate);
  assert.ok(analysis.voicedFrameRatio > 0.8);
  assert.ok((analysis.medianF0Hz || 0) > 145 && (analysis.medianF0Hz || 0) < 175);
  const quality = inspectPcmQuality(voiced, sampleRate);
  assert.equal(quality.clippingSamples, 0);
  assert.ok(quality.peakDbfs < -10);
});

test('AI creation requires an exact consented source hash before a job can exist', () => {
  const source: VoiceAsset = {
    id: 'source-1', role: 'original', profileId: original.id, sourceHash: 'a'.repeat(64), audioHash: 'a'.repeat(64),
    createdAt: '2026-11-18T00:00:00.000Z', reviewState: 'locked', immutableOriginal: true, disclosure: 'source only',
  };
  const consent = {
    id: 'consent-1', sourceAssetId: 'source-1', sourceHash: 'a'.repeat(64), speakerOrRightsHolder: 'Test holder',
    releaseScope: 'own-voice' as const, permitsAiDerivedAudio: true as const, permitsFreeLibraryDistribution: true as const,
    evidenceNote: 'Test consent record', retentionEndsAt: '2099-01-01T00:00:00.000Z', revocable: true, confirmedAt: '2026-11-18T00:00:00.000Z',
  };
  assert.doesNotThrow(() => validateAiCreationEligibility(source, consent));
  assert.throws(() => validateAiCreationEligibility(source, { ...consent, sourceHash: 'b'.repeat(64) }), /exact source asset hash/);
  assert.throws(() => validateAiCreationEligibility(source, revokeAiConsent(consent, 'Rights holder withdrew permission')), /revoked/);
});

test('free-library publication verifies review, hashes, notices and immutable provenance', () => {
  const asset: VoiceAsset = {
    id: 'derived-publishable', role: 'dsp-variant', profileId: original.id, parentAssetId: 'original-source-cmu-slt-1',
    sourceId: 'cmu-slt-1', sourceHash: 'a'.repeat(64), audioHash: 'b'.repeat(64), takeId: 'take-1',
    createdAt: '2026-11-18T00:00:00.000Z', reviewState: 'approved', immutableOriginal: false,
    review: { status: 'approved', ratings: { intelligibility: 5, naturalness: 4, artifactFree: 4, toneBodyFit: 4, pitchStability: 4, loudness: 4, suitability: 4 } },
    disclosure: 'Derived source-clip WAV.', attribution: 'Example attribution', license: 'Example licence', licenceNotices: ['Example licence'],
    supportedUse: 'Finite clip only.',
    sourceVariantManifest: {
      contractVersion: 'source-clip-variant/v1', createdAt: '2026-11-18T00:00:00.000Z', parentSourceId: 'cmu-slt-1', parentSourceHash: 'a'.repeat(64),
      engine: 'bounded-local-dsp', engineVersion: 'spectral-envelope-warp-v1', parameters: { pitch: 1 }, outputHash: 'b'.repeat(64), outputFormat: 'wav',
      quality: { peakDbfs: -2, rmsDbfs: -18, clippingSamples: 0, durationSeconds: 2, warnings: [] }, disclosure: 'Derived source-clip WAV.',
    },
  };
  assert.equal(createFreeLibraryManifest(asset).outputHash, asset.audioHash);
  assert.throws(() => createFreeLibraryManifest({ ...asset, role: 'original', immutableOriginal: true }), /Protected original/);
  assert.throws(() => createFreeLibraryManifest({ ...asset, licenceNotices: [] }), /licence notices/);
  assert.throws(() => createFreeLibraryManifest({ ...asset, sourceVariantManifest: { ...asset.sourceVariantManifest!, outputHash: 'c'.repeat(64) } }), /does not match/);
});

test('blind listening trials randomize A/B labels and reject invalid rating responses', () => {
  const asset: VoiceAsset = {
    id: 'candidate-a', role: 'dsp-variant', profileId: original.id, sourceHash: 'a'.repeat(64), audioHash: 'b'.repeat(64), takeId: 'take-a',
    createdAt: '2026-11-18T00:00:00.000Z', reviewState: 'candidate', immutableOriginal: false, disclosure: 'derived',
  };
  const trial = createBlindListeningTrial(asset, 'test-nonce', '2026-11-18T00:00:00.000Z');
  assert.notEqual(trial.hiddenMapping.A, trial.hiddenMapping.B);
  const ratings = { intelligibility: 4, naturalness: 4, artifactFree: 4, toneBodyFit: 4, pitchStability: 4, loudness: 4, suitability: 4 };
  assert.doesNotThrow(() => validateBlindListeningResponse(trial, { trialId: trial.id, preferredLabel: 'A', ratings, completedAt: '2026-11-18T00:01:00.000Z' }));
  assert.throws(() => validateBlindListeningResponse(trial, { trialId: trial.id, preferredLabel: 'B', ratings: { ...ratings, naturalness: 3.5 }, completedAt: '2026-11-18T00:01:00.000Z' }), /whole number/);
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
