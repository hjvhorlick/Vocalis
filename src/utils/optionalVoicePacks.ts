/**
 * Optional voice packs — the additive half of the voice library.
 *
 * The two protected base voices (CMU ARCTIC SLT and BDL) are compiled into the
 * application and loaded from `public/voicepacks/cmu-arctic/`. Every other voice
 * a user installs is a *separate* pack on disk, and this module is the only place
 * that knows how to find one.
 *
 * A pack source is deliberately dumb: it hands back a manifest and the raw PCM
 * bytes. Everything about units, joins and quality lives in
 * `cmuDiphoneSynthesizer.ts`, so an optional voice goes through exactly the same
 * assembly and the same transformation stage as a base voice. There is no second
 * synthesis path, and nothing here can alter the base voice: the protected ids are
 * refused by `isBaseVoiceId`.
 *
 * Original Vocalis code.
 */

import { VOCALIS_EXTENSION, decodeVocalisVoice } from './vocalisVoiceFile';

/** One audio slice in the pack, byte offset into the PCM file and length in samples. */
export interface OptionalVoiceUnit {
  offset: number;
  length: number;
}

export interface OptionalVoiceManifest {
  format?: string;
  speakerId?: string;
  displayName?: string;
  gender?: string;
  accent?: string;
  language?: string;
  sampleRate?: number;
  unitCount?: number;
  units: Record<string, OptionalVoiceUnit>;
}

export interface OptionalVoicePackData {
  manifest: OptionalVoiceManifest;
  /** Little-endian signed 16-bit mono PCM, the same layout the base packs use. */
  audio: ArrayBuffer;
}

export interface OptionalVoiceSource {
  id: string;
  displayName: string;
  /** Load the pack bytes. Called at most once per loaded voice by the engine. */
  loadPack(): Promise<OptionalVoicePackData>;
}

/** The ids that are compiled in and may never be replaced by an optional pack. */
export const BASE_VOICE_IDS = ['slt', 'bdl'] as const;

export type BaseVoiceId = (typeof BASE_VOICE_IDS)[number];

export function isBaseVoiceId(candidate: string): candidate is BaseVoiceId {
  return (BASE_VOICE_IDS as readonly string[]).includes(candidate);
}

const sources = new Map<string, OptionalVoiceSource>();

/**
 * Register one installed optional voice. Registering an id again replaces the
 * source and needs the engine's cache dropped first (see `releaseVoicePack` in
 * `cmuDiphoneSynthesizer.ts`), which the library does on reinstall.
 */
export function registerOptionalVoiceSource(source: OptionalVoiceSource): void {
  const id = source.id.trim();
  if (!id) throw new Error('An optional voice needs an id.');
  if (isBaseVoiceId(id)) {
    throw new Error(
      `Refusing to register "${id}" as an optional voice: it is a protected base voice.`,
    );
  }
  sources.set(id, { ...source, id });
}

export function unregisterOptionalVoiceSource(id: string): void {
  sources.delete(id);
}

export function getOptionalVoiceSource(id: string): OptionalVoiceSource | undefined {
  return sources.get(id);
}

export function listOptionalVoiceSources(): OptionalVoiceSource[] {
  return [...sources.values()];
}

export function clearOptionalVoiceSources(): void {
  sources.clear();
}

/**
 * A source backed by the local server's `/optional-voices/<id>/` directory, which
 * is where an installed pack lives. The same-origin fetch keeps the application
 * working with no network service involved once a voice is installed.
 */
export function httpOptionalVoiceSource(id: string, displayName: string): OptionalVoiceSource {
  return {
    id,
    displayName,
    async loadPack() {
      const root = `/optional-voices/${encodeURIComponent(id)}`;
      // A sealed voice is a single file and is tried first: once a pack has been
      // imported or exported as `.vocalis` there is no manifest.json beside it.
      const sealedResponse = await fetch(`${root}/voice.${VOCALIS_EXTENSION}`, { cache: 'no-cache' });
      if (sealedResponse.ok) {
        const opened = await decodeVocalisVoice(await sealedResponse.arrayBuffer());
        if (!opened.manifest.units || !Object.keys(opened.manifest.units).length) {
          throw new Error(`The installed voice "${displayName}" has no unit index.`);
        }
        return { manifest: opened.manifest as unknown as OptionalVoiceManifest, audio: opened.audio };
      }
      const [manifestResponse, audioResponse] = await Promise.all([
        fetch(`${root}/manifest.json`),
        fetch(`${root}/diphones.bin`),
      ]);
      if (!manifestResponse.ok || !audioResponse.ok) {
        throw new Error(`Could not load the installed voice "${displayName}".`);
      }
      const manifest = (await manifestResponse.json()) as OptionalVoiceManifest;
      if (!manifest.units || !Object.keys(manifest.units).length) {
        throw new Error(`The installed voice "${displayName}" has no unit index.`);
      }
      return { manifest, audio: await audioResponse.arrayBuffer() };
    },
  };
}
