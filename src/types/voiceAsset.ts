import type { VoiceRenderManifest } from '../utils/voiceRenderContract';

export type VoiceAssetRole = 'original' | 'dsp-variant' | 'ai-created-file' | 'recorded-unit-bank';
export type VoiceAssetReviewState = 'locked' | 'candidate' | 'approved' | 'rejected' | 'deleted';

export type VoiceQualityRating = {
  intelligibility: number;
  naturalness: number;
  artifactFree: number;
  toneBodyFit: number;
  pitchStability: number;
  loudness: number;
  suitability: number;
};

export type VoiceAssetReview = {
  status: VoiceAssetReviewState;
  ratings?: VoiceQualityRating;
  notes?: string;
  reviewedAt?: string;
};

export type SourceVariantManifest = {
  contractVersion: 'source-clip-variant/v1';
  createdAt: string;
  parentSourceId: string;
  parentSourceHash: string;
  engine: 'bounded-local-dsp';
  engineVersion: 'spectral-envelope-warp-v1';
  parameters: Record<string, number | string | boolean>;
  outputHash: string;
  outputFormat: 'wav';
  quality: VoiceQualityReport;
  disclosure: string;
};

export type VoiceQualityReport = {
  peakDbfs: number;
  rmsDbfs: number;
  clippingSamples: number;
  durationSeconds: number;
  voicedFrameRatio?: number;
  discontinuityScore?: number;
  warnings: string[];
};

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
  /** Logical link to separately stored audio in the take vault, never an original blob. */
  takeId?: string;
  sampleRate?: number;
  bitDepth?: 16 | 24 | 32;
  reviewState: VoiceAssetReviewState;
  review?: VoiceAssetReview;
  immutableOriginal: boolean;
  disclosure: string;
  attribution?: string;
  license?: string;
  licenceNotices?: string[];
  supportedUse?: string;
  consentRecordId?: string;
  quality?: VoiceQualityReport;
  rendererManifest?: VoiceRenderManifest;
  sourceVariantManifest?: SourceVariantManifest;
}
