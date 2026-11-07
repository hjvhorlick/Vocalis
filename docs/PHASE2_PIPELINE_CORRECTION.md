# Phase 2 — pipeline correction: the defect, the rebuild, the measurements

Written 2026-11-07 on branch `arena/6903e65e-vocalis`, base commit `de6272a`. Every number in
§3 was produced by running the two suites in this repository against the real bundled assets;
nothing here is carried over from an earlier branch or estimated.

Companion documents: [`PIPELINE_MAP.md`](PIPELINE_MAP.md) (the verified call graph),
[`APPLICATION_AUDIT.md`](APPLICATION_AUDIT.md) (the findings this closes),
[`BASE_VOICE_CONTRACT.md`](BASE_VOICE_CONTRACT.md) (the permanent rule),
[`VOICE_IMPROVEMENT_PLAN.md`](VOICE_IMPROVEMENT_PLAN.md) (what comes next).

---

## 1. What was wrong

The audit measured two pipelines. **Path A** was wired to the UI: it picked one of four
pre-recorded CMU ARCTIC reference sentences by `model.baseSampleId`, resampled it by a single
factor and applied EQ and effects. **Path B** was the real text-to-speech engine, and nothing
imported it.

Concretely, before this phase:

| # | Defect | Measured before |
| --- | --- | --- |
| 1 | `speakRealWords(text, model)` never read `text`. Speech Studio had no script field; Dialogue Studio's per-line text was discarded. | 0 importers of `synthesizeText`, `renderCmuDiphones`, `processCmuVoice`, `prepareCmuVoice` |
| 2 | The phone stream was wrapped in `pau` **per word**, so every word got a pause on both sides. | 38 % of the render was silence; 94.8 words per minute |
| 3 | A missing diphone was filled with one formant-synthesised phone — a mathematical stand-in inside a recorded voice. | 4.0 % of joins; pack coverage 79.5 % of the pairs a passage needs |
| 4 | Stress digits were stripped before unit selection, so `AH0` and `AH1` asked for the same audio. | every vowel |
| 5 | Word timings were produced by rescaling the whole utterance by `combined.length / raw.length`, so highlighting drifted further from the audio as a passage got longer. | global rescale, no measured offsets |
| 6 | Dictionary lines with a trailing `# annotation` were parsed as words. | 16 lines of the 124,076 |
| 7 | Preview and export were two passes: playback used a Web Audio graph, export used an `OfflineAudioContext` that omitted the robot effect and padded 0.3 s. | two implementations of "make audio" |
| 8 | The make-up-gain cap left the experimental path about 8 dB quieter than the default. | `MAX_MAKEUP_GAIN 1.8` |

---

## 2. What was built

### `src/utils/textAnalysis.ts` — new, 1,321 lines

The text-to-phone front end, extracted from `phonemeSynthesizer.ts` and rebuilt. Three passes:

1. `tokenize` splits source text into tokens that keep exact character offsets. Every branch
   advances the index; a token always consumes at least one character.
2. `spokenFormsOf` turns a token into the words a reader would say: money, years, times,
   fractions, ordinals, percentages, signs, abbreviations, acronyms, letters.
3. `analyzeText` produces an `Utterance` — spoken words with source spans and phone ranges, one
   phone stream with stress on every vowel, `guessedWords`, `rejectedTokens` — and
   `segmentUtterance` splits it at sentence boundaries and line breaks only.

A boundary belongs to the source token's **last** spoken word, and accent rules run over the
whole phone stream, so a dropped post-vocalic R cannot orphan a word's phone range: the ranges
are re-derived from the word index each phone carries.

### `src/utils/cmuDiphoneSynthesizer.ts` — head rebuilt, tail preserved

`renderCmuDiphones` now takes **segments**, not words. Per segment the chunk list is a lead
(`pau|p0`, or silence plus the incoming half of the first phone), one chunk per joint, and a
tail. A joint is, in order of preference:

1. the exact recorded unit `a|b`;
2. the second half of `a` cut out of any `a|x` unit plus the first half of `b` out of any `y|b`
   unit, where `x` and `y` are ranked by phone class and by how close the unit's own length is
   to the corpus mean — still that speaker's own recordings;
3. only if no half unit exists, the caller's mathematical phone, counted in
   `diagnostics.fallbackPhones`.

`crossfadeJoinWithOffsets` reports the boundary offset of every chunk, and `segmentStarts`
records where each segment began, so `phoneOffsets` are measured positions rather than
estimates. The preserved tail (`resample`, `wsolaStretch`, `applyStyle`, `processCmuVoice`) is
byte-for-byte the code that was already in the repository, with one fix: the stretch target is
now measured from the original length, so pitch no longer changes duration (§5).

### `src/utils/phonemeSynthesizer.ts` — orchestrator rebuilt, formant path preserved

`synthesizeText` calls `analyzeText` and `segmentUtterance`, hands the segments to
`renderCmuDiphones`, and turns the measured phone offsets into word timings
(`wordTimingsFrom`: a diphone join lands on a phone midpoint, so a word's boundary is halfway
between two midpoints). `normaliseSamples` applies make-up gain to a 0.78 ceiling and then the
profile volume; `encodeWav` writes the 16-bit mono RIFF file. The formant synthesizer
(`getFormants` … `buildPhoneSamples`) and `buildWordProsody` are the preserved originals and
still render when `synthesisMethod: 'formant'` is selected.

### `src/utils/naturalVoiceEngine.ts` — one entry point

`speakText` / `renderSpeech` generate the words they are handed; `playRender` replays an
existing render; `renderDialogue` builds a whole conversation as **one** sample array with
turn-taking gaps (`gapBeforeLine`); `initializeLocalSpeechEngine` warms the dictionary and the
selected speaker's pack. `speakRealWords` remains as an alias so existing callers keep working.
`auditionSourceRecording` keeps the reference-recording A/B as a separate, clearly labelled
feature.

### `src/utils/audioDspEngine.ts` — one playback path

`samplesToAudioBuffer` and `playRenderedSpeech` are the only way generated speech reaches a
speaker, so two studios cannot drift apart. `stopTransformedVoice` detaches `onended` before
stopping and releases the analyser.

### Components

Speech Studio has a script field; the highlighted words use the render's measured source spans;
export reuses the render Play already made whenever the settings are unchanged; every render
reports its diagnostics. Dialogue Studio generates each line from its own text in its own
speaker's voice and renders the conversation as one timeline, with a turn-taking gap control and
a warning when both speakers are the same identity.

### Provenance, guard, scripts

`public/CMUDICT-LICENSE.txt` carries the upstream CMU notice and the ISC redistribution terms
plus how the engine uses the file; `public/samples/LICENSE.txt` is new. `package.json` gains
`test:engine` and `test:render`. The gate is now:

```sh
npm run lint && npm run test:engine && npm run test:render && npm run verify:base-voice
```

---

## 3. Measurements

`npm run test:render` (534 checks) and `npm run test:engine` (212 checks), Node v22, assets read
from disk. All ten passages use SLT at pitch 1.0, rate 1.0, volume 1.0, `natural`, except where
the label says otherwise. "Units" is exact recorded units plus same-speaker adaptations.

| Passage | Duration | Words | Segments | Units | Recorded | Silence | Pace | Peak |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Reference sentence | 3.73 s | 7 | 1 | 25 + 0 | 100.0 % | 9.4 % | 113 wpm | 0.780 |
| A plain statement | 4.98 s | 11 | 1 | 35 + 0 | 100.0 % | 10.9 % | 133 wpm | 0.780 |
| Three sentences of dialogue | 3.83 s | 7 | 3 | 24 + 0 | 100.0 % | 14.9 % | 110 wpm | 0.780 |
| Money, years and percentages | 14.45 s | 25 | 1 | 102 + 0 | 100.0 % | 10.1 % | 104 wpm | 0.780 |
| Invented proper nouns | 7.27 s | 11 | 1 | 49 + 4 | 92.5 % | 10.1 % | 91 wpm | 0.780 |
| Acronyms, times and highways | 8.27 s | 21 | 1 | 60 + 1 | 98.4 % | 9.1 % | 152 wpm | 0.780 |
| A paragraph with a question | 26.41 s | 52 | 3 | 185 + 3 | 98.4 % | 10.1 % | 118 wpm | 0.780 |
| A deep male voice (BDL, pitch 0.72) | 3.88 s | 7 | 1 | 25 + 0 | 100.0 % | 15.7 % | 108 wpm | 0.780 |
| A British accent over the same words | 3.36 s | 8 | 1 | 24 + 0 | 100.0 % | 11.1 % | 143 wpm | 0.780 |
| A list with commas and a colon | 5.89 s | 14 | 1 | 44 + 0 | 100.0 % | 10.7 % | 142 wpm | 0.780 |
| **Totals** | | **163** | **14** | **573 + 8** | | 9.1–15.7 % | 91–152 wpm | |

| Long passage (24 sentences) | Value |
| --- | --- |
| Duration | 166.91 s |
| Words spoken / words given | 326 / 326 |
| Segments | 24 |
| Recorded units | 1,205 exact + 4 adapted |
| Recorded coverage | 99.7 % |
| Silence | 10.4 % |
| Pace | 117.2 wpm |
| Render time (packs warm) | 175 ms |

| Claim | Measurement |
| --- | --- |
| Every typed word reaches the audio | For all eleven passages, every letter and digit of the source is inside a measured word span; `wordTimings.length === diagnostics.words`; `rejectedTokens` is empty |
| Nothing is a mathematical stand-in | `fallbackPhones === 0` on every recorded-unit render, including the passage of invented proper nouns, which used 4 same-speaker adaptations instead |
| Silence is in a human range | 9.1–15.7 % across the passages (target 4–14 %, guard rails 2–18 %); the deliberately deep and slowed variants are measured against the guard rails |
| Pace is in a human range | 91–152 wpm whole-render (target 71–173), 117.2 wpm on the long passage |
| Preview equals export | Decoding the exported WAV and comparing sample by sample: maximum difference 0 in every case, within the one-quantisation-step tolerance of 3/32768 |
| Repeated renders are identical | The same text and settings render to byte-identical samples, twice for a passage and twice for a whole conversation |
| Loudness is controlled | Peak exactly 0.780 on every recorded-unit render, 0 clipped samples, no non-finite samples |
| Rate and pitch are independent | Rate 1.4 → 2.66 s, rate 0.7 → 5.33 s, natural → 3.73 s (3.73/1.4 and 3.73/0.7). Pitch 0.72 → 4.06 s and pitch 1.4 → 3.39 s, i.e. only the style's own rate factor moves the duration |
| Volume works | Volume 0.35 → peak 0.273 |
| The formant path still renders | 2.16 s for the reference sentence, peak 0.654, rms 0.059, 10.4 % of samples above 0.02, method reported as `formant`, coverage reported as 0 — honestly |
| Empty input is handled | Empty text, whitespace and punctuation-only text produce 0 words and at most a short silence; an empty conversation produces 0 samples and 0.00 s |
| Dialogue is one timeline | 15.80 s over 4 lines, line order preserved, turn gap 0.34 s, same-speaker gap 0.15 s, trailing unpunctuated line 0.20 s, every line inside the audio, export equal to preview |
| Speaker resolution | The default preset speaks from SLT, a male preset from BDL, and an unresolved base voice with a neutral gender resolves to SLT rather than failing |
| Performance | First render 355 ms (it loads a 5.7 MB pack), warm render 1 ms, heap 52 MB for the whole suite |
| The dictionary is the bundled file | 124,076 entries, source `file`, 16 annotated lines counted, 0 rejected tokens |

`npm run verify:base-voice` reports **CONTRACT HOLDS** with one pre-existing warning (`clsx` and
`tailwind-merge` are declared but unreferenced).

---

## 4. Four further defects found while measuring

These are not in the audit, because the audit was written by reading code. They were found by
running it.

1. **The tokenizer could stop advancing.** The currency test was an unanchored `/[$£€¥]?\d/`
   applied to `text.slice(index, index + 2)`, so for `I-70` it matched the digit *after* the
   hyphen, opened a number token that could not consume the hyphen, and never moved the index.
   The render suite exhausted the heap. Every branch now advances, a token always consumes at
   least one character, and a leading sign is stripped before the currency test.
2. **"negative" was spoken twice.** `numberToWords` reads a leading `-` as a sign of its own,
   and the caller had already spoken the sign. The sign is now spoken once, by the caller, and
   the digits are cleaned before they are passed on.
3. **Dotted abbreviations were guessed from their spelling.** `6:30 a.m.` produced a grapheme
   pronunciation instead of "ay em". `a.m.`, `p.m.`, `a.d.`, `b.c.`, `e.g.` and `i.e.` are now in
   the abbreviation table, spelled as words the dictionary actually contains.
4. **The experimental path was about 8 dB quieter than the default.** `MAX_MAKEUP_GAIN` was 1.8,
   which is not enough for a sparse formant render whose peak sits well below the ceiling. It is
   now 4, with `SILENCE_FLOOR` 0.02 so that genuine silence is never amplified into noise. The
   formant path measures peak 0.654 against a ceiling of 0.78.

---

## 5. Found while rebuilding, and fixed

- **Unit offsets are bytes, lengths are samples.** `manifest.json` stores `offset` in bytes and
  `length` in samples; reading `pack.samples[entry.offset]` walks off the end of the array and
  produces `undefined / 32768 = NaN`, which propagates silently through the joins and the
  normaliser. The only visible symptom was a peak of NaN on every recorded-unit render. The
  slice is now `entry.offset / 2`, with the convention stated in a comment.
- **Pitch changed duration.** `processCmuVoice` resampled for pitch and then stretched to
  `pitched.length / rate`, so lowering the pitch also slowed the reader: the deep preset spoke
  the reference sentence in 5.85 s at 72 wpm with 20.2 % silence. The stretch target is now
  measured from the original length. The same preset is 3.88 s at 108 wpm with 15.7 % silence.
- **An unresolved voice was guessed as male.** A model with no `baseVoiceId` and a neutral
  gender resolved to BDL. Only an explicitly male identity now gets the male speaker; everything
  else resolves to SLT.
- **A typographic minus sign was punctuation.** `−70 degrees` was spoken as "seventy degrees":
  the sign was dropped and the statement inverted. U+2212 and U+FF0D now read as a minus, and en
  and em dashes are still clause boundaries.
- **An ordinal suffix was a separate word**, and `rd` is also the abbreviation for "road", so
  `Jan. 3rd.` was read "january three road". The suffix now joins its number and the number is
  spoken as an ordinal.
- **A dotted initial ended a sentence**, so `J.K. Rowling wrote it.` was two segments with a
  pause after the K. A run of single letters with dots between them now holds the sentence open.
- **The letter A was spelled "ay-el"**, which also corrupted every acronym containing it: NASA
  was "en ay-el es ay-el".
- **The half-unit helpers were swapped.** Unit `a|b` spans the midpoint of `a` to the midpoint
  of `b`, so the second half of P is the head of `P|x` and the first half of P is the tail of
  `y|P`. `outgoingHalfOf` and `incomingHalfOf` now mean what they say.

---

## 6. What this phase does not claim

- The unit inventory is unchanged: 1,337 BDL and 1,324 SLT units, covering 79.5 % of the diphone
  pairs a passage needs. The gap is now covered by the same speaker's own audio and counted, not
  hidden — but the data gap itself is still there. Closing it needs pack v2 (pitch marks, the
  internal phone boundary, several candidates per pair), which is additive and leaves the frozen
  v1 packs untouched.
- Durations are still the recorded units' own. There is no duration model, which is why the
  reference sentence takes 3.73 s against 3.00 s of speech in the original SLT recording.
- Joins are still equal-length crossfades with no splice search, no energy equalisation and no
  voiced/unvoiced separation.
- UK and AU accents are rule-based approximations over US recordings, and the UI says so.
- Nobody has listened to it yet. The objective half of the evaluation harness exists
  (`tests/renderSpeech.test.ts`); blind A/B and copy synthesis against the original recordings
  are Phase 6 work.
