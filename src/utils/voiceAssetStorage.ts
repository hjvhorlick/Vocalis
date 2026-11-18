import type { VoiceAsset } from '../types/voiceAsset';
import type { VoiceModelConfig } from './naturalVoiceEngine';
import { originalSourceHash, originalSourceRecord } from './voiceProvenance';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('vocalis-voice-assets', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('assets')) request.result.createObjectStore('assets', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('assets', mode);
      const request = action(tx.objectStore('assets'));
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Voice asset storage is unavailable.')); };
    } catch (error) { db.close(); reject(error); }
  });
}

/** Original import records are immutable source metadata, not a writable audio vault. */
export function registerOriginalAsset(asset: VoiceAsset): Promise<void> {
  if (asset.role !== 'original' || !asset.immutableOriginal || asset.reviewState !== 'locked') {
    return Promise.reject(new Error('An original asset must be registered as a locked immutable source record.'));
  }
  return transact('readwrite', store => store.add(Object.freeze({ ...asset }))).then(() => undefined);
}

/** Seed local metadata for originals once; it never copies, stores, or rewrites their audio. */
export async function ensureOriginalAssetRecords(profiles: readonly VoiceModelConfig[]): Promise<void> {
  const seen = new Set<string>();
  for (const profile of profiles) {
    if (profile.sourceType !== 'original') continue;
    const source = originalSourceRecord(profile.sourceId || profile.baseSampleId);
    const sourceHash = originalSourceHash(profile);
    if (!source || !sourceHash || seen.has(source.sourceId)) continue;
    seen.add(source.sourceId);
    const id = `original-source-${source.sourceId}`;
    const existing = await transact<VoiceAsset | undefined>('readonly', store => store.get(id));
    if (existing) continue;
    await registerOriginalAsset({
      id, role: 'original', profileId: profile.id, sourceId: source.sourceId,
      audioHash: sourceHash, sourceHash, createdAt: new Date().toISOString(),
      reviewState: 'locked', immutableOriginal: true,
      disclosure: 'Immutable original import; source-only audition and provenance reference.',
      attribution: source.attribution, license: source.license,
    });
  }
}

/** Derived/AI candidate assets can be saved without ever replacing an original record. */
export async function saveDerivedAsset(asset: VoiceAsset): Promise<void> {
  if (asset.immutableOriginal || asset.role === 'original') throw new Error('Use the immutable original register for source records.');
  await transact('readwrite', store => store.put({ ...asset }));
}

export function readVoiceAssets(): Promise<VoiceAsset[]> {
  return transact('readonly', store => store.getAll());
}

export async function updateVoiceAssetReview(id: string, reviewState: Exclude<VoiceAsset['reviewState'], 'locked'>): Promise<void> {
  const asset = await transact<VoiceAsset | undefined>('readonly', store => store.get(id));
  if (!asset) throw new Error('The voice asset is no longer in local storage.');
  if (asset.immutableOriginal || asset.reviewState === 'locked') throw new Error('Original source records cannot be reviewed into a mutable state.');
  await saveDerivedAsset({ ...asset, reviewState });
}
