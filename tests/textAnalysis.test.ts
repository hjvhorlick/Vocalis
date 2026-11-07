/**
 * Text analysis suite.
 *
 * This measures the stage that decides what gets said: tokenizing, number and
 * abbreviation expansion, the dictionary load, accent rules, grapheme fallback,
 * saved spellings, and the three passes that produce an `Utterance` and its
 * segments.
 *
 * The real bundled dictionary is used, read from disk through a small fetch
 * shim, so the suite exercises the same data the browser loads. No network, no
 * browser, no audio.
 *
 * Run with: npm run test:engine
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EMERGENCY_PRONUNCIATIONS,
  PAUSE,
  VOWELS,
  analyzeText,
  applyAccent,
  applyAccentTokens,
  boundaryBetween,
  digitsToWords,
  getDictionaryStats,
  getPronunciationHints,
  graphemesToPhones,
  isAbbreviation,
  isKnownPhone,
  letterToPhones,
  numberToWords,
  preparePronunciation,
  removePronunciationHint,
  savePronunciationHint,
  segmentUtterance,
  spokenFormsOf,
  splitStress,
  stronger,
  tokenize,
  trailingBoundary,
  type Token,
} from '../src/utils/textAnalysis';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Host stubs: the module reads a dictionary over fetch and saves spellings in
// localStorage. Both exist in Node for the duration of this suite.
// ---------------------------------------------------------------------------

const storage = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (key: string) => (storage.has(key) ? storage.get(key)! : null),
  setItem: (key: string, value: string) => {
    storage.set(key, String(value));
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => storage.clear(),
};

(globalThis as unknown as { fetch: unknown }).fetch = async (input: unknown) => {
  const url = String(typeof input === 'string' ? input : (input as { url?: string })?.url ?? '');
  if (!url.startsWith('/')) throw new Error(`test fetch cannot resolve ${url}`);
  const body = readFileSync(join(ROOT, 'public', url));
  return {
    ok: true,
    status: 200,
    url,
    text: async () => body.toString('utf8'),
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) passed += 1;
  else failures.push(detail ? `${label} — ${detail}` : label);
}

function eq(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  check(label, a === b, `expected ${b}, got ${a}`);
}

function notEmpty(label: string, value: unknown[]): void {
  check(label, Array.isArray(value) && value.length > 0, `got ${JSON.stringify(value)}`);
}

/** The spoken words for a piece of source text, across all of its tokens. */
function formsOf(text: string): string[] {
  return tokenize(text)
    .filter((token) => token.kind !== 'whitespace')
    .flatMap((token) => spokenFormsOf(token));
}

/**
 * The spoken words in lower case. `WordToken.text` keeps the casing the writer
 * used, because that is what the studio highlights; comparisons here are about
 * which words are said, not how they were capitalised.
 */
function spoken(text: string): string[] {
  return formsOf(text).map((word) => word.toLowerCase());
}

/** The phones for one spoken word, as a readable spelling. */
function spelling(words: string[], from: number, to: number): string[] {
  return words.slice(from, to);
}

async function phonesOf(text: string, accent: 'US' | 'UK' | 'AU' | 'Global' = 'US') {
  const utterance = await analyzeText(text, accent);
  return utterance.phones.map((phone) => phone.phone + (VOWELS.has(phone.phone) ? phone.stress : ''));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

await preparePronunciation();

// --- constants -------------------------------------------------------------
eq('PAUSE is the recorded silence phone', PAUSE, 'pau');
check('the vowel inventory is the ARPAbet set', VOWELS.has('AA') && VOWELS.has('EY') && VOWELS.size === 15, `${VOWELS.size} vowels`);
check('emergency pronunciations cover the most common words', ['the', 'a', 'and', 'you', 'hello'].every((word) => EMERGENCY_PRONUNCIATIONS[word]), 'missing a lifeboat word');
check(
  'every emergency pronunciation uses known phones',
  Object.values(EMERGENCY_PRONUNCIATIONS).every((entry) => entry.split(/\s+/).every(isKnownPhone)),
  'an emergency entry uses an unknown symbol',
);

// --- phone inventory -------------------------------------------------------
check('isKnownPhone accepts a stressed vowel', isKnownPhone('EY1'));
check('isKnownPhone accepts a bare consonant', isKnownPhone('th'));
check('isKnownPhone accepts the legacy schwa', isKnownPhone('AX'));
check('isKnownPhone accepts the silence phone', isKnownPhone('pau'));
check('isKnownPhone rejects an invented symbol', !isKnownPhone('ZZ'));
check('isKnownPhone rejects a bare stress digit', !isKnownPhone('1'));

// --- dictionary ------------------------------------------------------------
const stats = getDictionaryStats();
check('the bundled dictionary loaded from disk', stats.source === 'file', `source was ${stats.source}`);
eq('every pipe-delimited line became an entry', stats.entries, 124076);
eq('no line was rejected for an unknown phone', stats.rejectedTokens, 0);
eq('annotated lines are counted, not parsed as words', stats.annotatedLines, 16);
eq('no saved spellings at the start', stats.hints, 0);

await preparePronunciation();
eq('loading the dictionary twice does not duplicate it', getDictionaryStats().entries, 124076);

// --- tokenize --------------------------------------------------------------
const hello = tokenize('Hello, world.');
eq('a short sentence tokenizes into word, comma, space, word, stop', hello.map((t) => t.kind), [
  'word',
  'punctuation',
  'whitespace',
  'word',
  'punctuation',
]);
eq('token spans are exact', hello.map((t) => t.charIndex), [0, 5, 6, 7, 12]);
eq('token lengths are exact', hello.map((t) => t.charLength), [5, 1, 1, 5, 1]);
check('tokens reconstruct the source', hello.map((t) => t.text).join('') === 'Hello, world.');

eq('empty text yields no tokens', tokenize(''), []);
eq('whitespace only yields one whitespace token', tokenize('   ').map((t) => t.kind), ['whitespace']);

const highway = tokenize('I-70');
check('a hyphenated route terminates', highway.length >= 3, `${highway.length} tokens`);
eq('a hyphen separates the words of I-70', spoken('I-70'), ['i', 'seventy']);
eq('a hyphenated compound is two words', spoken('blue-green'), ['blue', 'green']);

eq('a leading minus belongs to the number', formsOf('-70'), ['negative', 'seventy']);
eq('a minus inside a sentence belongs to the number', formsOf('the -70 degree reading'), [
  'the',
  'negative',
  'seventy',
  'degree',
  'reading',
]);

const mixedSource = 'She paid $1,250.50 at 6:30 a.m. on Jan. 3rd.';
const mixed = tokenize(mixedSource);
check(
  'token spans never overlap and always advance',
  mixed.every((token, index) => index === 0 || token.charIndex >= mixed[index - 1].charIndex + mixed[index - 1].charLength),
  'a token span overlaps the previous one',
);
check('every token span lies inside the source', mixed.every((t) => t.charIndex + t.charLength <= mixedSource.length));
eq('tokens reconstruct a mixed sentence', mixed.map((t) => t.text).join(''), mixedSource);

// --- numbers ---------------------------------------------------------------
eq('zero is spoken', numberToWords(0), ['zero']);
eq('single digits are spoken', numberToWords(7), ['seven']);
eq('teens are spoken as teens', numberToWords(13), ['thirteen']);
eq('tens and units are spoken separately', numberToWords(21), ['twenty', 'one']);
eq('hundreds are spoken', numberToWords(100), ['one', 'hundred']);
eq('a hundred and something keeps the and', numberToWords(105), ['one', 'hundred', 'and', 'five']);
eq('thousands are spoken', numberToWords(1000), ['one', 'thousand']);
eq('a four-digit number keeps its groups', numberToWords(1250), [
  'one',
  'thousand',
  'two',
  'hundred',
  'and',
  'fifty',
]);
eq('a negative number is spoken once', numberToWords(-70), ['negative', 'seventy']);
eq('millions are spoken', numberToWords(2000000), ['two', 'million']);
eq('a number with commas is spoken as one number', numberToWords('1,975'), [
  'one',
  'thousand',
  'nine',
  'hundred',
  'and',
  'seventy',
  'five',
]);

eq('digits are read one at a time', digitsToWords('1975'), ['one', 'nine', 'seven', 'five']);
eq('a repeated zero reads as double zero', digitsToWords('007'), ['double zero', 'seven']);
eq('non-digits are ignored in digit mode', digitsToWords('555-0199'), [
  'five',
  'five',
  'five',
  'zero',
  'one',
  'nine',
  'nine',
]);

// --- money, times, percents, fractions ------------------------------------
eq('a dollar amount is spoken in full', formsOf('$1,250.50'), [
  'one',
  'thousand',
  'two',
  'hundred',
  'and',
  'fifty',
  'dollars',
  'and',
  'fifty',
  'cents',
]);
eq('one dollar is singular', formsOf('$1'), ['one', 'dollar']);
eq('a pound amount names the currency', formsOf('£20'), ['twenty', 'pounds']);
eq('a euro amount names the currency', formsOf('€5'), ['five', 'euros']);
eq('a percentage is spoken', formsOf('42%'), ['forty', 'two', 'percent']);
eq('a decimal percentage is spoken', formsOf('3.5%'), ['three', 'point', 'five', 'percent']);
eq('a decimal is spoken with point', formsOf('3.14'), ['three', 'point', 'one', 'four']);
eq('a clock time is spoken', formsOf('6:30'), ['six', 'thirty']);
eq("an exact hour says o'clock", formsOf('5:00'), ['five', "o'clock"]);
eq('a fraction is spoken with slash', formsOf('1/2'), ['one', 'slash', 'two']);
eq('a bare recent year reads as a year', formsOf('1975'), ['nineteen', 'seventy', 'five']);
eq('an ordinal suffix is spoken as an ordinal', spoken('3rd'), ['third']);
eq('a teen ordinal is spoken as an ordinal', spoken('21st'), ['twenty', 'first']);
eq('a hundredth is spoken in full', spoken('100th'), ['one', 'hundredth']);
eq('a second is spoken as second', spoken('2nd'), ['second']);
eq('an ordinal date reads as a date', spoken('Jan. 3rd'), ['january', 'third']);
eq('a negative ordinal keeps its sign', spoken('-3rd'), ['negative', 'third']);
eq('an ordinal suffix inside a longer word stays a word', spoken('3 street'), ['three', 'street']);
eq('a turn-of-century year reads as a year', formsOf('1900'), ['nineteen', 'hundred']);
eq('a large number is not read as a year', formsOf('2500'), ['two', 'thousand', 'five', 'hundred']);

// --- abbreviations ---------------------------------------------------------
check('a title is an abbreviation', isAbbreviation('Dr.'));
check('an abbreviation matches without its full stop', isAbbreviation('dr'));
check('a dotted time-of-day is an abbreviation', isAbbreviation('a.m.'));
check('an ordinary word is not an abbreviation', !isAbbreviation('Hello.'));
check('a plain word is not an abbreviation', !isAbbreviation('end'));

eq('a title expands', formsOf('Dr.'), ['doctor']);
eq('a street abbreviation expands', formsOf('St.'), ['saint']);
eq('a dotted time of day expands to letter names', formsOf('a.m.'), ['ay', 'em']);
eq('an afternoon time expands', formsOf('p.m.'), ['pee', 'em']);
eq('a Latin abbreviation expands', formsOf('e.g.'), ['for', 'example']);
eq('that-is expands', formsOf('i.e.'), ['that', 'is']);
eq('a trailing etc expands to two words', formsOf('etc.'), ['et', 'cetera']);
eq('a month abbreviation expands', formsOf('Jan.'), ['january']);
eq('a measure abbreviation expands', formsOf('5 km'), ['five', 'kilometres']);
eq('an ampersand is spoken as and', spoken('A & B'), ['a', 'and', 'b']);
eq('a two-letter acronym reads as letters', spoken('US'), ['u', 's']);

// --- letters ---------------------------------------------------------------
eq('the letter A is ay', letterToPhones('a'), ['EY1']);
eq('the letter B is bee', letterToPhones('B'), ['B', 'IY1']);
eq('the letter X is ex', letterToPhones('x'), ['EH1', 'K', 'S']);
eq('the letter Q is kyoo', letterToPhones('q'), ['K', 'Y', 'UW1']);
eq('the letter W is double-u', letterToPhones('w'), ['D', 'AH1', 'B', 'AH0', 'L', 'Y', 'UW0']);
eq('a non-letter has no phones', letterToPhones('?'), []);
check(
  'every letter of the alphabet can be spoken',
  'abcdefghijklmnopqrstuvwxyz'.split('').every((letter) => letterToPhones(letter).length > 0),
  'a letter has no pronunciation',
);
check(
  'every letter pronunciation uses known phones',
  'abcdefghijklmnopqrstuvwxyz'
    .split('')
    .flatMap(letterToPhones)
    .every(isKnownPhone),
  'a letter uses an unknown symbol',
);

// --- boundaries ------------------------------------------------------------
eq('a sentence beats a clause', stronger('word', 'sentence'), 'sentence');
eq('a clause beats a word', stronger('clause', 'word'), 'clause');
eq('the stronger of two equals is unchanged', stronger('none', 'none'), 'none');

const stop: Token = { text: '.', charIndex: 5, charLength: 1, kind: 'punctuation' };
const comma: Token = { text: ',', charIndex: 5, charLength: 1, kind: 'punctuation' };
const word: Token = { text: 'trail', charIndex: 0, charLength: 5, kind: 'word' };
eq('a full stop ends a sentence', trailingBoundary(stop, 'world'), 'sentence');
eq('a full stop after a title does not end a sentence', trailingBoundary(stop, 'Dr'), 'clause');
eq('a full stop after an initial does not end a sentence', trailingBoundary(stop, 'K'), 'clause');
eq('a comma is a clause boundary', trailingBoundary(comma, 'trail'), 'clause');
eq('a word token carries no boundary', trailingBoundary(word), 'none');

const paragraph = tokenize('One line\n\nNext line');
const breakBoundary = boundaryBetween(paragraph, 2, 4, 'line');
eq('a blank line is a sentence boundary', breakBoundary, 'sentence');
const sentenceTokens = tokenize('Stop. Go');
eq('a full stop between tokens is a sentence boundary', boundaryBetween(sentenceTokens, 1, 3, 'Stop'), 'sentence');
const plainTokens = tokenize('two words');
eq('a plain space is a word boundary', boundaryBetween(plainTokens, 1, 2, 'two'), 'word');

// --- stress splitting ------------------------------------------------------
const stressed = splitStress(['HH', 'AH0', 'L', 'OW1']);
eq('splitStress keeps the phone order', stressed.map((t) => t.phone), ['HH', 'AH', 'L', 'OW']);
eq('splitStress reads the stress digits', stressed.map((t) => t.stress), ['0', '0', '0', '1']);
eq('splitStress converts the legacy schwa', splitStress(['AX1']).map((t) => t.phone), ['AH']);
eq('an unmarked vowel defaults to primary stress', splitStress(['AE']).map((t) => t.stress), ['1']);
eq('an unmarked consonant defaults to no stress', splitStress(['T']).map((t) => t.stress), ['0']);

// --- accent rules ----------------------------------------------------------
eq('American English keeps its R', applyAccent(['K', 'AA1', 'R'], 'US'), ['K', 'AA1', 'R']);
eq('British English drops a post-vocalic R', applyAccent(['K', 'AA1', 'R'], 'UK'), ['K', 'AA1']);
eq('a global accent keeps its R', applyAccent(['K', 'AA1', 'R'], 'Global'), ['K', 'AA1', 'R']);
eq('an Australian accent drops a post-vocalic R', applyAccent(['F', 'AA1', 'R'], 'AU'), ['F', 'AA1']);
eq('a consonant R after another consonant stays', applyAccent(['B', 'R', 'EH1', 'D'], 'UK'), [
  'B',
  'R',
  'EH1',
  'D',
]);

const dropped = applyAccentTokens(splitStress(['K', 'AA1', 'R']), 'UK');
eq('a dropped R leaves two phones', dropped.length, 2);
check('the vowel before a dropped R is marked long', dropped[1].long === true, 'no long flag');
check('an American rendering marks nothing long', applyAccentTokens(splitStress(['K', 'AA1', 'R']), 'US').every((t) => !t.long));

const carParkUk = await phonesOf('The car park is far.', 'UK');
const carParkUs = await phonesOf('The car park is far.', 'US');
eq('British English removes three post-vocalic R phones', carParkUs.length - carParkUk.length, 3);
eq('American English keeps fourteen phones for that sentence', carParkUs.length, 14);
const carParkUkTokens = (await analyzeText('The car park is far.', 'UK')).phones;
eq('each removed R lengthened its vowel', carParkUkTokens.filter((t) => t.long).length, 3);

const linkingUk = (await analyzeText('The car is far away.', 'UK')).phones;
const linkingUs = (await analyzeText('The car is far away.', 'US')).phones;
eq('a linking R before a vowel survives in British English', linkingUk.length, linkingUs.length);
check('a linking R leaves nothing marked long', linkingUk.every((t) => !t.long), 'unexpected long flag');

// --- dictionary-backed pronunciation --------------------------------------
const made = await phonesOf('I made the nation a condition.');
check('a long-A word keeps its dictionary spelling', made.includes('EY1'), made.join(' '));
const nation = await analyzeText('nation');
eq('nation keeps its five dictionary phones', nation.words[0].phoneEnd - nation.words[0].phoneStart, 5);
eq('nation is not guessed', nation.guessedWords, []);
const condition = await analyzeText('condition');
eq('condition keeps its eight dictionary phones', condition.words[0].phoneEnd - condition.words[0].phoneStart, 8);

// --- grapheme fallback -----------------------------------------------------
eq('an empty word has no phones', graphemesToPhones(''), []);
eq('a numeric string has no grapheme phones', graphemesToPhones('123'), []);
notEmpty('an invented word still gets phones', graphemesToPhones('zanthorian'));
check(
  'grapheme phones are all in the inventory',
  graphemesToPhones('zanthorianvelmirrakesselheim').every((token) => isKnownPhone(token.phone)),
  'an invented symbol appeared',
);
check(
  'a grapheme word contains at least one vowel',
  graphemesToPhones('zanthorian').some((token) => VOWELS.has(token.phone)),
  'no vowel in an invented word',
);
const indexed = graphemesToPhones('abc', 3);
notEmpty('a grapheme word produces phones', indexed);
eq('graphemesToPhones carries the word index through', indexed.every((token) => token.wordIndex === 3), true);

// --- saved spellings -------------------------------------------------------
eq('a spelling without a vowel is refused', await savePronunciationHint('brk', 'B R K'), false);
eq('a spelling with an unknown phone is refused', await savePronunciationHint('cat', 'K AE1 ZZ'), false);
eq('an empty word is refused', await savePronunciationHint('', 'K AE1 T'), false);
eq('a valid spelling is accepted', await savePronunciationHint('Zanthor', 'Z AE1 N TH AO2 R'), true);
eq('one spelling is stored', getPronunciationHints().length, 1);
eq('a stored spelling is normalised to lower case', getPronunciationHints()[0].word, 'zanthor');
eq('the dictionary reports the stored spelling', getDictionaryStats().hints, 1);

const hinted = await analyzeText('Zanthor arrived.');
eq('a saved spelling stops the word being guessed', hinted.guessedWords, []);
eq('a saved spelling is used as given', spelling((await phonesOf('Zanthor')), 0, 5), ['Z', 'AE1', 'N', 'TH', 'AO2']);

await savePronunciationHint('zanthor', 'Z AH0 N TH AO1 R');
eq('saving the same word twice replaces it', getPronunciationHints().length, 1);
removePronunciationHint('Zanthor');
eq('a saved spelling can be removed', getPronunciationHints().length, 0);
eq('the dictionary reports no spellings after removal', getDictionaryStats().hints, 0);

const unhinted = await analyzeText('Zanthor arrived.');
notEmpty('an unknown name is reported as guessed once more', unhinted.guessedWords);

// --- analyzeText structure -------------------------------------------------
const utterance = await analyzeText('Author of the danger trail, Philip Ross.');
notEmpty('a sentence produces words', utterance.words);
eq('the source text is kept', utterance.sourceText, 'Author of the danger trail, Philip Ross.');
eq('the accent is recorded', utterance.accent, 'US');
eq('every word maps onto a phone span', utterance.words.map((w) => w.phoneEnd > w.phoneStart), [true, true, true, true, true, true, true]);
eq('word phone spans start where the previous ended', utterance.words.map((w) => w.phoneStart), utterance.words.map((w, i) => (i === 0 ? 0 : utterance.words[i - 1].phoneEnd)));
eq('the phone stream ends with the last word', utterance.words.at(-1)!.phoneEnd, utterance.phones.length);
eq('no silence phone is inserted into the phone stream', utterance.phones.filter((p) => p.phone === PAUSE).length, 0);
eq('word character offsets never go backwards', utterance.words.map((w) => w.charIndex), utterance.words.map((w) => w.charIndex).sort((a, b) => a - b));
check('every word span lies inside the source', utterance.words.every((w) => w.charIndex + w.charLength <= utterance.sourceText.length));
check(
  'every letter of the source is covered by a word span',
  [...utterance.sourceText].every(
    (character, index) =>
      !/[a-z0-9]/i.test(character) ||
      utterance.words.some((w) => index >= w.charIndex && index < w.charIndex + w.charLength),
  ),
  'a character of the source produced no speech',
);
eq('a comma is a clause boundary, not a sentence', utterance.words[4].boundaryAfter, 'clause');
eq('the last word of a sentence carries the sentence boundary', utterance.words.at(-1)!.boundaryAfter, 'sentence');
eq('the first spoken word is the first source word', utterance.words[0].text.toLowerCase(), 'author');
eq('a word is spoken as the writer typed it, in lower case', utterance.words[0].text.toLowerCase(), 'author');

const title = await analyzeText('Dr. Smith arrived.');
eq('a title expands and does not end the sentence', title.words.map((w) => w.text.toLowerCase()), ['doctor', 'smith', 'arrived']);
eq('a title leaves one segment', segmentUtterance(title).length, 1);
eq('no word after a title is guessed', title.guessedWords, []);

const dottedTime = await analyzeText('Meet at 6:30 a.m. tomorrow.');
eq('a dotted time of day expands', dottedTime.words.map((w) => w.text.toLowerCase()).slice(0, 4), ['meet', 'at', 'six', 'thirty']);
eq('a dotted time of day leaves one segment', segmentUtterance(dottedTime).length, 1);
eq('a dotted time of day guesses nothing', dottedTime.guessedWords, []);

const money = await analyzeText('It costs $1,250.50 today.');
eq('a dollar amount expands to ten spoken words inside the sentence', money.words.length, 13);
eq('the amount keeps the source span on its first word', money.words[2].charLength, 9);
eq('later words of an expansion have a zero-length span', money.words[3].charLength, 0);
eq('money guesses nothing', money.guessedWords, []);

const sign = await analyzeText('The temperature fell to -70 degrees.');
eq('a minus sign is spoken once', sign.words.filter((w) => w.text === 'negative').length, 1);
eq('a signed number keeps its digits', sign.words.map((w) => w.text).includes('seventy'), true);

const unicodeSign = await analyzeText('A −70 reading.');
eq('a typographic minus is spoken once', unicodeSign.words.filter((w) => w.text === 'negative').length, 1);

const nothing = await analyzeText('');
eq('empty text produces no words', nothing.words, []);
eq('empty text produces no phones', nothing.phones, []);
eq('empty text produces no segments', segmentUtterance(nothing), []);

const punctuation = await analyzeText('... !!! ???');
eq('punctuation only produces no words', punctuation.words, []);
eq('punctuation only produces no segments', segmentUtterance(punctuation), []);

const letters = await analyzeText('J.K. Rowling wrote it.');
eq('initials are spoken as letters', letters.words.slice(0, 2).map((w) => w.text.toLowerCase()), ['j', 'k']);
eq('initials do not end a sentence', letters.words[1].boundaryAfter, 'clause');
eq('the two initials are not reported as guessed', letters.guessedWords.filter((w) => w.toLowerCase() !== 'rowling'), []);
eq('an unknown surname IS reported as guessed', letters.guessedWords.map((w) => w.toLowerCase()), ['rowling']);
eq('a guessed word still reaches the audio', letters.words[2].phoneEnd > letters.words[2].phoneStart, true);

const repeated = await analyzeText(Array(400).fill('the').join(' '));
eq('a long run of identical words stays one segment', segmentUtterance(repeated).length, 1);
eq('every repeated word is spoken', repeated.words.length, 400);
eq('repeated words share one phone stream', repeated.phones.length > 400, true);

const acronym = await analyzeText('NASA launched it.');
eq('an acronym is spoken letter by letter', acronym.words.slice(0, 4).map((w) => w.text.toLowerCase()), ['n', 'a', 's', 'a']);
eq('an acronym is not reported as guessed', acronym.guessedWords, []);
check('every letter of an acronym has phones', acronym.words.slice(0, 4).every((w) => w.phoneEnd > w.phoneStart));

// --- segmentation ----------------------------------------------------------
const threeSentences = await analyzeText('Hello there. How are you? Fine, thanks!');
const threeSegments = segmentUtterance(threeSentences);
eq('three sentences make three segments', threeSegments.length, 3);
eq('segment terminals are the punctuation that closed them', threeSegments.map((s) => s.terminal), ['.', '?', '!']);
eq('segments cover every word once', threeSegments.map((s) => s.wordEnd - s.wordStart + 1), [2, 3, 2]);
eq('segments start where the previous ended', threeSegments.map((s) => s.wordStart), [0, 2, 5]);
eq('segment phones are the utterance phones in order', threeSegments.flatMap((s) => s.phones.map((p) => p.phone)).join(''), threeSentences.phones.map((p) => p.phone).join(''));

const paragraphText = await analyzeText('First sentence here.\nSecond sentence follows.\n\nThird after a break.');
const paragraphSegments = segmentUtterance(paragraphText);
eq('line breaks segment a paragraph', paragraphSegments.length, 3);

const dialogue = await analyzeText('Are you coming\nYes I am');
eq('a newline alone is a sentence boundary', segmentUtterance(dialogue).length, 2);

const trailing = await analyzeText('This has no ending');
eq('text without punctuation still makes one segment', segmentUtterance(trailing).length, 1);
eq('an unpunctuated ending has an empty terminal', segmentUtterance(trailing)[0].terminal, '');
eq('the last word of unpunctuated text carries no boundary', trailing.words.at(-1)!.boundaryAfter, 'none');

const quoted = await analyzeText('She said "wait here." Then she left.');
eq('a closing quote does not hide the sentence boundary', segmentUtterance(quoted).length, 2);

const longClause = await analyzeText('One, two, three, four and five.');
eq('commas do not split a sentence into segments', segmentUtterance(longClause).length, 1);

// --- signs, abbreviations and expansions that must not be dropped ----------
const signChecks: Array<[string, string[]]> = [
  ['$5', ['five', 'dollars']],
  ['−3', ['negative', 'three']],
  ['12%', ['twelve', 'percent']],
  ['1/4', ['one', 'slash', 'four']],
  ['No. 7', ['no', 'seven']],
  ['the 1st', ['the', 'first']],
];
for (const [text, expected] of signChecks) {
  const said = (await analyzeText(text)).words.map((w) => w.text.toLowerCase());
  eq(`"${text}" is spoken as ${expected.join(' ')}`, said, expected);
}

const abbreviationChecks: Array<[string, string]> = [
  ['Mr. Jones', 'mister jones'],
  ['Mrs. Jones', 'missus jones'],
  ['Prof. Lee', 'professor lee'],
  ['5 lbs', 'five pounds'],
  ['Feb. 3', 'february three'],
];
for (const [text, expected] of abbreviationChecks) {
  const said = (await analyzeText(text)).words.map((w) => w.text.toLowerCase()).join(' ');
  eq(`"${text}" expands to "${expected}"`, said, expected);
  eq(`"${text}" produces one segment`, segmentUtterance(await analyzeText(text)).length, 1);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const total = passed + failures.length;
if (failures.length) {
  console.error(`\n${passed}/${total} text-analysis checks passed. Failures:`);
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  process.exit(1);
}
console.log(`\n${passed}/${total} text-analysis checks passed.`);
console.log(
  `  dictionary: ${stats.entries.toLocaleString()} entries from ${stats.source}, ` +
    `${stats.annotatedLines} annotated lines, ${stats.rejectedTokens} rejected tokens`,
);
