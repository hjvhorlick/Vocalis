/**
 * Vocalis text analysis — the front end of the speech pipeline.
 *
 * Everything between "the text a person typed" and "a stream of phones with
 * stress, character spans and prosodic boundaries" lives here. It is a separate
 * module because it is the part of the pipeline that can be tested without audio:
 * `tests/textAnalysis.test.ts` runs it against the real bundled dictionary under
 * Node, with no browser and no dev server.
 *
 * The rules it implements, in order:
 *
 *   1. tokenize          characters → tokens, keeping source offsets. Numbers stay
 *                        in one piece ("1,250.50"); hyphens separate ("blue-green").
 *   2. spokenFormsOf     a token → the words a reader would say: numbers, dates,
 *                        money, times, percentages, abbreviations, acronyms.
 *   3. phonesForWord     a word → phones, from a saved hint, the bundled CMU
 *                        dictionary, or Vocalis's own grapheme rules.
 *   4. applyAccentTokens the whole phone stream → accent rules, applied once over
 *                        the stream so linking R at a word end survives.
 *   5. analyzeText       the three passes above, producing an `Utterance` with
 *                        character spans and boundary strengths.
 *   6. segmentUtterance  the utterance → `Segment[]`, split only where a sentence
 *                        ends, because that is the only place silence belongs.
 *
 * Two honesty rules run through the whole file. Nothing typed is silently
 * dropped: a word the dictionary does not know is spelled out by our own rules
 * and reported in `guessedWords`, and a token that cannot be spoken at all is
 * reported in `rejectedTokens`. And nothing is claimed that is not measured:
 * every word keeps the character span it came from, so the UI can point at the
 * source text rather than at an approximation of it.
 *
 * Original Vocalis code. The pronunciation data is the bundled CMU Pronouncing
 * Dictionary (see public/CMUDICT-LICENSE.txt); the grapheme rules below are our
 * own and are deliberately simple and explainable rather than state of the art.
 */

export type AccentCode = 'US' | 'UK' | 'AU' | 'Global';

/**
 * How strongly a boundary separates two spoken words.
 *
 * `sentence` is the only boundary that may carry silence. `clause` is a comma or
 * a semicolon: it shapes the prosody but does not stop the voice. `word` is an
 * ordinary space, and `none` is a boundary inside one spoken idea, such as the
 * parts of an expanded number.
 */
export type BoundaryKind = 'sentence' | 'clause' | 'word' | 'none';

export type Stress = '0' | '1' | '2';

export type TokenKind = 'word' | 'number' | 'punctuation' | 'whitespace';

export interface Token {
  text: string;
  charIndex: number;
  charLength: number;
  kind: TokenKind;
}

export interface PhoneToken {
  /** Bare ARPAbet symbol, without a stress digit. */
  phone: string;
  stress: Stress;
  /** Index into `Utterance.words`. Carried through every pass, including accent. */
  wordIndex: number;
  /**
   * True when an accent rule lengthened this vowel, so a later stage can give it
   * the extra time a non-rhotic accent actually uses.
   */
  long?: boolean;
}

export interface WordToken {
  /** The word as it will be spoken, which may differ from the source ("Dr." → "doctor"). */
  text: string;
  /** Span in the source text. Zero length for the second and later words of an expansion. */
  charIndex: number;
  charLength: number;
  /** Inclusive index of this word's first phone in `Utterance.phones`. */
  phoneStart: number;
  /** Exclusive index just past this word's last phone. */
  phoneEnd: number;
  /** True when the pronunciation came from our grapheme rules, not the dictionary. */
  guessed: boolean;
  /** Boundary strength after this word. */
  boundaryAfter: BoundaryKind;
}

export interface Utterance {
  sourceText: string;
  accent: AccentCode;
  words: WordToken[];
  phones: PhoneToken[];
  /** Words spoken from spelling rules rather than from the dictionary. */
  guessedWords: string[];
  /** Tokens that produced no speech at all. */
  rejectedTokens: string[];
}

export interface Segment {
  phones: PhoneToken[];
  /** Inclusive word indices in `Utterance.words`. */
  wordStart: number;
  wordEnd: number;
  /** The punctuation that ended the segment, or '' when the text simply stopped. */
  terminal: string;
}

/** The silence phone. It exists only in the recorded-unit inventory. */
export const PAUSE = 'pau';

export const VOWELS = new Set([
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW',
]);

const CONSONANTS = new Set([
  'B', 'CH', 'D', 'DH', 'F', 'G', 'HH', 'JH', 'K', 'L', 'M', 'N', 'NG', 'P', 'R',
  'S', 'SH', 'T', 'TH', 'V', 'W', 'Y', 'Z', 'ZH',
]);

// ---------------------------------------------------------------------------
// Tokenizing
// ---------------------------------------------------------------------------

/**
 * Split source text into tokens, keeping character offsets.
 *
 * Numbers stay in one piece even when they carry separators, currency symbols,
 * decimal points, percent signs or colon-delimited times, because "1,250.50" is
 * one spoken idea: splitting it would produce "one comma two hundred fifty point
 * five zero". Hyphens do the opposite — they separate, so "blue-green" is looked
 * up as two words that the dictionary actually knows.
 */
export function tokenize(input: string): Token[] {
  // A typographic minus sign (U+2212) in front of a number says exactly what a
  // hyphen-minus says, so both read "negative seventy". En and em dashes are
  // deliberately left alone: they are clause boundaries, not signs. The
  // replacement is character for character, so every offset still points at the
  // caller's own string.
  const text = input.replace(/[\u2212\uFF0D]/g, '-');
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const character = text[index];

    if (/\s/.test(character)) {
      let stop = index;
      while (stop < text.length && /\s/.test(text[stop])) stop += 1;
      tokens.push({ text: text.slice(index, stop), charIndex: index, charLength: stop - index, kind: 'whitespace' });
      index = stop;
      continue;
    }

    // A minus sign belongs to the number that follows it only when nothing
    // speaks immediately before it: "-7" is negative seven, but "blue-green"
    // and "the -1" are different things again.
    const previousToken = tokens[tokens.length - 1];
    const minusStartsNumber =
      character === '-' &&
      /[0-9]/.test(text[index + 1] ?? '') &&
      (!previousToken || previousToken.kind === 'whitespace' || previousToken.kind === 'punctuation');

    // The currency test is anchored to this character: an unanchored
    // `/[$£€¥]?\d/` also matched the digit *after* a hyphen, so "I-70" opened a
    // number token that could not consume the hyphen and never advanced.
    const currencyStartsNumber = /[$£€¥]/.test(character) && /[0-9]/.test(text[index + 1] ?? '');

    if (/[0-9]/.test(character) || currencyStartsNumber || minusStartsNumber) {
      let stop = minusStartsNumber ? index + 1 : index;
      while (stop < text.length) {
        const c = text[stop];
        const next = text[stop + 1] ?? '';
        if (/[0-9]/.test(c) || /[$£€¥%]/.test(c)) stop += 1;
        else if ((c === ',' || c === '.' || c === ':' || c === '/') && /[0-9]/.test(next)) stop += 1;
        else break;
      }
      // An ordinal suffix belongs to its number, so "3rd" arrives as one token
      // and can be spoken as "third" instead of "three" plus a stray "rd". The
      // suffix must not be the start of a longer word ("3 street" is not one).
      const suffix = text.slice(stop, stop + 2).toLowerCase();
      const ordinalSuffix =
        /[0-9]/.test(text[stop - 1] ?? '') &&
        (suffix === 'st' || suffix === 'nd' || suffix === 'rd' || suffix === 'th') &&
        !/[A-Za-z]/.test(text[stop + 2] ?? '');
      if (ordinalSuffix) stop += 2;
      // A token must always consume something, or the scan stalls here forever.
      if (stop === index) stop = index + 1;
      tokens.push({ text: text.slice(index, stop), charIndex: index, charLength: stop - index, kind: 'number' });
      index = stop;
      continue;
    }

    if (/[A-Za-z&]/.test(character)) {
      let stop = index;
      while (stop < text.length) {
        const c = text[stop];
        const next = text[stop + 1] ?? '';
        if (/[A-Za-z&]/.test(c)) stop += 1;
        else if ((c === "'" || c === '’') && /[A-Za-z]/.test(next)) stop += 1;
        else if (c === '.' && /[A-Za-z]/.test(next)) stop += 1;
        else break;
      }
      tokens.push({ text: text.slice(index, stop), charIndex: index, charLength: stop - index, kind: 'word' });
      index = stop;
      continue;
    }

    tokens.push({ text: character, charIndex: index, charLength: 1, kind: 'punctuation' });
    index += 1;
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Numbers, dates, money and abbreviations
// ---------------------------------------------------------------------------

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['thousand', 'million', 'billion', 'trillion'];

function twoDigits(value: number): string[] {
  if (value === 0) return [];
  if (value < 20) return [ONES[value]];
  const unit = value % 10;
  return unit ? [TENS[Math.floor(value / 10)], ONES[unit]] : [TENS[Math.floor(value / 10)]];
}

function threeDigits(value: number): string[] {
  const hundred = Math.floor(value / 100);
  const rest = value % 100;
  const words: string[] = [];
  if (hundred) words.push(ONES[hundred], 'hundred');
  if (rest) {
    if (hundred) words.push('and');
    words.push(...twoDigits(rest));
  }
  return words;
}

function splitWords(words: string[]): string[] {
  return words.join(' ').split(/\s+/).filter(Boolean);
}

/**
 * The ordinal form of each cardinal word a number can end with.
 *
 * Only the last word changes: "twenty-one" becomes "twenty-first" and "one
 * hundred" becomes "one hundredth", which is how ordinals are read aloud.
 */
const ORDINALS: Record<string, string> = {
  zero: 'zeroth', one: 'first', two: 'second', three: 'third', four: 'fourth',
  five: 'fifth', six: 'sixth', seven: 'seventh', eight: 'eighth', nine: 'ninth',
  ten: 'tenth', eleven: 'eleventh', twelve: 'twelfth', thirteen: 'thirteenth',
  fourteen: 'fourteenth', fifteen: 'fifteenth', sixteen: 'sixteenth',
  seventeen: 'seventeenth', eighteen: 'eighteenth', nineteen: 'nineteenth',
  twenty: 'twentieth', thirty: 'thirtieth', forty: 'fortieth', fifty: 'fiftieth',
  sixty: 'sixtieth', seventy: 'seventieth', eighty: 'eightieth', ninety: 'ninetieth',
  hundred: 'hundredth', thousand: 'thousandth', million: 'millionth',
  billion: 'billionth', trillion: 'trillionth',
};

/** Speak an ordinal: 3rd is "third", 21st is "twenty-first", 100th is "one hundredth". */
export function ordinalToWords(input: string | number): string[] {
  const words = numberToWords(input);
  if (!words.length) return [];
  const last = words[words.length - 1];
  words[words.length - 1] = ORDINALS[last] ?? `${last}th`;
  return words;
}

/**
 * Speak an integer the way a person reads it.
 *
 * Grouped by thousands, with "and" before the trailing tens, so 1250 is "one
 * thousand two hundred and fifty". Zero is a word of its own — it is not the
 * absence of one.
 */
export function numberToWords(input: string | number): string[] {
  const value = typeof input === 'number' ? input : parseInt(input.replace(/[^0-9-]/g, ''), 10);
  if (!Number.isFinite(value)) return [];
  if (value === 0) return ['zero'];
  const words: string[] = [];
  if (value < 0) words.push('negative');
  const groups: number[] = [];
  let remaining = Math.abs(value);
  while (remaining > 0) {
    groups.unshift(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }
  groups.forEach((group, index) => {
    if (!group) return;
    words.push(...threeDigits(group));
    const scale = SCALES[groups.length - 2 - index];
    if (scale) words.push(scale);
  });
  return splitWords(words);
}

/** Speak a digit string one digit at a time — years, phone numbers, codes. */
export function digitsToWords(digits: string): string[] {
  const out: string[] = [];
  for (const character of digits) {
    if (!/[0-9]/.test(character)) continue;
    const digit = Number(character);
    if (digit === 0 && out[out.length - 1] === 'zero') {
      out[out.length - 1] = 'double zero';
      continue;
    }
    out.push(ONES[digit]);
  }
  return out;
}

const ABBREVIATIONS: Record<string, string> = {
  mr: 'mister', mrs: 'missus', ms: 'miz', dr: 'doctor', prof: 'professor',
  rev: 'reverend', st: 'saint', jr: 'junior', sr: 'senior', vs: 'versus',
  etc: 'et cetera', approx: 'approximately', dept: 'department', est: 'established',
  govt: 'government', pp: 'pages', vol: 'volume', fig: 'figure', inc: 'incorporated',
  ltd: 'limited', co: 'company', corp: 'corporation', ave: 'avenue', rd: 'road',
  blvd: 'boulevard', mt: 'mount', ft: 'feet', lb: 'pound', lbs: 'pounds',
  oz: 'ounces', mi: 'miles', km: 'kilometres', cm: 'centimetres', mm: 'millimetres',
  // Letter names spelled as words the dictionary actually contains, so "6:30
  // a.m." is spoken "six thirty ay em" without a guessed pronunciation.
  am: 'ay em', pm: 'pee em', ad: 'ay dee', bc: 'bee see',
  eg: 'for example', ie: 'that is',
  jan: 'january', feb: 'february', mar: 'march', apr: 'april', jun: 'june',
  jul: 'july', aug: 'august', sep: 'september', sept: 'september', oct: 'october',
  nov: 'november', dec: 'december',
  mon: 'monday', tue: 'tuesday', tues: 'tuesday', wed: 'wednesday', thu: 'thursday',
  thur: 'thursday', thurs: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday',
};

/**
 * Abbreviations that are followed by the words they belong to rather than by a
 * new sentence. Their full stop never ends a sentence, whatever comes next.
 */
const TITLES = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'rev', 'st', 'jr', 'sr', 'mt']);

const MONTHS = new Set([
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
]);

/** True when a word is an abbreviation whose full stop does not end a sentence. */
export function isAbbreviation(word: string): boolean {
  const key = word.replace(/\./g, '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(ABBREVIATIONS, key);
}

/** Letters spoken as letters, for initials and unknown acronyms. */
export function letterToPhones(letter: string): string[] {
  const map: Record<string, string[]> = {
    a: ['EY1'], b: ['B', 'IY1'], c: ['S', 'IY1'], d: ['D', 'IY1'], e: ['IY1'],
    f: ['EH1', 'F'], g: ['JH', 'IY1'], h: ['EY1', 'CH'], i: ['AY1'], j: ['JH', 'EY1'],
    k: ['K', 'EY1'], l: ['EH1', 'L'], m: ['EH1', 'M'], n: ['EH1', 'N'], o: ['OW1'],
    p: ['P', 'IY1'], q: ['K', 'Y', 'UW1'], r: ['AA1', 'R'], s: ['EH1', 'S'],
    t: ['T', 'IY1'], u: ['Y', 'UW1'], v: ['V', 'IY1'],
    w: ['D', 'AH1', 'B', 'AH0', 'L', 'Y', 'UW0'], x: ['EH1', 'K', 'S'],
    y: ['W', 'AY1'], z: ['Z', 'IY1'],
  };
  return map[letter.toLowerCase()] ?? [];
}

/** True for a short run of capitals with no vowels pattern of an ordinary word. */
function isAcronym(word: string): boolean {
  if (word.length < 2 || word.length > 6) return false;
  if (!/^[A-Z&]+$/.test(word)) return false;
  // "US" and "UK" read as letters; "A" alone is an article, handled elsewhere.
  return true;
}

/**
 * The words a reader would say for one token.
 *
 * A word token may expand to several spoken words ("etc." → "et cetera"), and a
 * number token usually expands to several ("$1,250.50" → ten words). The caller
 * gives the first spoken word the token's character span and the rest a
 * zero-length span, so the highlight lands on what the writer typed.
 */
export function spokenFormsOf(token: Token): string[] {
  const raw = token.text;

  if (token.kind === 'word') {
    if (raw === '&') return ['and'];
    // Typographic apostrophes are normalised; full stops are kept here and
    // stripped only for lookup, so the word that reaches the dictionary still
    // reads as the writer typed it.
    const bare = raw.replace(/[’‘]/g, "'");
    const letters = bare.replace(/\./g, '');
    const key = letters.toLowerCase();
    if (ABBREVIATIONS[key]) return splitWords([ABBREVIATIONS[key]]);
    if (isAcronym(letters)) return letters.split('');
    return [letters.replace(/\.$/, '')];
  }

  if (token.kind !== 'number') return [];

  const negative = raw.trim().startsWith('-');
  const currency = raw.match(/[$£€¥]/)?.[0];
  const percent = raw.includes('%');
  // The sign is spoken by `negative` below, so it must not also be carried into
  // numberToWords, which reads a leading '-' as a sign of its own.
  const cleaned = raw.replace(/[$£€¥%,\s-]/g, '');

  // An ordinal reads as one word: "3rd" is "third", never "three" plus "rd".
  const ordinal = cleaned.match(/^(\d+)(?:st|nd|rd|th)$/i);
  if (ordinal) {
    const spoken = ordinalToWords(ordinal[1]);
    return negative ? ['negative', ...spoken] : spoken;
  }

  if (cleaned.includes(':')) {
    const [hours, minutes] = cleaned.split(':');
    const words = [...numberToWords(hours)];
    if (minutes && minutes !== '00') words.push(...numberToWords(minutes));
    else words.push("o'clock");
    return words;
  }
  if (cleaned.includes('/')) {
    const [numerator, denominator] = cleaned.split('/');
    return [...numberToWords(numerator), 'slash', ...numberToWords(denominator)];
  }

  const [whole, fraction] = cleaned.split('.');
  const words: string[] = [];
  if (negative) words.push('negative');

  if (currency) {
    const unit = currency === '$' ? 'dollar' : currency === '£' ? 'pound' : currency === '€' ? 'euro' : 'yen';
    words.push(...numberToWords(whole || '0'));
    words.push(Number(whole || 0) === 1 ? unit : `${unit}s`);
    if (fraction && Number(fraction) > 0) {
      const sub = currency === '$' ? 'cent' : currency === '£' ? 'penny' : 'cent';
      words.push('and', ...numberToWords(fraction), Number(fraction) === 1 ? sub : `${sub}s`);
    }
    return words;
  }

  if (percent) {
    words.push(...numberToWords(whole || '0'));
    if (fraction) words.push('point', ...digitsToWords(fraction));
    words.push('percent');
    return words;
  }

  // A bare four-digit number under 2100 reads as a year: "in 1975", not
  // "one thousand nine hundred and seventy five".
  if (!fraction && /^\d{4}$/.test(whole) && Number(whole) < 2100 && Number(whole) > 1000) {
    const [left, right] = [whole.slice(0, 2), whole.slice(2)];
    words.push(...numberToWords(left));
    if (right === '00') words.push('hundred');
    else if (right.startsWith('0')) words.push('oh', ...numberToWords(right.slice(1)));
    else words.push(...numberToWords(right));
    return words;
  }

  if (fraction) {
    words.push(...numberToWords(whole || '0'), 'point', ...digitsToWords(fraction));
    return words;
  }

  words.push(...numberToWords(whole || '0'));
  return words;
}

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

/** A run of single letters with dots between them: "J.K", "J.K.", "K". */
const INITIALS = /^(?:[A-Za-z]\.)*[A-Za-z]$/;

const SENTENCE_END = /[.!?…]/;
const CLAUSE_END = /[,;:\u2014\u2013]/;
const QUOTE_CLOSER = /["'”’)\]]/;

const BOUNDARY_RANK: Record<BoundaryKind, number> = { none: 0, word: 1, clause: 2, sentence: 3 };

/** The stronger of two boundary kinds. */
export function stronger(a: BoundaryKind, b: BoundaryKind): BoundaryKind {
  return BOUNDARY_RANK[a] >= BOUNDARY_RANK[b] ? a : b;
}

/**
 * Boundary strength from the punctuation that follows a spoken token.
 *
 * A full stop after a known abbreviation ("Dr.", "St.", "Jan.") does not end a
 * sentence, and neither does one after a single letter, because that is an
 * initial. Everything else that ends in .!? is a sentence end, including when a
 * closing quote or bracket follows it.
 */
export function trailingBoundary(token: Token, previousWord?: string): BoundaryKind {
  if (token.kind !== 'punctuation') return 'none';
  const text = token.text;
  if (SENTENCE_END.test(text)) {
    if (text === '.' && previousWord) {
      const bare = previousWord.replace(/[.’']/g, '');
      if (isAbbreviation(bare) || INITIALS.test(previousWord)) return 'clause';
    }
    return 'sentence';
  }
  if (CLAUSE_END.test(text)) return 'clause';
  if (QUOTE_CLOSER.test(text)) return 'none';
  return 'none';
}

/**
 * Boundary strength between two spoken tokens, scanning the punctuation and
 * whitespace in between.
 *
 * A line break is a sentence end even without a full stop, because dialogue is
 * written that way. Otherwise the strongest punctuation between the two tokens
 * wins.
 */
export function boundaryBetween(
  tokens: Token[],
  fromIndex: number,
  toIndex: number,
  previousWord?: string,
): BoundaryKind {
  let boundary: BoundaryKind = 'none';
  let sawNewline = false;
  for (let index = fromIndex; index < toIndex && index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind === 'whitespace') {
      if (token.text.includes('\n')) sawNewline = true;
      else boundary = stronger(boundary, 'word');
      continue;
    }
    if (token.kind === 'punctuation') {
      boundary = stronger(boundary, trailingBoundary(token, previousWord));
    }
  }
  if (sawNewline) boundary = stronger(boundary, 'sentence');
  return boundary;
}

// ---------------------------------------------------------------------------
// Dictionary
// ---------------------------------------------------------------------------

/**
 * A handful of words that must survive even if the bundled dictionary cannot be
 * fetched. This is a lifeboat, not a fallback pronunciation system: if it is
 * ever used, `DictionaryStats.source` says so and the UI can show it.
 */
export const EMERGENCY_PRONUNCIATIONS: Record<string, string> = {
  the: 'DH AH0', a: 'AH0', an: 'AH0 N', and: 'AH0 N D', of: 'AH1 V', to: 'T UW1',
  is: 'IH1 Z', are: 'AA1 R', was: 'W AA1 Z', you: 'Y UW1', i: 'AY1', it: 'IH1 T',
  he: 'HH IY1', she: 'SH IY1', we: 'W IY1', they: 'DH EY1', this: 'DH IH1 S',
  that: 'DH AE1 T', hello: 'HH AH0 L OW1', yes: 'Y EH1 S', no: 'N OW1',
};

export interface DictionaryStats {
  entries: number;
  /** 'file' when the bundled dictionary loaded, 'emergency' when it did not. */
  source: 'file' | 'emergency';
  /** Lines whose phones contained a symbol outside the ARPAbet inventory. */
  rejectedTokens: number;
  /** `#` annotation lines skipped rather than parsed as words. */
  annotatedLines: number;
  /** Pronunciation hints saved in browser storage. */
  hints: number;
}

export type DictionaryLoader = () => Promise<string>;

let customLoader: DictionaryLoader | null = null;
let dictionary: Map<string, string[]> | null = null;
let dictionarySource: DictionaryStats['source'] = 'emergency';
let rejectedTokenCount = 0;
let annotatedLineCount = 0;
let dictionaryPromise: Promise<Map<string, string[]>> | null = null;

/** Supply dictionary text from somewhere other than `fetch('/cmudict.txt')`. */
export function setDictionaryLoader(loader: DictionaryLoader | null): void {
  customLoader = loader;
  dictionary = null;
  dictionaryPromise = null;
  dictionarySource = 'emergency';
  rejectedTokenCount = 0;
  annotatedLineCount = 0;
}

export function getDictionaryStats(): DictionaryStats {
  return {
    entries: dictionary?.size ?? Object.keys(EMERGENCY_PRONUNCIATIONS).length,
    source: dictionary ? dictionarySource : 'emergency',
    rejectedTokens: rejectedTokenCount,
    annotatedLines: annotatedLineCount,
    hints: typeof localStorage === 'undefined' ? 0 : readHints().length,
  };
}

/** True when a symbol is part of the phone inventory this pipeline can render. */
export function isKnownPhone(symbol: string): boolean {
  const bare = symbol.toUpperCase().replace(/[012]$/, '');
  return VOWELS.has(bare) || CONSONANTS.has(bare) || bare === 'AX' || bare === PAUSE.toUpperCase();
}

interface ParsedLine {
  word: string;
  phones: string[];
}

/**
 * Parse one dictionary line.
 *
 * The bundled file is the pipe-delimited redistribution of the CMU dictionary:
 * `word|PHONE PHONE1 PHONE0`. Lines beginning with `#` are annotations from that
 * redistribution and are counted, not parsed — treating them as words is how
 * garbage phones used to enter the stream.
 */
function parseDictionaryLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('#') || trimmed.startsWith(';;;')) {
    annotatedLineCount += 1;
    return null;
  }
  const [word, rawSpelling] = trimmed.split('|');
  if (!word || !rawSpelling) return null;
  // Sixteen entries carry a trailing annotation ("aalborg|AO1 L B AO0 R G #
  // place, danish"). The annotation is counted and stripped; parsing it as
  // phones is how garbage used to enter the stream.
  const commentAt = rawSpelling.indexOf('#');
  const spelling = commentAt >= 0 ? rawSpelling.slice(0, commentAt) : rawSpelling;
  if (commentAt >= 0) annotatedLineCount += 1;
  const phones = spelling.trim().split(/\s+/).filter(Boolean);
  if (!phones.length) return null;
  for (const phone of phones) {
    if (!isKnownPhone(phone)) {
      rejectedTokenCount += 1;
      return null;
    }
  }
  return { word: word.trim().toLowerCase(), phones };
}

async function loadDictionary(): Promise<Map<string, string[]>> {
  if (dictionary) return dictionary;
  if (dictionaryPromise) return dictionaryPromise;
  dictionaryPromise = (async () => {
    try {
      const text = customLoader ? await customLoader() : await (await fetch('/cmudict.txt')).text();
      const entries = new Map<string, string[]>();
      for (const line of text.split('\n')) {
        const parsed = parseDictionaryLine(line);
        if (!parsed) continue;
        if (!entries.has(parsed.word)) entries.set(parsed.word, parsed.phones);
      }
      if (!entries.size) throw new Error('the dictionary file contained no usable entries');
      dictionary = entries;
      dictionarySource = 'file';
      return entries;
    } catch (error) {
      // Never fail the render because a data file could not be fetched: speak
      // from spelling rules and say so in the diagnostics.
      console.warn('Vocalis: the bundled pronunciation dictionary could not be loaded.', error);
      const entries = new Map<string, string[]>();
      for (const [word, spelling] of Object.entries(EMERGENCY_PRONUNCIATIONS)) {
        entries.set(word, spelling.split(/\s+/));
      }
      dictionary = entries;
      dictionarySource = 'emergency';
      return entries;
    }
  })();
  return dictionaryPromise;
}

/** Warm the dictionary and the saved hints before the first render. */
export async function preparePronunciation(): Promise<void> {
  await loadDictionary();
  readHints();
}

// ---------------------------------------------------------------------------
// Pronunciation hints (browser storage)
// ---------------------------------------------------------------------------

const HINTS_STORAGE_KEY = 'vocalis_pronunciation_hints';

interface HintEntry {
  word: string;
  phones: string[];
}

let hints: HintEntry[] | null = null;

function readHints(): HintEntry[] {
  if (hints) return hints;
  if (typeof localStorage === 'undefined') {
    hints = [];
    return hints;
  }
  try {
    const raw = localStorage.getItem(HINTS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as HintEntry[]) : [];
    hints = Array.isArray(parsed)
      ? parsed.filter((entry) => typeof entry?.word === 'string' && Array.isArray(entry?.phones))
      : [];
  } catch {
    // Corrupt storage must not stop the app from speaking.
    hints = [];
  }
  return hints;
}

function persistHints(): void {
  if (typeof localStorage === 'undefined' || !hints) return;
  try {
    localStorage.setItem(HINTS_STORAGE_KEY, JSON.stringify(hints));
  } catch {
    // Storage can be full or blocked; the hints simply will not persist.
  }
}

export function getPronunciationHints(): Array<{ word: string; phones: string[] }> {
  return readHints().map((entry) => ({ word: entry.word, phones: [...entry.phones] }));
}

export function removePronunciationHint(word: string): void {
  const key = word.trim().toLowerCase();
  hints = readHints().filter((entry) => entry.word !== key);
  persistHints();
}

/** Split a spelling like `["HH", "AH0", "L", "OW1"]` into stressed phone tokens. */
export function splitStress(spelling: string[]): PhoneToken[] {
  return spelling.map((entry) => {
    const bare = entry.toUpperCase().replace(/[012]$/, '');
    const digit = entry.match(/([012])$/)?.[1] as Stress | undefined;
    return {
      phone: bare === 'AX' ? 'AH' : bare,
      stress: digit ?? (VOWELS.has(bare) ? '1' : '0'),
      wordIndex: -1,
    };
  });
}

/**
 * Save a pronunciation for a word.
 *
 * The spelling is validated against the phone inventory: a hint that names a
 * phone this pipeline cannot render would produce silence, so it is refused and
 * the caller is told why. Returns true when the hint was stored.
 */
export async function savePronunciationHint(word: string, spelling: string): Promise<boolean> {
  const key = word.trim().toLowerCase();
  if (!key) return false;
  const phones = spelling.trim().toUpperCase().split(/[\s,]+/).filter(Boolean);
  if (!phones.length) return false;
  for (const phone of phones) {
    if (!isKnownPhone(phone)) return false;
  }
  const tokens = splitStress(phones);
  if (!tokens.some((token) => VOWELS.has(token.phone))) return false;
  const stored = readHints().filter((entry) => entry.word !== key);
  stored.push({ word: key, phones: tokens.map((token) => token.phone + (VOWELS.has(token.phone) ? token.stress : '')) });
  hints = stored;
  persistHints();
  return true;
}

// ---------------------------------------------------------------------------
// Grapheme rules
// ---------------------------------------------------------------------------

interface GraphemeRule {
  pattern: RegExp;
  phones: string[];
}

/** Suffixes, most specific first. Only applied when a stem precedes them. */
const SUFFIX_RULES: GraphemeRule[] = [
  { pattern: /^ation/, phones: ['EY1', 'SH', 'AH0', 'N'] },
  { pattern: /^ition/, phones: ['IH1', 'SH', 'AH0', 'N'] },
  { pattern: /^otion/, phones: ['OW1', 'SH', 'AH0', 'N'] },
  { pattern: /^ution/, phones: ['Y', 'UW1', 'SH', 'AH0', 'N'] },
  { pattern: /^tion/, phones: ['SH', 'AH0', 'N'] },
  { pattern: /^sion/, phones: ['ZH', 'AH0', 'N'] },
  { pattern: /^ture/, phones: ['CH', 'ER0'] },
  { pattern: /^sure/, phones: ['ZH', 'ER0'] },
  { pattern: /^ious/, phones: ['IY0', 'AH0', 'S'] },
  { pattern: /^ous/, phones: ['AH0', 'S'] },
  { pattern: /^ive/, phones: ['IH0', 'V'] },
  { pattern: /^ing/, phones: ['IH0', 'NG'] },
  { pattern: /^able/, phones: ['AH0', 'B', 'AH0', 'L'] },
  { pattern: /^ible/, phones: ['IH0', 'B', 'AH0', 'L'] },
  { pattern: /^ical/, phones: ['IH0', 'K', 'AH0', 'L'] },
  { pattern: /^ance/, phones: ['AH0', 'N', 'S'] },
  { pattern: /^ence/, phones: ['AH0', 'N', 'S'] },
  { pattern: /^ment/, phones: ['M', 'AH0', 'N', 'T'] },
  { pattern: /^ness/, phones: ['N', 'AH0', 'S'] },
  { pattern: /^less/, phones: ['L', 'AH0', 'S'] },
  { pattern: /^ful/, phones: ['F', 'AH0', 'L'] },
  { pattern: /^ly/, phones: ['L', 'IY0'] },
  { pattern: /^est/, phones: ['AH0', 'S', 'T'] },
  { pattern: /^er/, phones: ['ER0'] },
  { pattern: /^al/, phones: ['AH0', 'L'] },
  { pattern: /^ic/, phones: ['IH0', 'K'] },
  { pattern: /^ed/, phones: ['D'] },
  { pattern: /^es/, phones: ['IH0', 'Z'] },
  { pattern: /^s/, phones: ['Z'] },
];

/** Onsets and vowel clusters, longest match first. */
const ONSET_RULES: GraphemeRule[] = [
  { pattern: /^tch/, phones: ['CH'] },
  { pattern: /^dge/, phones: ['JH'] },
  { pattern: /^ough/, phones: ['AO1', 'F'] },
  { pattern: /^air/, phones: ['EH1', 'R'] },
  { pattern: /^are/, phones: ['AA1', 'R'] },
  { pattern: /^ear/, phones: ['IY1', 'R'] },
  { pattern: /^our/, phones: ['AO1', 'R'] },
  { pattern: /^ore/, phones: ['AO1', 'R'] },
  { pattern: /^qu/, phones: ['K', 'W'] },
  { pattern: /^ck/, phones: ['K'] },
  { pattern: /^ch/, phones: ['CH'] },
  { pattern: /^sh/, phones: ['SH'] },
  { pattern: /^ph/, phones: ['F'] },
  { pattern: /^th/, phones: ['TH'] },
  { pattern: /^wh/, phones: ['W'] },
  { pattern: /^wr/, phones: ['R'] },
  { pattern: /^kn/, phones: ['N'] },
  { pattern: /^gn/, phones: ['N'] },
  { pattern: /^mb/, phones: ['M'] },
  { pattern: /^ng/, phones: ['NG'] },
  { pattern: /^nk/, phones: ['NG', 'K'] },
  { pattern: /^gh/, phones: [] },
  { pattern: /^ee/, phones: ['IY1'] },
  { pattern: /^ea/, phones: ['IY1'] },
  { pattern: /^oo/, phones: ['UW1'] },
  { pattern: /^ou/, phones: ['AW1'] },
  { pattern: /^ow/, phones: ['OW1'] },
  { pattern: /^oi/, phones: ['OY1'] },
  { pattern: /^oy/, phones: ['OY1'] },
  { pattern: /^ai/, phones: ['EY1'] },
  { pattern: /^ay/, phones: ['EY1'] },
  { pattern: /^au/, phones: ['AO1'] },
  { pattern: /^aw/, phones: ['AO1'] },
  { pattern: /^ei/, phones: ['EY1'] },
  { pattern: /^ey/, phones: ['IY0'] },
  { pattern: /^ie/, phones: ['AY1'] },
  { pattern: /^ue/, phones: ['UW1'] },
  { pattern: /^ar/, phones: ['AA1', 'R'] },
  { pattern: /^or/, phones: ['AO1', 'R'] },
  { pattern: /^er/, phones: ['ER1'] },
  { pattern: /^ir/, phones: ['ER1'] },
  { pattern: /^ur/, phones: ['ER1'] },
  { pattern: /^x/, phones: ['K', 'S'] },
  { pattern: /^j/, phones: ['JH'] },
  { pattern: /^z/, phones: ['Z'] },
  { pattern: /^c(?=[eiy])/, phones: ['S'] },
  { pattern: /^g(?=[eiy])/, phones: ['JH'] },
  { pattern: /^y(?=[aeiouy])/, phones: ['Y'] },
  { pattern: /^a/, phones: ['AE1'] },
  { pattern: /^e/, phones: ['EH1'] },
  { pattern: /^i/, phones: ['IH1'] },
  { pattern: /^o/, phones: ['AA1'] },
  { pattern: /^u/, phones: ['AH1'] },
  { pattern: /^y/, phones: ['IH1'] },
];

const SINGLE_LETTERS: Record<string, string[]> = {
  b: ['B'], c: ['K'], d: ['D'], f: ['F'], g: ['G'], h: ['HH'], j: ['JH'], k: ['K'],
  l: ['L'], m: ['M'], n: ['N'], p: ['P'], q: ['K'], r: ['R'], s: ['S'], t: ['T'],
  v: ['V'], w: ['W'], x: ['K', 'S'], z: ['Z'],
};

const FUNCTION_WORDS: Record<string, string[]> = {
  the: ['DH', 'AH0'], a: ['AH0'], an: ['AE1', 'N'], to: ['T', 'UW1'], of: ['AH0', 'V'],
  and: ['AE1', 'N', 'D'], i: ['AY1'], are: ['AA1', 'R'], was: ['W', 'AA1', 'Z'],
  been: ['B', 'IH1', 'N'], have: ['HH', 'AE1', 'V'], has: ['HH', 'AE1', 'Z'],
  do: ['D', 'UW1'], does: ['D', 'AH1', 'Z'], as: ['AE1', 'Z'], at: ['AE1', 'T'],
  us: ['AH1', 'S'], but: ['B', 'AH1', 'T'], not: ['N', 'AA1', 'T'],
  for: ['F', 'AO1', 'R'], can: ['K', 'AE1', 'N'], than: ['DH', 'AE1', 'N'],
  that: ['DH', 'AE1', 'T'], with: ['W', 'IH1', 'DH'],
};

/** True when a final E is silent and lengthens the vowel before it: "made", "kite". */
function hasMagicE(word: string): boolean {
  return /[^aeiouy][aeiouy][^aeiouy]?e$/.test(word) && /[aeiouy]/.test(word.slice(0, -2));
}

/**
 * The long counterpart of each short vowel.
 *
 * Keyed by the symbols the onset rules actually emit, not by letter names, or a
 * silent E would never find the vowel it is supposed to lengthen: "made" would
 * come out as M AE1 D instead of M EY1 D.
 */
const LONG_FORM: Record<string, string[]> = {
  AE: ['EY1'],
  EH: ['IY1'],
  IH: ['AY1'],
  AA: ['OW1'],
  AH: ['Y', 'UW1'],
  UH: ['UW1'],
  AO: ['OW1'],
  ER: ['ER1'],
  EY: ['EY1'],
  IY: ['IY1'],
  AY: ['AY1'],
  OW: ['OW1'],
  UW: ['UW1'],
};

/**
 * Spell a word out loud.
 *
 * This is the last resort, used when neither a saved hint nor the dictionary
 * knows the word. It is a small, explainable rule set: function words, single
 * letters, suffixes that need a stem, onset clusters longest-first, then single
 * characters. Vowel reduction in unstressed syllables is approximate, which is
 * why every word that comes through here is reported in `guessedWords`.
 */
export function graphemesToPhones(word: string, wordIndex = 0): PhoneToken[] {
  const cleaned = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!cleaned) return [];

  const tokens: PhoneToken[] = [];
  const push = (phone: string, stress?: Stress) => {
    const bare = phone.replace(/[012]$/, '');
    const digit = phone.match(/([012])$/)?.[1];
    tokens.push({
      phone: bare === 'AX' ? 'AH' : bare,
      stress: (digit ?? (VOWELS.has(bare) ? '1' : '0')) as Stress,
      wordIndex,
    });
  };

  if (FUNCTION_WORDS[cleaned]) {
    for (const phone of FUNCTION_WORDS[cleaned]) push(phone);
    return tokens;
  }

  // A single letter is spelled out, not sounded: "a" as a word is a schwa, but
  // "x" in "x ray" is the letter name.
  if (cleaned.length === 1 && !/^[aeiou]$/.test(cleaned)) {
    for (const phone of letterToPhones(cleaned)) push(phone);
    return tokens;
  }

  let rest = cleaned;
  if (hasMagicE(rest)) rest = rest.slice(0, -1);

  while (rest.length) {
    const character = rest[0];
    if (character === "'") {
      rest = rest.slice(1);
      continue;
    }

    let matched = false;

    // Suffix rules need a stem to attach to.
    if (tokens.length) {
      for (const rule of SUFFIX_RULES) {
        const consumed = rest.match(rule.pattern)?.[0];
        if (!consumed || consumed.length >= rest.length + 1) continue;
        if (consumed.length === rest.length && tokens.length) {
          for (const phone of rule.phones) push(phone);
          rest = '';
          matched = true;
          break;
        }
        if (consumed.length < rest.length) {
          for (const phone of rule.phones) push(phone);
          rest = rest.slice(consumed.length);
          matched = true;
          break;
        }
      }
      if (matched) continue;
    }

    for (const rule of ONSET_RULES) {
      const consumed = rest.match(rule.pattern)?.[0];
      // An empty match would spin here forever, so it does not count as a match.
      if (!consumed) continue;
      for (const phone of rule.phones) push(phone);
      rest = rest.slice(consumed.length);
      matched = true;
      break;
    }
    if (matched) continue;

    const phones = SINGLE_LETTERS[character];
    if (phones) {
      for (const phone of phones) push(phone);
    } else if (VOWELS.has(character.toUpperCase())) {
      push(character.toUpperCase());
    }
    rest = rest.slice(1);
  }

  // Lengthen the vowel a silent E was lengthening.
  if (hasMagicE(cleaned)) {
    for (let i = tokens.length - 1; i >= 0; i -= 1) {
      const vowel = tokens[i].phone;
      if (!LONG_FORM[vowel]) continue;
      const long = LONG_FORM[vowel];
      tokens.splice(i, 1, ...long.map((phone, offset) => ({
        phone,
        stress: (offset === 0 ? tokens[i].stress : '0') as Stress,
        wordIndex,
      })));
      break;
    }
  }

  if (!tokens.some((token) => token.stress !== '0')) {
    const firstVowel = tokens.find((token) => VOWELS.has(token.phone));
    if (firstVowel) firstVowel.stress = '1';
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Accent
// ---------------------------------------------------------------------------

/**
 * Apply accent rules to a whole phone stream.
 *
 * Running per word loses the linking R: "far away" keeps its R in every rhotic
 * account of English and in careful non-rhotic speech, and only a whole-stream
 * view can see that the next phone is a vowel. For UK and AU the rule is:
 * drop an R that follows a vowel and is not itself followed by a vowel, and
 * lengthen the vowel it followed, because that is what the accent actually does
 * to the syllable.
 *
 * This is a rule-based approximation over US recordings, not a regional speaker.
 */
export function applyAccentTokens(tokens: PhoneToken[], accent: AccentCode): PhoneToken[] {
  if (accent === 'US' || accent === 'Global') {
    return tokens.map((token) => ({ ...token }));
  }
  const out: PhoneToken[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const previous = out[out.length - 1];
    const next = tokens[index + 1];
    const postVocalic = token.phone === 'R' && previous !== undefined && VOWELS.has(previous.phone);
    const linking = next !== undefined && (VOWELS.has(next.phone) || next.phone === 'R');
    if (postVocalic && !linking) {
      if (previous) previous.long = true;
      continue;
    }
    out.push({ ...token });
  }
  return out;
}

/** Accent rules over a plain list of spelled phones, for callers without tokens. */
export function applyAccent(phones: string[], accent: AccentCode): string[] {
  const tokens = splitStress(phones).map((token, index) => ({ ...token, wordIndex: index }));
  return applyAccentTokens(tokens, accent).map((token) =>
    VOWELS.has(token.phone) ? token.phone + token.stress : token.phone,
  );
}

// ---------------------------------------------------------------------------
// Words to phones
// ---------------------------------------------------------------------------

interface WordPhones {
  tokens: PhoneToken[];
  guessed: boolean;
}

/**
 * Phones for one spoken word, in priority order: saved hint, dictionary,
 * emergency list, then our own grapheme rules.
 *
 * `AX` is normalised to `AH` here rather than in the dictionary, because the
 * bundled file contains no `AX` at all and a user's hint might.
 */
async function phonesForWord(
  word: string,
  dict: Map<string, string[]>,
  wordIndex: number,
): Promise<WordPhones> {
  const key = word.toLowerCase().replace(/[.’']/g, "'");
  const hint = readHints().find((entry) => entry.word === key);
  if (hint) {
    return { tokens: splitStress(hint.phones).map((token) => ({ ...token, wordIndex })), guessed: false };
  }
  const spelling = dict.get(key) ?? dict.get(key.replace(/'/g, ''));
  if (spelling) {
    return { tokens: splitStress(spelling).map((token) => ({ ...token, wordIndex })), guessed: false };
  }
  const tokens = graphemesToPhones(word, wordIndex);
  // A single letter is always spelled out by rule — initials, and the letters of
  // an acronym — so it is not a guess about a word and must not be reported as one.
  const spelledLetter = /^[A-Za-z]$/.test(word);
  return { tokens, guessed: tokens.length > 0 && !spelledLetter };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Analyse a passage into words, phones, spans and boundaries.
 *
 * Three passes, because each one needs the previous one's output:
 *   1. tokens → spoken words, with the character span each came from
 *   2. spoken words → phones, with each phone knowing its word
 *   3. accent rules over the whole phone stream, then boundary strengths
 *
 * A word index is carried on every phone from the moment it is created, so no
 * later pass has to re-derive which word a phone belongs to.
 */
export async function analyzeText(text: string, accent: AccentCode = 'US'): Promise<Utterance> {
  const sourceText = text ?? '';
  const utterance: Utterance = {
    sourceText,
    accent,
    words: [],
    phones: [],
    guessedWords: [],
    rejectedTokens: [],
  };
  if (!sourceText.trim()) return utterance;

  const dict = await loadDictionary();
  const tokens = tokenize(sourceText);

  // Pass 1 and 2: spoken words and their phones, grouped by the source token
  // they came from. A boundary belongs to a token, not to each word of its
  // expansion, so "et cetera" gets one boundary after "cetera" and none between.
  interface Group {
    token: Token;
    words: Array<Omit<WordToken, 'boundaryAfter'>>;
  }
  const groups: Group[] = [];
  const draftWords: Array<Omit<WordToken, 'boundaryAfter'>> = [];
  const draftPhones: PhoneToken[] = [];

  for (const token of tokens) {
    if (token.kind === 'whitespace' || token.kind === 'punctuation') continue;

    const spoken = spokenFormsOf(token);
    if (!spoken.length) {
      if (!utterance.rejectedTokens.includes(token.text)) utterance.rejectedTokens.push(token.text);
      continue;
    }

    const group: Group = { token, words: [] };
    for (const [expansionIndex, surface] of spoken.entries()) {
      const { tokens: phones, guessed } = await phonesForWord(surface, dict, draftWords.length);
      if (guessed && !utterance.guessedWords.includes(surface)) utterance.guessedWords.push(surface);
      if (!phones.length) {
        if (!utterance.rejectedTokens.includes(token.text)) utterance.rejectedTokens.push(token.text);
        continue;
      }
      const draft: Omit<WordToken, 'boundaryAfter'> = {
        text: surface,
        // The first spoken word of an expansion owns the token's span; the rest
        // own nothing, so a highlight never invents characters.
        charIndex: token.charIndex,
        charLength: expansionIndex === 0 ? token.charLength : 0,
        phoneStart: draftPhones.length,
        phoneEnd: draftPhones.length + phones.length,
        guessed,
      };
      group.words.push(draft);
      draftWords.push(draft);
      draftPhones.push(...phones);
    }
    groups.push(group);
  }

  // Pass 3: accent rules over the whole stream, then boundaries.
  const phones = applyAccentTokens(draftPhones, accent);

  // An accent rule can delete a phone (a dropped post-vocalic R), so each word's
  // phone range is re-derived from the word index the phones carry rather than
  // from the offsets recorded before the accent pass.
  const ranges = draftWords.map(() => ({ start: -1, end: -1 }));
  for (const [index, token] of phones.entries()) {
    const range = ranges[token.wordIndex];
    if (!range) continue;
    range.start = range.start < 0 ? index : Math.min(range.start, index);
    range.end = Math.max(range.end, index + 1);
  }

  const words: WordToken[] = draftWords.map((draft, index) => ({
    ...draft,
    phoneStart: ranges[index].start < 0 ? draft.phoneStart : ranges[index].start,
    phoneEnd: ranges[index].end < 0 ? draft.phoneEnd : ranges[index].end,
    boundaryAfter: 'none' as BoundaryKind,
  }));

  // The boundary after a token's last spoken word is whatever punctuation sits
  // between it and the next spoken token, or between it and the end of the text.
  let cursor = 0;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (!group.words.length) continue;
    const lastWordIndex = cursor + group.words.length - 1;
    cursor += group.words.length;
    const next = groups[index + 1];
    const from = group.token.charIndex + group.token.charLength;
    const to = next ? next.token.charIndex : sourceText.length;
    words[lastWordIndex].boundaryAfter = scanBoundary(sourceText, tokens, from, to, group.token.text);
  }

  utterance.words = words;
  utterance.phones = phones;
  return utterance;
}

/**
 * Boundary strength from the raw source between two character offsets.
 *
 * Scanning the source rather than the token list keeps this correct for the last
 * word in a passage, where there is no following token to compare against.
 */
function scanBoundary(
  sourceText: string,
  tokens: Token[],
  from: number,
  to: number,
  previousWord: string,
): BoundaryKind {
  const between = tokens.filter(
    (token) => token.charIndex >= from && token.charIndex + token.charLength <= to,
  );
  let scanned = boundaryBetween(between, 0, between.length, previousWord);
  const raw = sourceText.slice(from, to);
  if (scanned === 'none') {
    if (raw.includes('\n')) return 'sentence';
    return raw.trim() ? 'word' : 'none';
  }
  // A full stop that `trailingBoundary` held back because the word before it is
  // an abbreviation still ends a sentence when the abbreviation is not a title
  // and the next word starts with a capital: "…and so on, etc. The room…" ends,
  // while "Dr. Smith" does not. A comma is never upgraded — it is a clause break
  // whatever follows it, capitalised or not.
  if (scanned === 'clause') {
    const bare = previousWord.replace(/[.’']/g, '').replace(/\./g, '').toLowerCase();
    const abbreviationPeriod =
      isAbbreviation(bare) && between.some((token) => token.kind === 'punctuation' && token.text === '.');
    const nextWord = sourceText.slice(to).replace(/^\s+/, '');
    if (abbreviationPeriod && !TITLES.has(bare) && /^[A-Z]/.test(nextWord)) scanned = 'sentence';
  }
  return scanned;
}

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------

/**
 * Split an utterance into segments at sentence boundaries only.
 *
 * This is the single most consequential decision in the pipeline. Silence is a
 * resource that exists at full stops, question marks, exclamation marks and line
 * breaks — nowhere else. Wrapping every word in pauses, which is what an earlier
 * version did, produced speech with 38 % of its duration in silence and a pace of
 * 94.8 words per minute: a person reading one word at a time.
 *
 * A clause boundary (comma, semicolon, colon, dash) keeps the words in the same
 * segment; the recorded `pau` units at segment ends carry the sentence pause, and
 * the prosody stage can shorten a clause break without inserting silence.
 */
export function segmentUtterance(utterance: Utterance): Segment[] {
  const segments: Segment[] = [];
  if (!utterance.words.length) return segments;

  let wordStart = 0;
  let phoneStart = utterance.words[0]?.phoneStart ?? 0;
  let terminal = '';

  const close = (wordEnd: number, phoneEnd: number) => {
    if (wordEnd < wordStart) return;
    segments.push({
      phones: utterance.phones.slice(phoneStart, phoneEnd),
      wordStart,
      wordEnd,
      terminal,
    });
  };

  for (let index = 0; index < utterance.words.length; index += 1) {
    const word = utterance.words[index];
    if (word.boundaryAfter !== 'sentence') continue;
    const phoneEnd = Math.max(word.phoneEnd, phoneStart);
    terminal = terminalPunctuation(utterance.sourceText, word);
    close(index, phoneEnd);
    wordStart = index + 1;
    phoneStart = phoneEnd;
    terminal = '';
  }

  const lastWord = utterance.words[utterance.words.length - 1];
  if (wordStart <= utterance.words.length - 1) {
    close(utterance.words.length - 1, Math.max(lastWord.phoneEnd, phoneStart));
  }

  // A segment with no phones at all cannot be rendered; drop it rather than
  // asking the synthesizer to assemble silence.
  return segments.filter((segment) => segment.phones.length > 0);
}

/** The sentence-ending punctuation after a word, if there is any. */
function terminalPunctuation(sourceText: string, word: WordToken): string {
  const tail = sourceText.slice(word.charIndex + word.charLength, word.charIndex + word.charLength + 4);
  const match = tail.match(/^[”"’')\]\s]*([.!?…])/);
  return match ? match[1] : '';
}
