import type { VoiceModelConfig } from './naturalVoiceEngine';
import { NATURAL_HUMAN_SAMPLES } from './naturalHumanAudio';
import { ORIGINAL_SOURCE_SHA256 } from './originalSourceHashes';

export type OriginalSourceRecord = Readonly<{
  sourceId: string;
  sourceUrl: string;
  speaker: string;
  attribution: string;
  license: string;
  transcript: string;
  importKind: 'original-recording';
  /** Checked-in import timestamp from the original source-library commit. */
  importedAt: string;
  /** AI use is deny-by-default until a rights/performance review creates an allowlist record. */
  aiCreationStatus: 'not-reviewed' | 'eligible';
  immutable: true;
}>;

/**
 * The source inventory contains metadata only. No operation in this module
 * produces, rewrites, or replaces an original audio blob. Original playback
 * remains in auditionSourceRecording; text output is always a separate render.
 */
export function originalSourceRecord(sourceId: string | undefined): OriginalSourceRecord | undefined {
  if (!sourceId || sourceId === 'custom-user') return undefined;
  const sample = NATURAL_HUMAN_SAMPLES.find(item => item.id === sourceId);
  if (!sample) return undefined;
  return Object.freeze({
    sourceId: sample.id,
    sourceUrl: sample.url,
    speaker: sample.speaker,
    attribution: sample.attribution,
    license: sample.license,
    transcript: sample.transcript,
    importKind: 'original-recording' as const,
    importedAt: '2026-11-09T05:57:49.000Z',
    aiCreationStatus: 'not-reviewed' as const,
    immutable: true as const,
  });
}

export async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

/** Hash only the protected, source-only import selected by the profile. */
export function originalSourceHash(profile: VoiceModelConfig): string | undefined {
  if (profile.originalSourceHash) return profile.originalSourceHash;
  const record = originalSourceRecord(profile.sourceId || profile.baseSampleId);
  return record ? ORIGINAL_SOURCE_SHA256[record.sourceId] : undefined;
}

/**
 * Fetches an original only to verify and deliver its exact bytes. The returned
 * blob is never decoded or passed through any DSP graph.
 */
export async function verifiedOriginalSourceBlob(profile: VoiceModelConfig): Promise<{ blob: Blob; filename: string; hash: string }> {
  const record = originalSourceRecord(profile.sourceId || profile.baseSampleId);
  const expectedHash = originalSourceHash(profile);
  if (!record || !expectedHash) throw new Error('This profile has no verified original-source record.');
  const response = await fetch(record.sourceUrl, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not read original source ${record.sourceId} for verification.`);
  const blob = await response.blob();
  const actualHash = await sha256Blob(blob);
  if (actualHash !== expectedHash) throw new Error('Original source verification failed. Download is blocked because its SHA-256 digest does not match the protected import record.');
  return { blob, filename: record.sourceUrl.split('/').at(-1) || `${record.sourceId}.wav`, hash: actualHash };
}

export async function downloadVerifiedOriginalSource(profile: VoiceModelConfig): Promise<void> {
  const { blob, filename } = await verifiedOriginalSourceBlob(profile);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function immutableOriginalProfile(profile: VoiceModelConfig): boolean {
  return profile.sourceType === 'original' || profile.isLockedOriginal === true;
}

/**
 * Prevent a caller from repurposing an original record as a mutable custom item.
 * This is intentionally a pure check so it can be used at the UI/storage edge.
 */
export function assertCanPersistVoiceDefinition(profile: VoiceModelConfig): void {
  if (immutableOriginalProfile(profile)) {
    throw new Error('Original library definitions are read-only. Create a separate derived candidate instead.');
  }
  if (profile.sourceType === 'ai-created') {
    throw new Error('AI-created voice definitions require the consent-gated creation workflow; this local profile editor cannot create them.');
  }
}
