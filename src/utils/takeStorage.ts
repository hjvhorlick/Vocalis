import type { GeneratedTake } from '../types/voice';

type StoredTake = Omit<GeneratedTake, 'audioUrl'> & { audio: Blob };
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('vocalis-audio-vault', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('takes', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('takes', mode), request = action(tx.objectStore('takes'));
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Audio vault storage is unavailable.')); };
    } catch (error) { db.close(); reject(error); }
  });
}
export function readStoredTakes(): Promise<StoredTake[]> { return transaction('readonly', store => store.getAll()); }
export async function storeTake(take: GeneratedTake): Promise<void> {
  const response = await fetch(take.audioUrl);
  if (!response.ok) throw new Error('The rendered take is no longer available. Render it again.');
  const audio = await response.blob();
  const { audioUrl: _url, ...metadata } = take;
  await transaction('readwrite', store => store.put({ ...metadata, audio }));
}
export async function removeStoredTake(id: string): Promise<void> { await transaction('readwrite', store => store.delete(id)); }
