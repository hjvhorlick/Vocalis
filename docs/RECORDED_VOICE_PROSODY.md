# Prosody on the recorded path — giving the units a pitch line

Phase 2 fixed which units get joined and Phase 3 fixed what happens to the audio
*after* the join. Neither touched the thing a listener hears first: the pitch
wavered from unit to unit, because every unit arrived carrying whatever intonation
its own source sentence happened to have. This is the gap that Phase 3 left in the
assembly stage, closed.

This document is the record of the stage that fixes that, with the measurements
that made it worth shipping and the measurements that say what it still is not.
It sits alongside [`PHASE3_VOICE_TRANSFORM.md`](PHASE3_VOICE_TRANSFORM.md), which
covers everything that happens after the join.

All new code is in `src/utils/cmuDiphoneSynthesizer.ts`, plus one field passed
from `src/utils/phonemeSynthesizer.ts`. The packs, the join, the fingerprints and
the mathematical fallback path were not touched: `npm run verify:base-voice`
still reports CONTRACT HOLDS.

---

## 1. The complaint

> It still has this vibrating robotic sound. The voices sound robotic.

Two earlier rounds tried to answer that with filters and with phase-aligned joins.
Both were rejected by ear, and the join work was measured and reverted (it made the
periodicity metric slightly worse, 0.883 → 0.870, and the audible seam was not
there). The thing those rounds never measured is the one that turned out to matter.

## 2. What was actually wrong

The pipeline already had a prosody model. `buildWordProsody()` computed declination,
stress and boundary tones — and `renderCmuDiphones()` never called it: it was wired
only to the mathematical fallback path, which produces a minority of the audio. The
recorded path joined units flat.

So a sentence assembled from 19 recorded chunks had 19 different pitches, each one
inherited from a different sentence of the CMU Arctic corpus. No filter can repair
that, because the defect is not in the spectrum of any single unit — it is in the
*sequence*.

**Measured, before any fix.** Pitch tracked per 32 ms frame, octave-guarded, on
`"Author of the danger trail, Philip Ross."`:

| | mean frame-to-frame F0 movement |
|---|---|
| the source recording, same speaker | **0.391 st** |
| render, no transformation, before this stage | **0.964 st** |
| render, no transformation, after this stage | **0.745 st** |

A person moves their pitch about 0.4 semitones between 32 ms frames. The render was
moving it 2.5× that fast with no intention behind it, and that random walk is exactly
what "vibrating" describes. On a longer sentence (`"The author said that the small brown
dog was sleeping quietly near the open window."`) the same measurement gives 0.893 → 0.614.

## 3. What the stage does

Before the chunks are joined, `applyProsody()` re-pitches each chunk:

1. **Reference pitch.** The median pitch of each chunk is measured (autocorrelation
   with an octave guard), and the median of those medians is the phrase's reference.
   Each chunk is then brought onto it, bounded to −15 %/+18 % — one unit that happens
   to have been recorded low cannot drag the phrase.
2. **Declination.** A linear fall from +1.2 st at the start of a segment to −1.8 st at
   its end, so a phrase leans forward the way speech does.
3. **Boundary tone.** A question rises 2.4 st, a statement falls 1.2 st, at a terminal
   boundary. The tone is *ramped across the last third of the phrase* instead of being
   applied to the closing unit: the first version stepped it on the last chunk, which
   put a 3-semitone move on 40 ms of vowel — measurable, inaudible. Ramping also puts
   the rise on the last stressed syllable, where the ear expects it.
4. **Stress.** A stressed syllable sits 0.6 st above its neighbours.
5. **Two-stage factor.** Normalisation and contour are computed separately and then
   multiplied, because they fail differently: normalisation must be bounded, but the
   contour offset has to survive that bound or a question whose last unit happens to
   sit far from the reference ends exactly like a statement.

Two properties are preserved exactly, and both are checked:

- **Length.** `transformRecordedVoice(..., { rate: 1 })` is a varispeed job of a few
  semitones, and every chunk is trimmed/padded back to its input length. Word timings,
  pace and the silence rails are therefore unchanged.
- **Level.** `matchPeak()` restores each chunk's own peak. Without it, re-pitching
  raises the crest factor and the render's peak normaliser answers by turning the whole
  voice down: the dialogue passage moved from 17.02 % to 18.50 % silence on nothing but
  level, and that would have been "fixed" by quietly widening a rail. With peak matching
  it is 17.36 %, crest 16.42 dB against 16.40 dB before.

Formant preservation is 0.7 on these shifts: the vowel space stays the speaker's own
rather than sliding with the pitch, which at 3 semitones is the difference between the
same person speaking and a slightly different person.

## 4. Results

`npm run test:render` — **555 checks, all passing** (550 before this stage; five are new
and pin this behaviour). The prosody checks are:

| check | rail | measured |
|---|---|---|
| the recorded-unit path holds a stable pitch line | < 0.82 st/frame | 0.745 |
| Aria / Charlotte / Willow keep a stable pitch line | < 0.80 st/frame | 0.46–0.55 (32 ms tracker) |
| a question mark lifts the end of the phrase | > 1 st above the statement | passes |

The deep and character profiles are excluded from the stability rails on purpose: at
89–110 Hz with a raised noise floor the tracker itself starts making octave errors
(Marcus reads 2.6 st/frame), so the number would describe the tracker, not the voice.
That is a limit of the measurement, not a result — the ear is the check for those.

Phrase-level effect on the reference sentence: F0 range widened from 5.3 to 5.6 st
against 6.1 st for the recording, which is the other half of the same fact — a flat
random pitch has *less* range than a spoken contour of the same speaker.

Cost: first render 447 → 475 ms, warm render 3 → 30 ms for the reference sentence, and
the whole suite 2.5 → 9.3 s. Peak stays exactly 0.780 with nothing clipped.

## 5. What it is not

Worth stating plainly, because the difference matters when judging the result:

- **No pitch accents.** English stresses a syllable by raising it and often by a
  rise-fall *within* the syllable. This lifts stressed chunks uniformly. It is why
  word stress is audible but not yet shaped.
- **No duration model.** Word-final lengthening, and the shortening of unstressed
  vowels, are not modelled here; lengths come from the pack.
- **Linear declination** — one straight line per segment, not a reset-per-phrase
  model with intermediate boundaries.
- **Units are still spliced.** Two recorded pieces of audio are crossfaded at each
  join. That is inherent to concatenative synthesis and cannot be removed without a
  different kind of engine, which the base-voice contract rules out.

The next thing worth trying, if the ear still objects, is a *time-varying* pitch
contour inside the chunk — a ramp from the previous chunk's target to this one's —
rather than this constant-per-chunk version. That is the remaining source of
discontinuity in the numbers above, and it is a variation on this stage rather than a
new one.
