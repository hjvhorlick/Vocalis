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
