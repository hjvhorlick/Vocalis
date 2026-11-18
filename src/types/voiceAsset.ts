import type { VoiceRenderManifest } from '../utils/voiceRenderContract';

export type VoiceAssetRole = 'original' | 'dsp-variant' | 'ai-created-file' | 'recorded-unit-bank';
export type VoiceAssetReviewState = 'locked' | 'candidate' | 'approved' | 'rejected' | 'deleted';

/** Metadata is stored separately from a profile so an original import is never overwritten by a render. */
export interface VoiceAsset {
  id: string;
  role: VoiceAssetRole;
  profileId: string;
  parentAssetId?: string;
  sourceId?: string;
  audioHash: string;
  sourceHash?: string;
  createdAt: string;
  reviewState: VoiceAssetReviewState;
  immutableOriginal: boolean;
  disclosure: string;
  attribution?: string;
  license?: string;
  consentRecordId?: string;
  rendererManifest?: VoiceRenderManifest;
}
