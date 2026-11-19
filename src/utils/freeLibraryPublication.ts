import type { VoiceAsset } from '../types/voiceAsset';

export const FREE_LIBRARY_MANIFEST_VERSION = 'vocalis-free-library/v1';

export type FreeLibraryManifest = Readonly<{
  manifestVersion: typeof FREE_LIBRARY_MANIFEST_VERSION;
  exportedAt: string;
  assetId: string;
  role: Exclude<VoiceAsset['role'], 'original'>;
  parentAssetId?: string;
  profileId: string;
  sourceId?: string;
  sourceHash: string;
  outputHash: string;
  review: NonNullable<VoiceAsset['review']>;
  disclosure: string;
  attribution: string;
  licenceNotices: string[];
  supportedUse: string;
  creation: NonNullable<VoiceAsset['rendererManifest'] | VoiceAsset['sourceVariantManifest']>;
}>;

/** Blocks a public export that cannot be traced to rights/provenance records. */
export function createFreeLibraryManifest(asset: VoiceAsset): FreeLibraryManifest {
  if (asset.role === 'original' || asset.immutableOriginal) throw new Error('Protected original imports are never free-library publication files.');
  if (asset.reviewState !== 'approved' || asset.review?.status !== 'approved') throw new Error('Only listener-approved candidates can be prepared for the free library.');
  if (!asset.sourceHash || !/^[a-f0-9]{64}$/i.test(asset.sourceHash)) throw new Error('Publication requires the protected parent/source SHA-256 hash.');
  if (!/^[a-f0-9]{64}$/i.test(asset.audioHash)) throw new Error('Publication requires the derived output SHA-256 hash.');
  if (!asset.attribution?.trim() || !asset.licenceNotices?.length || !asset.supportedUse?.trim() || !asset.disclosure?.trim()) {
    throw new Error('Publication requires attribution, licence notices, supported-use scope and a derived/AI disclosure.');
  }
  const creation = asset.sourceVariantManifest || asset.rendererManifest;
  if (!creation) throw new Error('Publication requires a versioned creation manifest.');
  if (asset.sourceVariantManifest && (asset.sourceVariantManifest.parentSourceHash !== asset.sourceHash || asset.sourceVariantManifest.outputHash !== asset.audioHash)) {
    throw new Error('The source-clip variant manifest does not match the asset hashes.');
  }
  if (asset.rendererManifest && asset.rendererManifest.outputHash !== asset.audioHash) {
    throw new Error('The render manifest output hash does not match the asset record.');
  }
  if (asset.role === 'ai-created-file' && !asset.consentRecordId) throw new Error('AI-created audio requires a source-bound consent record ID before publication.');
  return Object.freeze({
    manifestVersion: FREE_LIBRARY_MANIFEST_VERSION,
    exportedAt: new Date().toISOString(),
    assetId: asset.id,
    role: asset.role,
    parentAssetId: asset.parentAssetId,
    profileId: asset.profileId,
    sourceId: asset.sourceId,
    sourceHash: asset.sourceHash,
    outputHash: asset.audioHash,
    review: asset.review,
    disclosure: asset.disclosure,
    attribution: asset.attribution,
    licenceNotices: asset.licenceNotices,
    supportedUse: asset.supportedUse,
    creation,
  });
}
