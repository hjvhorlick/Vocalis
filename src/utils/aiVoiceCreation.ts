import type { VoiceAsset } from '../types/voiceAsset';
import { sha256Hex } from './voiceRenderContract';

export type AiConsentRecord = Readonly<{
  id: string;
  sourceAssetId: string;
  sourceHash: string;
  speakerOrRightsHolder: string;
  releaseScope: 'own-voice' | 'contributor-release' | 'reviewed-package-license';
  permitsAiDerivedAudio: true;
  permitsFreeLibraryDistribution: true;
  retentionEndsAt: string;
  revocable: boolean;
  confirmedAt: string;
}>;

export type AiVoiceCreationJob = Readonly<{
  id: string;
  requestedAt: string;
  sourceAssetId: string;
  sourceHash: string;
  text: string;
  provider: string;
  modelVersion: string;
  intendedUse: string;
  retentionEndsAt: string;
  disclosure: 'AI-created candidate file — requires listening review; never replaces the source.';
  state: 'awaiting-explicit-confirmation';
}>;

export function validateAiCreationEligibility(source: VoiceAsset, consent: AiConsentRecord): void {
  if (source.reviewState === 'deleted') throw new Error('A deleted source cannot be used for an AI creation request.');
  if (!source.sourceHash || source.sourceHash !== consent.sourceHash || source.id !== consent.sourceAssetId) {
    throw new Error('AI creation requires a consent record tied to the exact source asset hash.');
  }
  if (!consent.permitsAiDerivedAudio || !consent.permitsFreeLibraryDistribution) {
    throw new Error('The recorded consent/release does not permit this AI-derived free-library use.');
  }
  if (Date.parse(consent.retentionEndsAt) <= Date.now()) throw new Error('The consent retention period has ended; renew consent before continuing.');
}

/** Creates a reviewable intent only; this local build performs no provider/network AI call. */
export async function prepareAiVoiceCreationJob(
  source: VoiceAsset,
  consent: AiConsentRecord,
  details: { text: string; provider: string; modelVersion: string; intendedUse: string },
): Promise<AiVoiceCreationJob> {
  validateAiCreationEligibility(source, consent);
  if (!details.text.trim()) throw new Error('Enter the requested script before preparing an AI creation job.');
  if (!details.provider.trim() || !details.modelVersion.trim()) throw new Error('Name the reviewed provider and model version before preparing an AI creation job.');
  const fingerprint = await sha256Hex(`${source.id}:${consent.id}:${details.text}:${details.provider}:${details.modelVersion}`);
  return Object.freeze({
    id: `ai-intent-${fingerprint.slice(0, 16)}`,
    requestedAt: new Date().toISOString(),
    sourceAssetId: source.id,
    sourceHash: source.sourceHash!,
    text: details.text.trim(),
    provider: details.provider.trim(),
    modelVersion: details.modelVersion.trim(),
    intendedUse: details.intendedUse.trim() || 'Unspecified',
    retentionEndsAt: consent.retentionEndsAt,
    disclosure: 'AI-created candidate file — requires listening review; never replaces the source.',
    state: 'awaiting-explicit-confirmation',
  });
}

/**
 * Intentionally closed boundary: a server-side provider adapter, privacy review,
 * deletion/revocation handling and abuse controls must be installed before this
 * can submit. It protects the app from silently falling back to cloud/neural TTS.
 */
export async function submitAiVoiceCreationJob(_job: AiVoiceCreationJob, explicitConfirmation: boolean): Promise<never> {
  if (!explicitConfirmation) throw new Error('Explicit confirmation is required before any AI voice creation job.');
  throw new Error('AI voice-file creation is not enabled in this local build. No audio or consent data was sent to a provider.');
}
