import type { VoiceAsset, VoiceQualityRating } from '../types/voiceAsset';

export type BlindListeningTrial = Readonly<{
  version: 'vocalis-blind-listening/v1';
  id: string;
  assetId: string;
  parentSourceHash: string;
  variantOutputHash: string;
  /** Randomised label mapping kept with the trial, never shown in the review UI. */
  hiddenMapping: Readonly<{ A: 'original' | 'variant'; B: 'original' | 'variant' }>;
  createdAt: string;
}>;

export type BlindListeningResponse = Readonly<{
  trialId: string;
  preferredLabel: 'A' | 'B' | 'no-preference';
  ratings: VoiceQualityRating;
  notes?: string;
  completedAt: string;
}>;

function stableParity(input: string): number {
  let hash = 2166136261;
  for (const character of input) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

/**
 * Builds a reproducible blind A/B trial from a candidate. `hiddenMapping` is for
 * export/audit only and should not be exposed until a listener has responded.
 */
export function createBlindListeningTrial(asset: VoiceAsset, nonce: string, createdAt = new Date().toISOString()): BlindListeningTrial {
  if (!asset.sourceHash || !asset.audioHash || !asset.takeId) throw new Error('Blind A/B trials require a source hash, output hash and linked candidate WAV.');
  if (asset.reviewState !== 'candidate' && asset.reviewState !== 'approved') throw new Error('Only reviewable candidate files can enter a blind listening test.');
  const id = `blind-${asset.id}-${stableParity(`${asset.sourceHash}:${asset.audioHash}:${nonce}`).toString(16)}`;
  const originalFirst = stableParity(`${id}:${nonce}`) % 2 === 0;
  const hiddenMapping: BlindListeningTrial['hiddenMapping'] = originalFirst ? { A: 'original', B: 'variant' } : { A: 'variant', B: 'original' };
  return Object.freeze({
    version: 'vocalis-blind-listening/v1', id, assetId: asset.id,
    parentSourceHash: asset.sourceHash, variantOutputHash: asset.audioHash,
    hiddenMapping,
    createdAt,
  });
}

export function validateBlindListeningResponse(trial: BlindListeningTrial, response: BlindListeningResponse): void {
  if (response.trialId !== trial.id) throw new Error('The listening response does not belong to this trial.');
  for (const [dimension, value] of Object.entries(response.ratings)) {
    if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error(`Blind-listening rating ${dimension} must be a whole number from 1 to 5.`);
  }
  if (!response.completedAt || Number.isNaN(Date.parse(response.completedAt))) throw new Error('A blind-listening response needs a completion timestamp.');
}
