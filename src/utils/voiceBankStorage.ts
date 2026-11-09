import type { VoiceBank } from '../types/voiceBank';
import type { VoiceModelConfig } from './naturalVoiceEngine';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('vocalis-sound-banks', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('banks', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function saveVoiceBank(bank: VoiceBank): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('banks', 'readwrite');
      transaction.objectStore('banks').put(bank);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = transaction.onerror = () => { db.close(); reject(transaction.error || new Error('Voice storage is unavailable. Export the bank instead.')); };
    } catch (error) { db.close(); reject(error); }
  });
}

export async function loadVoiceBank(id: string): Promise<VoiceBank> {
  const db = await open();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('banks', 'readonly');
      const request = transaction.objectStore('banks').get(id);
      transaction.oncomplete = () => { db.close(); request.result ? resolve(request.result) : reject(new Error('This sound bank is not on this device. Import its .vvoice file and add it to the library again.')); };
      transaction.onabort = transaction.onerror = () => { db.close(); reject(transaction.error); };
    } catch (error) { db.close(); reject(error); }
  });
}

export function voiceModelForBank(bank: VoiceBank): VoiceModelConfig {
  return {
    id: `unit-${bank.id}`, name: bank.name, archetype: 'Your recorded sound bank',
    description: 'Experimental non-neural speech assembled from your manually labelled recordings. Incomplete coverage blocks rendering; no substitute speaker is used.',
    gender: 'Neutral', accent: 'Global', flag: '🎙️', pitch: 1, rate: 1, volume: 1,
    toneStyle: 'natural', samplePhrase: bank.exampleText || 'Hello.', avatarColor: '#b08945',
    isCustom: true, baseSampleId: 'user-sound-bank', unitVoiceId: bank.id,
    synthesisMethod: 'recorded-units', realSpeakerName: bank.name,
  };
}

export async function deleteVoiceBank(id: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('banks', 'readwrite');
      transaction.objectStore('banks').delete(id);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = transaction.onerror = () => { db.close(); reject(transaction.error); };
    } catch (error) { db.close(); reject(error); }
  });
}
