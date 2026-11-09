// English ARPABET inventory. Stress is currently ignored by the experimental unit selector.
export const PHONE_EXAMPLES: Record<string, string> = {
  AA: 'father', AE: 'cat', AH: 'cup', AO: 'thought', AW: 'mouth', AY: 'my',
  B: 'book', CH: 'chair', D: 'day', DH: 'this', EH: 'bed', ER: 'bird', EY: 'day',
  F: 'fish', G: 'go', HH: 'hat', IH: 'sit', IY: 'see', JH: 'judge', K: 'cat',
  L: 'light', M: 'moon', N: 'night', NG: 'sing', OW: 'boat', OY: 'boy',
  P: 'pen', R: 'red', S: 'sun', SH: 'ship', T: 'tea', TH: 'thin', UH: 'book',
  UW: 'blue', V: 'voice', W: 'we', Y: 'yes', Z: 'zoo', ZH: 'measure',
};
export const PHONES = Object.keys(PHONE_EXAMPLES).sort();
export const validPhone = (phone: unknown): phone is string => typeof phone === 'string' && Object.hasOwn(PHONE_EXAMPLES, phone);
export type Pronunciations = Record<string, string[]>;
export type PronouncedWord = { text: string; start: number; end: number; phones: string[]; pause: number };

export function parsePhones(text: string, allowSilence = false): string[] {
  const phones = text.trim().toUpperCase().split(/\s+/).filter(Boolean).map(phone => phone.replace(/[012]$/, ''));
  if (!phones.length || phones.length > 300 || phones.some(phone => !validPhone(phone) && !(allowSilence && phone === 'SIL'))) {
    throw new Error('Use space-separated English sound labels, such as HH EH L OW. Use SIL only to mark silence in a recording.');
  }
  return phones;
}

export function validatePronunciations(value: unknown): Pronunciations {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 500) throw new Error('Invalid pronunciation dictionary.');
  return Object.fromEntries(Object.entries(value).map(([word, phones]) => {
    if (!/^[a-z]+(?:'[a-z]+)*$/.test(word) || word.length > 80 || !Array.isArray(phones) || !phones.length || phones.length > 60 || !phones.every(validPhone)) throw new Error('Invalid pronunciation entry.');
    return [word, [...phones]];
  }));
}

let dictionaryRequest: Promise<Map<string, string[]>> | null = null;
export function loadVoiceDictionary(): Promise<Map<string, string[]>> {
  if (!dictionaryRequest) dictionaryRequest = (async () => {
    const response = await fetch('/cmudict.txt');
    if (!response.ok) throw new Error('The local pronunciation dictionary could not be loaded. Check that public/cmudict.txt is deployed.');
    const dictionary = new Map<string, string[]>();
    for (const row of (await response.text()).split('\n')) {
      const [word, raw] = row.split('|');
      if (!word || !raw || dictionary.has(word)) continue;
      const phones = raw.split('#')[0].trim().split(/\s+/).map(phone => phone.replace(/[012]$/, ''));
      if (phones.length && phones.every(validPhone)) dictionary.set(word, phones);
    }
    if (!dictionary.size) throw new Error('The local pronunciation dictionary is empty.');
    return dictionary;
  })().catch(error => { dictionaryRequest = null; throw error; });
  return dictionaryRequest;
}

export function planWords(text: string, dictionary: Map<string, string[]>, overrides: Pronunciations = {}): { words: PronouncedWord[]; unknown: string[] } {
  if (!text.trim() || text.length > 1000) throw new Error('Enter between 1 and 1,000 characters.');
  // Explicitly reject unsupported tokens rather than silently drop numbers or foreign letters.
  if (/[^a-zA-Z'’\s.,!?;:\-()"“”]/.test(text)) throw new Error('This experimental bank uses English words. Spell out numbers and symbols, and remove unsupported characters.');
  const matches = [...text.matchAll(/[a-zA-Z]+(?:['’][a-zA-Z]+)*/g)];
  const unknown = new Set<string>();
  const words = matches.map((match, i): PronouncedWord => {
    const word = match[0].toLowerCase().replace(/’/g, "'");
    const phones = Object.hasOwn(overrides, word) ? overrides[word] : dictionary.get(word);
    if (!phones) unknown.add(word);
    const start = match.index!;
    const end = start + match[0].length;
    const punctuation = text.slice(end, matches[i + 1]?.index ?? text.length);
    return { text: match[0], start, end, phones: phones || [], pause: /[.!?]/.test(punctuation) ? 0.28 : /[,;:]/.test(punctuation) ? 0.13 : 0 };
  });
  if (!words.length) throw new Error('Enter some English words to speak.');
  return { words, unknown: [...unknown] };
}

export async function pronounceText(text: string, overrides: Pronunciations = {}) {
  return planWords(text, await loadVoiceDictionary(), overrides);
}
