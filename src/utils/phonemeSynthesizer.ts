import type { VoiceModelConfig } from './naturalVoiceEngine';
import { processCmuVoice, renderCmuDiphones } from './cmuDiphoneSynthesizer';

const SAMPLE_RATE = 16000;
const MAX_SYNTHESIS_SECONDS = 120;
const VOWELS = new Set([
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'AX', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW',
]);
const VOICED_CONSONANTS = new Set(['B', 'D', 'G', 'JH', 'V', 'DH', 'Z', 'ZH', 'M', 'N', 'NG', 'L', 'R', 'W', 'Y']);
const STOP_CONSONANTS = new Set(['P', 'B', 'T', 'D', 'K', 'G']);
const FRICATIVES = new Set(['F', 'V', 'TH', 'DH', 'S', 'Z', 'SH', 'ZH', 'HH', 'CH', 'JH']);

type Formants = [number, number, number];
type Timing = { charIndex: number; charLength: number; start: number; end: number };
type SynthesisResult = { audioUrl: string; wordTimings: Timing[]; duration: number };
type WordMatch = { word: string; start: number; end: number };
type WordProsody = { phrasePosition: number; phraseFinal: boolean; question: boolean };

const VOWEL_FORMANTS: Record<string, { start: Formants; end?: Formants }> = {
  AA: { start: [730, 1090, 2440] },
  AE: { start: [660, 1720, 2410] },
  AH: { start: [640, 1190, 2390] },
  AX: { start: [500, 1500, 2500] },
  AO: { start: [570, 840, 2410] },
  AW: { start: [570, 900, 2400], end: [700, 1350, 2500] },
  AY: { start: [700, 1200, 2450], end: [320, 2200, 3000] },
  EH: { start: [530, 1840, 2480] },
  ER: { start: [490, 1350, 1690] },
  EY: { start: [440, 2200, 2800], end: [350, 2050, 2800] },
  IH: { start: [390, 1990, 2550] },
  IY: { start: [270, 2290, 3010] },
  OW: { start: [460, 880, 2200], end: [360, 900, 2200] },
  OY: { start: [500, 870, 2400], end: [320, 2150, 2900] },
  UH: { start: [440, 1020, 2240] },
  UW: { start: [300, 870, 2240] },
};

const DICT_FALLBACK: Record<string, string> = {
  a: 'AH0', i: 'AY1', the: 'DH AH0', to: 'T UW1', of: 'AH1 V', and: 'AE1 N D',
  is: 'IH1 Z', are: 'AA1 R', was: 'W AA1 Z', were: 'W ER1', you: 'Y UW1',
};

let pronunciationDictionary: Map<string, string[]> | null = null;
let dictionaryRequest: Promise<Map<string, string[]>> | null = null;
const customPronunciations = new Map<string, string[]>();
const CUSTOM_PRONUNCIATIONS_KEY = 'vocalis_custom_pronunciations';
let customPronunciationsLoaded = false;

function loadCustomPronunciations(): void {
  if (customPronunciationsLoaded || typeof localStorage === 'undefined') return;
  customPronunciationsLoaded = true;
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_PRONUNCIATIONS_KEY) || '{}') as Record<string, string[]>;
    for (const [word, phones] of Object.entries(saved)) {
      if (Array.isArray(phones) && phones.every((phone) => typeof phone === 'string')) {
        customPronunciations.set(word.toLowerCase(), phones);
      }
    }
  } catch {
    // Ignore corrupted or unavailable local pronunciation settings.
  }
}

async function loadDictionary(): Promise<Map<string, string[]>> {
  if (pronunciationDictionary) return pronunciationDictionary;
  if (dictionaryRequest) return dictionaryRequest;
  dictionaryRequest = (async () => {
    const words = new Map<string, string[]>();
    try {
      const response = await fetch('/cmudict.txt');
      if (response.ok) {
        const source = await response.text();
        for (const row of source.split('\n')) {
          const divider = row.indexOf('|');
          if (divider < 1) continue;
          const word = row.slice(0, divider);
          if (!words.has(word)) words.set(word, row.slice(divider + 1).trim().split(/\s+/));
        }
      }
    } catch (error) {
      console.warn('Local pronunciation dictionary unavailable; using built-in letter rules.', error);
    }
    pronunciationDictionary = words;
    return words;
  })();
  return dictionaryRequest;
}

export function preparePronunciationDictionary(): Promise<void> {
  return loadDictionary().then(() => undefined);
}

function numberWords(value: string): string[] | null {
  if (!/^\d{1,9}$/.test(value)) return null;
  const n = Number(value);
  if (n === 0) return ['zero'];
  const small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const underThousand = (x: number): string[] => {
    const result: string[] = [];
    if (x >= 100) {
      result.push(small[Math.floor(x / 100)], 'hundred');
      x %= 100;
    }
    if (x >= 20) {
      result.push(tens[Math.floor(x / 10)]);
      if (x % 10) result.push(small[x % 10]);
    } else if (x > 0) result.push(small[x]);
    return result;
  };
  if (n < 1000) return underThousand(n);
  if (n < 1_000_000) return [...underThousand(Math.floor(n / 1000)), 'thousand', ...underThousand(n % 1000)];
  if (n < 1_000_000_000) return [...underThousand(Math.floor(n / 1_000_000)), 'million', ...underThousand(n % 1_000_000)];
  return null;
}

function fallbackGraphemeToPhones(word: string): string[] {
  const text = word.toLowerCase().replace(/[^a-z']/g, '');
  const phones: string[] = [];
  const rules: Array<[RegExp, string]> = [
    [/^kn/, 'N'], [/^wr/, 'R'], [/^wh/, 'W'], [/^x/, 'Z'],
    [/tion/, 'SH AH N'], [/sion/, 'ZH AH N'], [/tch/, 'CH'], [/dge/, 'JH'],
    [/igh/, 'AY'], [/eigh/, 'EY'], [/ph/, 'F'], [/sh/, 'SH'], [/ch/, 'CH'],
    [/th/, 'TH'], [/ng/, 'NG'], [/ck/, 'K'], [/qu/, 'K W'], [/wh/, 'W'],
    [/ee/, 'IY'], [/ea/, 'IY'], [/oo/, 'UW'], [/ou/, 'AW'], [/ow/, 'AW'],
    [/oi/, 'OY'], [/oy/, 'OY'], [/ai/, 'EY'], [/ay/, 'EY'], [/au/, 'AO'],
    [/aw/, 'AO'], [/er/, 'ER'], [/ir/, 'ER'], [/ur/, 'ER'], [/ar/, 'AA R'],
    [/or/, 'AO R'], [/al/, 'AO L'],
  ];
  let i = 0;
  while (i < text.length) {
    let matched = false;
    for (const [pattern, replacement] of rules) {
      const candidate = text.slice(i);
      const match = candidate.match(pattern);
      if (match && match.index === 0) {
        phones.push(...replacement.split(' '));
        i += match[0].length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const ch = text[i];
    const next = text[i + 1] || '';
    const previous = text[i - 1] || '';
    if (ch === 'e' && i === text.length - 1 && text.length > 2) { i++; continue; }
    const letterMap: Record<string, string> = {
      a: 'AE', b: 'B', c: 'K', d: 'D', e: 'EH', f: 'F', g: 'G', h: 'HH', i: 'IH',
      j: 'JH', k: 'K', l: 'L', m: 'M', n: 'N', o: 'AA', p: 'P', q: 'K', r: 'R',
      s: 'S', t: 'T', u: 'AH', v: 'V', w: 'W', x: 'K S', y: i === text.length - 1 ? 'IY' : 'Y', z: 'Z',
    };
    let phone = letterMap[ch];
    if ((ch === 'c' || ch === 'g') && /[eiy]/.test(next)) phone = ch === 'c' ? 'S' : 'JH';
    if (ch === 'y' && i === 0 && /[aeiou]/.test(next)) phone = 'Y';
    if (ch === 'a' && i + 2 < text.length && /[bcdfghjklmnpqrstvwxyz]/.test(text[i + 1]) && /e$/.test(text.slice(i + 2))) phone = 'EY';
    if (ch === 'i' && i + 2 < text.length && /[bcdfghjklmnpqrstvwxyz]/.test(text[i + 1]) && /e$/.test(text.slice(i + 2))) phone = 'AY';
    if (ch === 'o' && i + 2 < text.length && /[bcdfghjklmnpqrstvwxyz]/.test(text[i + 1]) && /e$/.test(text.slice(i + 2))) phone = 'OW';
    if (ch === 'u' && /[aeiou]/.test(previous)) phone = 'W';
    if (phone) phones.push(...phone.split(' '));
    i++;
  }
  return phones.length ? phones : ['AH'];
}

export async function savePronunciationSpelling(word: string, spelling: string): Promise<void> {
  const normalized = word.trim().toLowerCase().replace(/[’]/g, "'");
  if (!normalized || !spelling.trim()) throw new Error('Enter both a word and a pronunciation hint.');
  const dictionary = await loadDictionary();
  loadCustomPronunciations();
  const phones: string[] = [];
  for (const match of getWordMatches(spelling)) {
    const expansions = numberWords(match.word) || [match.word];
    for (const item of expansions) {
      const key = item.toLowerCase().replace(/[’]/g, "'");
      const pronunciation = dictionary.get(key) || DICT_FALLBACK[key]?.split(' ') || fallbackGraphemeToPhones(key);
      phones.push(...pronunciation);
    }
  }
  if (!phones.length) throw new Error('The pronunciation hint did not contain any speakable words.');
  customPronunciations.set(normalized, phones);
  try {
    localStorage.setItem(CUSTOM_PRONUNCIATIONS_KEY, JSON.stringify(Object.fromEntries(customPronunciations)));
  } catch {
    throw new Error('Could not save this pronunciation in browser storage.');
  }
}

async function wordPhones(word: string, dictionary: Map<string, string[]>): Promise<string[]> {
  loadCustomPronunciations();
  const normalized = word.toLowerCase().replace(/[’]/g, "'");
  const custom = customPronunciations.get(normalized);
  if (custom) return [...custom];
  const pronunciation = dictionary.get(normalized) || DICT_FALLBACK[normalized]?.split(' ') || fallbackGraphemeToPhones(normalized);
  return pronunciation;
}

function applyAccent(phones: string[], accent: VoiceModelConfig['accent']): string[] {
  if (accent === 'US' || accent === 'Global') return phones;
  const result = [...phones];
  // The CMU base is rhotic North American English. UK and Australian profiles
  // use a deterministic non-rhotic rule: post-vowel R is silent before a pause
  // or consonant, but remains when the next word begins with a vowel only in
  // the simple within-word cases handled by the pronunciation stream.
  for (let i = 1; i < result.length; i++) {
    const current = result[i].replace(/[012]$/, '');
    const previous = result[i - 1].replace(/[012]$/, '');
    const next = result[i + 1]?.replace(/[012]$/, '');
    if (current === 'R' && VOWELS.has(previous) && (!next || !VOWELS.has(next))) {
      result[i] = '';
    }
  }
  return result.filter(Boolean);
}

function getWordMatches(text: string): WordMatch[] {
  const matches = [...text.matchAll(/[\p{L}]+(?:['’][\p{L}]+)*|\d+/gu)];
  return matches.map((match) => ({ word: match[0], start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));
}

function getWordProsody(text: string, matches: WordMatch[], index: number): WordProsody {
  const hasBoundary = (left: WordMatch, right: WordMatch) => /[.!?…;,]/.test(text.slice(left.end, right.start));
  let phraseStart = index;
  let phraseEnd = index;
  while (phraseStart > 0 && !hasBoundary(matches[phraseStart - 1], matches[phraseStart])) phraseStart--;
  while (phraseEnd < matches.length - 1 && !hasBoundary(matches[phraseEnd], matches[phraseEnd + 1])) phraseEnd++;
  const phraseLast = matches[phraseEnd];
  const nextWord = matches[phraseEnd + 1];
  const ending = text.slice(phraseLast.end, nextWord?.start ?? text.length);
  const phraseLength = phraseEnd - phraseStart;
  return {
    phrasePosition: phraseLength ? (index - phraseStart) / phraseLength : 1,
    phraseFinal: index === phraseEnd,
    question: /\?/.test(ending),
  };
}

function getPauseAfter(text: string): number {
  if (/[.!?…]/.test(text)) return 0.22;
  if (/[,;:]/.test(text)) return 0.11;
  // Ordinary spaces connect words; long artificial gaps made the old output choppy.
  return 0.012;
}

function splitPhoneStress(phone: string): { phone: string; stress: string } {
  const match = phone.toUpperCase().match(/^([A-Z]+)([012])?$/);
  return match ? { phone: match[1], stress: match[2] || '0' } : { phone: phone.toUpperCase(), stress: '0' };
}

function getFormants(phone: string, progress: number, genderScale: number, accent: VoiceModelConfig['accent']): Formants {
  const vowel = VOWEL_FORMANTS[phone];
  let formants: Formants;
  if (vowel) {
    const end = vowel.end || vowel.start;
    formants = vowel.start.map((start, i) => start + (end[i] - start) * progress) as Formants;
  } else {
    const consonantFormants: Record<string, Formants> = {
      M: [260, 1000, 2200], N: [300, 1500, 2500], NG: [280, 1200, 2200],
      L: [400, 1300, 2700], R: [400, 1300, 1650], W: [300, 800, 2200], Y: [300, 2200, 3000],
    };
    formants = consonantFormants[phone] || [500, 1500, 2500];
  }
  const accentShift = accent === 'UK' ? [1.01, 1.035, 1.01] : accent === 'AU' ? [1.04, 0.98, 1.02] : [1, 1, 1];
  return formants.map((value, index) => value * genderScale * accentShift[index]) as Formants;
}

function coarticulatedFormants(
  phone: string,
  progress: number,
  genderScale: number,
  accent: VoiceModelConfig['accent'],
  previousPhone?: string,
  nextPhone?: string,
): Formants {
  const current = getFormants(phone, progress, genderScale, accent);
  const blend = (from: Formants, to: Formants, amount: number): Formants =>
    from.map((value, index) => value + (to[index] - value) * amount) as Formants;
  const smooth = (value: number) => value * value * (3 - 2 * value);
  if (progress < 0.18 && previousPhone) {
    const from = getFormants(previousPhone, 1, genderScale, accent);
    return blend(from, current, smooth(progress / 0.18));
  }
  if (progress > 0.82 && nextPhone) {
    const to = getFormants(nextPhone, 0, genderScale, accent);
    return blend(current, to, smooth((progress - 0.82) / 0.18));
  }
  return current;
}

function phonemeDuration(phone: string, stress: string, rate: number, toneStyle: VoiceModelConfig['toneStyle'], phraseFinal = false): number {
  const base = VOWELS.has(phone) ? (stress === '1' ? 0.145 : stress === '2' ? 0.12 : 0.092) : STOP_CONSONANTS.has(phone) ? 0.065 : FRICATIVES.has(phone) ? 0.075 : 0.068;
  const styleRate = toneStyle === 'energetic' ? 1.12 : toneStyle === 'deep' ? 0.94 : 1;
  const phraseLengthening = phraseFinal && VOWELS.has(phone) ? 1.18 : 1;
  return base * phraseLengthening / Math.max(0.55, rate * styleRate);
}

function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff * 2 - 1;
  };
}

function glottalFlow(phase: number, openQuotient: number, closingFraction: number): number {
  if (phase >= openQuotient) return 0;
  const openingEnd = openQuotient * (1 - closingFraction);
  if (phase < openingEnd) return 0.5 - 0.5 * Math.cos(Math.PI * phase / openingEnd);
  const closingProgress = (phase - openingEnd) / Math.max(0.001, openQuotient - openingEnd);
  return 0.5 + 0.5 * Math.cos(Math.PI * closingProgress);
}

function fricationCenter(phone: string): number {
  if (phone === 'S' || phone === 'Z') return 5900;
  if (phone === 'SH' || phone === 'ZH') return 3100;
  if (phone === 'CH' || phone === 'JH') return 3400;
  if (phone === 'F' || phone === 'V') return 4300;
  if (phone === 'TH' || phone === 'DH') return 3900;
  return 1700;
}

function buildPhoneSamples(
  phone: string,
  stress: string,
  model: VoiceModelConfig,
  absoluteOffset: number,
  random: () => number,
  prosody: WordProsody = { phrasePosition: 0, phraseFinal: false, question: false },
  previousPhone?: string,
  nextPhone?: string,
): Float32Array {
  const style = model.toneStyle;
  const seconds = phonemeDuration(phone, stress, model.rate, style, prosody.phraseFinal);
  const length = Math.max(1, Math.floor(SAMPLE_RATE * seconds));
  const result = new Float32Array(length);
  const isVowel = VOWELS.has(phone);
  const isVoiced = isVowel || VOICED_CONSONANTS.has(phone);
  const genderScale = model.gender === 'Female' ? 1.08 : model.gender === 'Male' ? 0.94 : 1;
  const stylePitch = style === 'deep' ? 0.93 : style === 'energetic' ? 1.07 : 1;
  const basePitch = (model.gender === 'Male' ? 116 : model.gender === 'Female' ? 196 : 150) * model.pitch * stylePitch;
  const stressGain = stress === '1' ? 1 : stress === '2' ? 0.84 : 0.68;
  const openQuotient = style === 'whisper' ? 0.7 : style === 'energetic' ? 0.58 : 0.64;
  const closingFraction = style === 'whisper' ? 0.42 : style === 'energetic' ? 0.22 : 0.3;
  const formantBandwidths: Formants = [95, 125, 180];
  const formantWeights: Formants = [1, 0.72, 0.42];
  const formantY1: Formants = [0, 0, 0];
  const formantY2: Formants = [0, 0, 0];
  let phase = ((basePitch * absoluteOffset) / SAMPLE_RATE) % 1;
  let previousNoise = 0;
  let noiseY1 = 0;
  let noiseY2 = 0;
  let previousFlow = glottalFlow(phase, openQuotient, closingFraction);

  for (let i = 0; i < length; i++) {
    const t = i / length;
    const absoluteTime = (absoluteOffset + i) / SAMPLE_RATE;
    const edge = Math.min(1, (t * seconds) / 0.004, ((1 - t) * seconds) / 0.006);
    const envelope = Math.max(0, edge) * (isVowel ? stressGain : 0.48);
    let voicing = 0;
    let frication = 0;
    let burst = 0;

    if (isVoiced) {
      const stressPitch = stress === '1' ? 1.045 : stress === '2' ? 1.018 : 0.985;
      const localContour = style === 'robot' ? 1 : 1 + 0.035 * Math.sin(Math.PI * t) - 0.05 * t;
      const phraseDeclination = style === 'robot' ? 1 : 1 - 0.045 * prosody.phrasePosition;
      const boundaryMovement = prosody.phraseFinal && style !== 'robot' ? (prosody.question ? 0.1 : -0.075) * t : 0;
      const f0 = basePitch * stressPitch * localContour * phraseDeclination * (1 + boundaryMovement);
      const phaseStep = f0 / SAMPLE_RATE;
      const nextPhase = (phase + phaseStep) % 1;
      const nextFlow = glottalFlow(nextPhase, openQuotient, closingFraction);
      // The differentiated, asymmetrical glottal-flow pulse has a natural spectral tilt,
      // unlike a bank of perfectly phase-aligned sine waves.
      let excitation = (nextFlow - previousFlow) / Math.max(phaseStep, 0.001) * 0.008;
      phase = nextPhase;
      previousFlow = nextFlow;

      if (STOP_CONSONANTS.has(phone)) {
        if (t < 0.68) excitation *= isVowel ? 0.16 : 0.1;
        else if (t < 0.82) excitation += random() * 0.2 * (1 - (t - 0.68) / 0.14);
      }

      const aspiration = random() * (style === 'whisper' ? 0.12 : isVowel ? 0.012 : 0.035);
      voicing = (excitation + aspiration) * (isVowel ? 1 : 0.38);
    }

    if (FRICATIVES.has(phone) && (!isVoiced || style === 'whisper')) {
      const white = random();
      const highPassed = white - previousNoise * 0.82;
      previousNoise = white;
      const center = fricationCenter(phone);
      const bandwidth = phone === 'S' || phone === 'Z' ? 1500 : 1900;
      const radius = Math.exp(-Math.PI * bandwidth / SAMPLE_RATE);
      const angle = 2 * Math.PI * center / SAMPLE_RATE;
      const inputGain = (1 - radius) * (1 - radius);
      const filtered = inputGain * highPassed + 2 * radius * Math.cos(angle) * noiseY1 - radius * radius * noiseY2;
      noiseY2 = noiseY1;
      noiseY1 = filtered;
      const level = phone === 'S' || phone === 'Z' || phone === 'SH' || phone === 'ZH' ? 1.2 : 0.76;
      frication = filtered * level;
    }

    if (STOP_CONSONANTS.has(phone) || phone === 'CH' || phone === 'JH') {
      const releaseStart = phone === 'CH' || phone === 'JH' ? 0.2 : 0.68;
      if (t >= releaseStart && t < releaseStart + 0.13) {
        const releaseEnvelope = 1 - (t - releaseStart) / 0.13;
        burst = random() * 0.3 * releaseEnvelope;
      }
    } else if (!isVoiced && !FRICATIVES.has(phone)) {
      burst = random() * 0.025;
    }

    const formants = coarticulatedFormants(phone, t, genderScale, model.accent, previousPhone, nextPhone);
    let tractOutput = 0;
    for (let formant = 0; formant < 3; formant++) {
      const radius = Math.exp(-Math.PI * formantBandwidths[formant] / SAMPLE_RATE);
      const angle = 2 * Math.PI * formants[formant] / SAMPLE_RATE;
      const inputGain = (1 - radius) * (1 - radius);
      const filtered = inputGain * voicing
        + 2 * radius * Math.cos(angle) * formantY1[formant]
        - radius * radius * formantY2[formant];
      formantY2[formant] = formantY1[formant];
      formantY1[formant] = filtered;
      tractOutput += filtered * formantWeights[formant];
    }

    let sample = tractOutput + frication + burst;
    if (style === 'whisper') sample = sample * 0.65 + frication * 0.35;
    if (style === 'robot') sample *= 0.78 + 0.22 * Math.sin(2 * Math.PI * 32 * absoluteTime);
    if (style === 'radio') sample = Math.tanh(sample * 2.3) * 0.72;
    result[i] = sample * envelope;
  }
  return result;
}

function joinFormantPhones(chunks: Float32Array[]): Float32Array {
  if (!chunks.length) return new Float32Array(0);
  const overlap = Math.floor(SAMPLE_RATE * 0.004);
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0) - overlap * Math.max(0, chunks.length - 1);
  const output = new Float32Array(Math.max(0, totalLength));
  let cursor = 0;
  for (const chunk of chunks) {
    if (cursor === 0) {
      output.set(chunk);
      cursor = chunk.length;
      continue;
    }
    const blend = Math.min(overlap, cursor, chunk.length);
    const start = cursor - blend;
    for (let i = 0; i < blend; i++) {
      const phase = (i + 1) / (blend + 1) * Math.PI / 2;
      output[start + i] = output[start + i] * Math.cos(phase) + chunk[i] * Math.sin(phase);
    }
    output.set(chunk.subarray(blend), cursor);
    cursor += chunk.length - blend;
  }
  return output;
}

function writeWav(samples: Float32Array, volume: number): Blob {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const normalizer = peak > 0 ? Math.min(1.8, 0.78 / peak) : 1;
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  const gain = Math.max(0, Math.min(1, volume));
  for (const sample of samples) {
    const clipped = Math.max(-1, Math.min(1, sample * normalizer * gain));
    view.setInt16(offset, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export async function synthesizeText(text: string, model: VoiceModelConfig): Promise<SynthesisResult> {
  const dictionary = await loadDictionary();
  const synthesisMethod = model.synthesisMethod ?? 'cmu-arctic';
  const matches = getWordMatches(text);
  const samples: Float32Array[] = [];
  const wordTimings: Timing[] = [];
  const random = makeRandom(0x564f4341);
  const fallbackModel: VoiceModelConfig = { ...model, pitch: 1, rate: 1, volume: 1, toneStyle: 'natural' };
  let sampleCount = 0;
  let previousEnd = 0;
  let previousWord: WordMatch | null = null;

  const appendSilence = (seconds: number) => {
    const length = Math.max(0, Math.floor(SAMPLE_RATE * seconds));
    if (length) {
      samples.push(new Float32Array(length));
      sampleCount += length;
    }
  };

  for (let matchIndex = 0; matchIndex < matches.length; matchIndex++) {
    const match = matches[matchIndex];
    const prosody = getWordProsody(text, matches, matchIndex);
    if (previousWord) appendSilence(getPauseAfter(text.slice(previousEnd, match.start)));
    const wordStart = sampleCount / SAMPLE_RATE;
    const timing: Timing = { charIndex: match.start, charLength: match.end - match.start, start: wordStart, end: wordStart };
    wordTimings.push(timing);

    const spokenWords = numberWords(match.word) || [match.word];
    const phones: string[] = [];
    for (const spokenWord of spokenWords) {
      phones.push(...applyAccent(await wordPhones(spokenWord, dictionary), model.accent));
    }
    let wordSamples: Float32Array;
    if (synthesisMethod === 'cmu-arctic') {
      const fallback = (phone: string, offset: number) => {
        const normalizedPhone = phone === 'AX' ? 'AH' : phone;
        return buildPhoneSamples(normalizedPhone, '0', fallbackModel, offset, random);
      };
      const cmuPhones = phones.map((phone) => splitPhoneStress(phone).phone);
      const rendered = await renderCmuDiphones(cmuPhones, model, fallback, sampleCount);
      wordSamples = rendered.samples;
    } else {
      let phoneOffset = sampleCount;
      const phoneChunks = phones.map((phone, phoneIndex) => {
        const parsed = splitPhoneStress(phone);
        const normalizedPhone = parsed.phone === 'AX' ? 'AH' : parsed.phone;
        const previousPhone = phoneIndex > 0 ? splitPhoneStress(phones[phoneIndex - 1]).phone : undefined;
        const nextPhone = phoneIndex + 1 < phones.length ? splitPhoneStress(phones[phoneIndex + 1]).phone : undefined;
        const chunk = buildPhoneSamples(normalizedPhone, parsed.stress, model, phoneOffset, random, prosody, previousPhone, nextPhone);
        phoneOffset += chunk.length;
        return chunk;
      });
      wordSamples = joinFormantPhones(phoneChunks);
    }
    samples.push(wordSamples);
    sampleCount += wordSamples.length;
    timing.end = sampleCount / SAMPLE_RATE;
    previousEnd = match.end;
    previousWord = match;

    if (sampleCount / SAMPLE_RATE > MAX_SYNTHESIS_SECONDS) {
      throw new Error(`Text is too long for one render. Limit audio to about ${MAX_SYNTHESIS_SECONDS} seconds.`);
    }
  }

  if (matches.length) appendSilence(getPauseAfter(text.slice(previousEnd)) * 0.65);
  if (!samples.length) appendSilence(0.1);
  const raw = new Float32Array(sampleCount);
  let offset = 0;
  for (const part of samples) {
    raw.set(part, offset);
    offset += part.length;
  }

  const combined = synthesisMethod === 'cmu-arctic' ? processCmuVoice(raw, model) : raw;
  const timingScale = raw.length ? combined.length / raw.length : 1;
  for (const timing of wordTimings) {
    timing.start *= timingScale;
    timing.end *= timingScale;
  }
  if (combined.length / SAMPLE_RATE > MAX_SYNTHESIS_SECONDS) {
    throw new Error(`Rendered audio exceeds ${MAX_SYNTHESIS_SECONDS} seconds.`);
  }
  const audioUrl = URL.createObjectURL(writeWav(combined, model.volume));
  return { audioUrl, wordTimings, duration: combined.length / SAMPLE_RATE };
}
