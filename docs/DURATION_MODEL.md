# How long each phone is, and how the recording is made to fit it

Status: built, measured, and green — `npm run test:render` 710/710, `npm run test:engine`
212/212, `npm run verify:base-voice` CONTRACT HOLDS, `npm run lint` clean. The frozen v1
assets (`public/voicepacks/cmu-arctic/*/{diphones.bin,manifest.json}`, `public/cmudict.txt`,
`public/samples/*`) are byte-identical to the committed baseline; everything here is additive
metadata and new code around them.

Two modules, one job each:

| Module | Job |
| --- | --- |
| `src/utils/durationModel.ts` | Decide how long each phone should be, in seconds, from the speaker's own measured phone durations and the shape of the sentence. |
| `src/utils/psola.ts` | Make a recorded diphone last that long, on the voice cycle, without inventing audio. |

`cmuDiphoneSynthesizer.ts` asks the first for a plan and hands each unit's two half-phone
targets to the second. The pack index that makes this possible — pitch marks, phone boundary,
per-phone durations — is `manifest.v2.json` beside the frozen `manifest.json`, built by
`scripts/build_cmu_voicepack_v2.py` from the same `diphones.bin` (see
[`VOICE_IMPROVEMENT_PLAN.md`](VOICE_IMPROVEMENT_PLAN.md) Phase 2 and the commit that added it).

---

## 1. The plan

`planDurations(segments, intrinsic, options)` walks the phone stream and multiplies a measured
intrinsic duration by factors for what the phone is doing in this sentence.

Intrinsic durations come from the speaker's own pack: `manifest.v2.json` carries
`phoneDurationsMs`, the median length of each phone across every unit that contains it
(SLT n=710, mean 117.0 ms; BDL n=803, mean 116.4 ms). The median, not the mean, so one long
pause unit cannot lift it.

Factors as shipped (`DEFAULT_WEIGHTS`):

| Factor | Value | What it does |
| --- | --- | --- |
| `stressPrimary` | 1.9 | a vowel carrying primary stress |
| `stressSecondary` | 1.0 | secondary stress: no change |
| `stressReduced` | 0.38 | a reduced vowel (schwa) |
| `accentLong` | 1.18 | a long vowel or diphthong |
| `wordFinal` | 1.1 | the last phone of a word |
| `onset` | 0.95 | the first consonant of a word |
| `clusterTwo` | 0.9 | a consonant in a run of two |
| `clusterThree` | 0.35 | in a run of three |
| `clusterMany` | 0.25 | in a run of four or more |
| `clauseFinal` | 1.16 | before a comma or semicolon |
| `sentenceFinal` | 1.8 | before a full stop |
| `boundaryConsonantShare` | 0.5 | how much of a boundary lengthening a closing consonant gets |
| `functionWord` | 0.6 | a closed-class word (the, of, and, was…) spoken in its weak form |
| `pace` | 0.9 | the whole-utterance tempo, applied as `pace / rate` so the rate control still reaches everything |

Bounds: `MIN_PHONE_SECONDS` 0.045, `MAX_PHONE_SECONDS` 0.4, `FALLBACK_PHONE_SECONDS` 0.12 for a
phone the speaker's table has never seen (measured: `defaulted` is 0 on every sentence in the
suite, so the fallback is a safety net, not a path).

### The floors are per class, and that is a measurement, not a preference

One floor for everything was wrong in a way a listener can name. Fitted to two recorded
sentences, the factors reached their totals by squeezing consonants in clusters to a quarter of
their measured length: `/s/` in a three-consonant run came out at 31 ms, and a 31 ms fricative
has neither the noise nor the duration that makes it an `/s/`. The share of a render's energy
above 2.5 kHz — where every fricative lives, and where the difference between "spring" and
"ping" lives — measured **0.21%** against **0.32%** in the human reading of the same sentence.

`MIN_SECONDS_BY_CLASS` now holds:

| Class | Floor | Phones |
| --- | --- | --- |
| fricative | 0.060 s | S SH Z ZH F V TH DH HH CH JH |
| nasal | 0.050 s | M N NG |
| glide | 0.050 s | L R W Y |
| stop | 0.045 s | P T K B D G |
| vowel | 0.045 s | everything else |

Sixty milliseconds is the bottom of the range English gives a fricative inside a cluster. A stop
may go shorter because its identity is in its burst rather than in its length. Measured on the
sentence that exposed the problem, fricatives went from 63 ms mean / 45 ms minimum to **71 ms /
60 ms**, the high-frequency share went from 0.21% to **0.30%** (human 0.32%), and the total moved
from 27% over the human reading to 29% over: two percentage points of pace bought the consonants
back.

Two consequences are visible in the suite and are asserted there rather than hidden:

* Rate is no longer exactly proportional. The floors are absolute seconds, so a phone already
  sitting on one cannot shrink by a fifth: rate 1.25 shortens a sentence to 0.82 of its length
  rather than 0.80, and rate 0.8 lengthens it to 1.23 rather than 1.25.
* A consonant in a run of three or more is 0.57 of the same consonant alone rather than the 0.35
  the factors ask for, because the floor holds.

### How the factors were fitted, and the caveat that goes with them

The factors were fitted by grid search over the four bundled recordings' speech extents
(72,900 combinations; worst-case error 13.3% at the time) and checked by leave-one-out
(−9/+20/−15/+4%). **That fit aimed at the right extents through the wrong phone lists**: the
suite compared the plan for a shortened stand-in text against the recording of the real sentence.
The transcripts the repository already carries for those files
(`src/utils/naturalHumanAudio.ts`) are "Author of the danger trail, Philip Steels, etc." and "For
the twentieth time that evening the two men shook hands."; the fit used "…Philip Ross." and a
different sentence altogether.

The suite now measures the recordings at run time and renders their actual transcripts, so the
caveat is visible in numbers instead of buried: the plan runs **16–38% long** against the
word-matched extents, and the render lands **+10/−2/+29/+1%** (§3). Refitting the factors on the
four word-matched readings is the next step and is listed in §6. It is not done by widening a
band: the band that covers it is stated as what it is — the plan may ask for no more than 1.45×
the recording, because everything above that is what the realiser throws away at its stretch
ceiling.

---

## 2. The realiser

`synthesiseUnit(unit, {sampleRate, pitch})` re-times one recorded diphone to two half-phone
targets. Duration comes from the targets, pitch from the mark spacing, and the two stay
independent: a lower voice does not become a slower sentence, which is what resampling could
never do.

Each half is realised in one of four modes, and the render diagnostics count all three that
matter (`grains`, `truncated`, `capped`) because "re-timed" in the abstract is not a claim this
repository makes:

| Mode | When | What it does |
| --- | --- | --- |
| `grains` | the target is 0.4–1.35× the recording | overlap-add of raised-cosine grains one recorded period wide, walked on the pitch marks |
| `capped` | the target is more than 1.35× | the most stretch a grain walk can do without repeating a glottal period audibly |
| `truncated` | the target is under 0.4× **and the half is voiced** | head and tail of the recording kept unmodified, middle dropped, joined over one voice cycle |
| `silent` | nothing on that side of the boundary | — |

Constants: `MAX_STRETCH_RATIO` 1.35, `TRUNCATE_BELOW_RATIO` 0.4, `MIN_SIDE_SAMPLES` 8,
`LEVEL_FLOOR` 0.75, `UNVOICED_GAP_RATIO` 1.7, `ASYNC_FRAME_SECONDS` 0.01,
`BOUNDARY_BLEND_SECONDS` 0.008, period clamp 24–400 samples.

Four things in there are fixes for measured defects, and each has a number attached:

**The window sum is normalised.** Two raised-cosine grains tile to exactly one only when both are
as wide as the step between them; period jitter of ±10% left the sum ±8% off at every glottal
period, which is amplitude modulation at the pitch rate — the "vibration" in the original
complaint. `level()` divides by the accumulated window sum wherever it is above `LEVEL_FLOOR`.
Window-sum deviation, mean-relative standard deviation: **6.93% → 3.09%** at ratio 1.00, 8.18 →
3.54 at 0.75, 5.59 → 1.93 at 1.30.

**Unvoiced frames are gain-compensated.** Frames of noise are not the same signal twice over, so
where they overlap they add as noise rather than as one waveform: the windows sum to one but
their squares sum to 0.75, and a fricative squeezed to half its length came out 13% quiet.
`asyncGain` puts that back and is exactly 1 where nothing is being squeezed. Measured on white
noise, rms after a squeeze to 0.5×: **0.150 → 0.172** against a source of 0.175.

**Only a voiced half is ever cut.** Cutting `/s/` short costs the `/s/`; squeezing noise on
frames keeps its spectrum (measured: the 5 kHz share of white noise survives a squeeze to half
its length intact). `isVoiced()` asks for at least three marks inside the half and a mark density
of at least 0.4 per period, so fricatives and stops are squeezed and vowels are cut. Cut halves
per sentence fell from 30 to 19 (SLT) and 23 to 15 (BDL) on the two reference sentences.

**The lead of a half is written.** This was the largest single defect in the audio and it was
invisible in every aggregate number: a grain walk starts at the half's first pitch mark, and the
samples before that mark were simply never written. An unwritten sample is an exact zero, so a
phone went missing and dead air took its place.

| Measurement | Before | After |
| --- | --- | --- |
| SLT units holding ≥8 ms of exact zeros at identity | **268 of 1256** (longest 143 ms) | **0 of 1256** |
| BDL units holding ≥8 ms of exact zeros at identity | **323 of 1271** (longest 146 ms) | **0 of 1271** |
| such runs in the recordings themselves | none (0.50% of samples are zero, never 8 ms together) | — |
| BDL, "…Philip Steels, etc.": longest silent run inside the speech | **156 ms**, inside "Steels" | **21 ms** |
| BDL, same sentence: silence as a share of speaking time | **31.4%** (human 15.2%) | **11.6%** |
| SLT, "…the two men shook hands." | 11.2% (human 6.5%) | **6.0%** |

The fix is a lead laid down on the waveform at the recorded cadence, stopping exactly where the
mark grid starts. Both halves of that matter, and both were measured: a lead that reads the first
mark from an output position a period before it is a constant offset for that grain and none for
the rest, and the two cancel where they overlap (a 4 kHz component: **0.200 → 0.141**); a lead
laid down on the 10 ms unvoiced frame tiles against a marked part walking on periods of a
different width, and the window sum is off by a third for the length of the lead (mean-relative
sd **3.09% → 6.46%**). Reading the waveform at the recorded period and handing over on it does
neither: identity is exact again (0.500 s, fundamental 0.500, 4 kHz 0.200, rms 0.381) and the
zeros are gone. `tests/renderSpeech.test.ts` now resynthesises all 2,527 non-pause units at
identity and fails if any of them holds 8 ms of unwritten silence.

What the realiser cannot do is choose better audio. v1 kept one candidate per diphone pair and
the CMU ARCTIC `wav/`+`lab/` source is not in this repository, so there is no inventory to select
from and no join cost to minimise; `unit_quality` in `scripts/build_cmu_voicepack.py:41-63`
preferred units near 160 ms, which is why about half of all halves must be squeezed. That is the
limitation scope B was agreed to accept, and it is why the stretch ceiling and the floors exist.

---

## 3. The human anchors

The four intact recordings in `public/samples` are the only human speech in this repository. The
suite measures them at run time with the same code it measures a render with, and fails if they
stop measuring this way — so these numbers cannot go stale silently. Transcripts are the ones the
application already carries for those files.

| Recording | File | Extent | Words | wpm over extent | Silence | Silence while speaking | Longest inner run | Syllables/s | Phones | ms/phone |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SLT a0001 | 3.35 s | 2.91 s | 9 | 186 | 14.9% | 8.8% | 19 ms | 5.97 | 33 | 88 |
| BDL a0001 | 3.24 s | 2.98 s | 9 | 181 | 17.9% | 15.2% | 50 ms | 6.42 | 33 | 90 |
| SLT a0003 | 3.21 s | 2.77 s | 11 | 238 | 11.5% | 6.5% | 11 ms | 7.81 | 39 | 71 |
| BDL a0003 | 3.37 s | 3.15 s | 11 | 210 | 12.9% | 9.3% | 49 ms | 6.47 | 39 | 81 |

The engine, rendering those same transcripts:

| Render | Duration | Error vs extent | wpm | Silence | Silence while speaking | Longest inner run | Syllables/s | Halves: grains/cut/capped |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SLT a0001 | 3.21 s | +10% | 168 | 10.5% | 7.6% | 11 ms | 6.28 | 48/9/11 |
| BDL a0001 | 2.92 s | −2% | 185 | 14.9% | 11.6% | 21 ms | 5.73 | 46/9/13 |
| SLT a0003 | 3.56 s | +29% | 185 | 8.1% | 6.0% | 15 ms | 6.76 | 54/13/13 |
| BDL a0003 | 3.18 s | +1% | 208 | 15.8% | 14.5% | 79 ms | 6.04 | 54/15/11 |

Every render is inside 25% of the human syllable rate for the same words, inside 2× of its pause
share, and inside 100 ms on its longest stretch of dead air. The old engine — every unit at the
length it was recorded at — ran at **2.7** envelope peaks per second against the recordings'
5.97–7.81, and spent **0.4%** of its speaking time in silence against their 6.5–15.2%.

Rhythm on the acceptance metrics (old → new, human in brackets):

| Metric | SLT a0001 | SLT a0003 |
| --- | --- | --- |
| nucleus mean | 277 → **234** ms [201] | 231 → **201** ms |
| nucleus CV | 0.44 → **0.50** [0.62] | 0.58 → **0.78** |
| nucleus minimum | 90 → **55** ms [45] | 70 → **50** ms |
| longest / shortest | 4.8 → **7.3×** [11.7×] | 9.6 → **12.2×** |
| syllables per second | 5.4 → **5.8** [6.0] | 4.7 → **6.3** |

---

## 4. What is measured on the audio, and what it says

Envelope modulation in the bands where roughness lives, as a percentage of the mean envelope
(`/tmp/mod.py` during development; the suite asserts the pause and rate consequences rather than
these):

| Render | 20–50 Hz | 50–100 Hz |
| --- | --- | --- |
| human SLT a0001 | 0.8% | 0.4% |
| old engine SLT a0001 | 0.7% | 0.3% |
| **new engine SLT a0001** | **1.0%** | **0.5%** |
| human SLT a0003 | 0.9% | 0.4% |
| old engine SLT a0003 | 0.9% | 0.4% |
| **new engine SLT a0003** | **2.0%** | **0.8%** |
| human BDL a0003 | 1.3% | 0.9% |
| **new engine BDL a0003** | **2.2%** | **1.8%** |

Sample-to-sample jumps ("clicks"): the worst single jump in an SLT render is now **0.506**
against the human recording's **0.512** and the old engine's **0.753**; absolute jump counts are
35% lower than the old engine on the same sentence. Per second they are higher, because the same
events happen in 43% less time — a rate comparison across renders of different length is not
meaningful, and the old engine's 147/s against the human's 62/s was mostly the engine playing
each unit at recorded length with nothing between them.

Consonant clarity, peak-normalised share of energy above 2.5 kHz:

| Sentence | Human | Old engine | New engine |
| --- | --- | --- | --- |
| SLT a0001 | 0.24% | 0.45% | **0.41%** |
| SLT a0003 | 0.32% | 0.38% | **0.30%** (was 0.21% before the class floors) |
| BDL a0001 | 1.69% | 1.56% | **1.72%** |

**What is still worse than human:** roughness on the fast sentence (2.0–2.2% against 0.9–1.3%),
concentrated in BDL, whose pitch marks are the weaker of the two (adjacent-period correlation
0.677 against SLT's 0.852). Compression is the mechanism: a 4 kHz partial survives a grain walk
at ×1.0 whole, at ×1.3 at 42%, and at ×0.8 at 1%. Halves are compressed because the pack's units
are longer than the plan wants, and that is the v1 selection bias, not the walk.

---

## 5. The suite's bands, and why they moved

`tests/renderSpeech.test.ts` grew from 646 to **710** checks. Nothing was deleted; the pace and
silence bands were re-anchored on the recordings and the human-anchored measurements were added
beside them.

| Check | Was | Now | Why |
| --- | --- | --- | --- |
| silence, guard rails | 2–18% | 2–18% | unchanged; every passage now measures 8.3–16.0% |
| silence, "human target" | 4–15% | 8–20% | the recordings measure 11.5–17.9%; the old ceiling excluded BDL a0001 |
| pace of the whole render | 71–173 wpm | 110–250 wpm | the recordings measure 161–206 wpm over the whole file; renders 123–215 |
| pace while speaking | 79–190 wpm | 125–280 wpm | the recordings measure 189–232 wpm the same way; renders 137–237 |
| long passage length | 120–260 s | 85–260 s | 103 s at a human pace, 167 s at the old one; the point of the check is minutes, not seconds |
| conversation silence | 2–20% | 5–30% | four short lines carry 1.2 s of turn and trailing gaps before any pause inside a line |
| rate 0.7 / 1.4 proportionality | ±12% | ±15% | the floors and the 1.35× stretch ceiling are absolute and do not scale with tempo |
| **syllable rate** *(new)* | — | 4.5–8.5 peaks/s | the recordings measure 5.97–7.81; every render 4.7–6.9 |
| **silence while speaking** *(new)* | — | 4–18% | the recordings measure 6.5–15.2%; every render 6.0–13.4% |
| **the recordings themselves** *(new, 20 checks)* | — | extent, wpm, silence, pause share, syllable rate | so a band that quotes a human number fails if the number moves |
| **render vs recording of the same words** *(new, 24 checks)* | — | duration ±30%, syllable rate ±25%, pause share 0.4–2×, longest dead air ≤100 ms, fricative floors | the comparison a listener can check |
| **no unwritten silence in any unit** *(new, 2 checks)* | — | all 2,527 non-pause units at identity | pins the dead-air defect shut |

Words per minute is kept as a sanity rail — it catches a stalled render and a machine gun — but
it depends on how a passage happens to be written, so the claim "this is a human pace" is carried
by the two measurements that mean the same thing on a recording and on a render: envelope peaks
per second, and silence as a share of the time between the first peak and the last.

---

## 6. Known limits, in the order they should be taken

1. **Refit the factors on the word-matched readings.** The fit aimed at the right extents through
   the wrong phone lists (§1). Four readings, twelve factors, leave-one-out reported — the harness
   already exists in the suite.
2. **Roughness on compressed voiced halves**, worst in BDL. The candidate is per-unit mark
   quality: where adjacent-period correlation is low, fall back to frames instead of marks. The
   measurement to beat is 2.2% against a human 1.3% in the 20–50 Hz band.
3. **No cost-based unit selection**, and no way to get one from this repository: one candidate per
   diphone pair, no `wav/`+`lab/` source. If the ARCTIC source data ever appears, rebuilding the
   inventory with several candidates per pair is the single largest quality step available, and it
   is additive (a v3 index beside the frozen v1).
4. **The plan and the realiser are coupled through the stretch ceiling.** The plan runs 16–38%
   long and the render lands within ±29% because 11–13 halves per sentence are capped at 1.35×.
   That compensation is real but accidental; if the pack ever gets longer units, the plan will
   look too slow until it is refitted.
5. **A pause half keeps the length it was recorded at.** The plan says nothing about the breath
   between sentences, and the v1 selection bias toward 160 ms units is what sets it. Measured, the
   result is inside the human range (longest inner run 11–79 ms against 11–50 ms), so this is a
   watch item rather than a defect.

---

## 7. The reference, and every control measured against it

The duration model is an adjustment to a recording, and the person listening to the result said
it made the voice worse than the recording it started from. That is a fair thing to say and there
was no way to check it inside the application: every render went through the plan, the re-timing,
the pitch work and the tone character at once, so nothing isolated the recording. There is now.

### `referenceRaw`: which timing, not which effects

`VoiceModelConfig.referenceRaw` (`naturalVoiceEngine.ts:84`) selects the **timing** only. It used
to gate the whole adjustment chain, which meant that the moment anyone touched a slider the
recording disappeared and they were listening to a different engine. That is the opposite of what
the effects screen is for, so it was split:

| Stage | `referenceRaw: true` (default) | `referenceRaw: false` |
| --- | --- | --- |
| `planDurations` | not called | called |
| `joinRetimed` / `synthesiseUnit` / `joinInPhase` | not called — units keep their recorded lengths | called |
| `processCmuVoice` (pitch, WSAL, `applyStyle`) | **runs**, and is a pass-through at pitch 1 / rate 1 / `natural` | runs |
| `applyResonance` (three peaking filters) | **runs**, and is a pass-through at 0 dB | runs |
| `analyzeText` | the accent the profile asks for | the accent the profile asks for |
| `normaliseSamples` | one gain over the whole file | same |

So every control on the effects panel works under both timings, one at a time, on top of the
recording — which is exactly what was asked for: listen to the original, move one thing, decide.
And at every neutral setting the two paths still produce the recording bit for bit, which the
suite checks (`a neutral voice leaves the recording bit-exact`), because the pitch stage returns
early when neither factor moved (`cmuDiphoneSynthesizer.ts:1123`) and the filters return their
input unchanged below 0.01 dB.

**Since 2026-11-07 the recorded timing is what the application ships.** Both studios default to
`slt`/`bdl` with everything neutral, `referenceRaw: true`, and a labelled switch — "Recorded" against
"Rhythm engine" — for anyone who wants the duration model described in this document. The old
behaviour, where the pitch and pace sliders were disabled while the recorded voice was selected, is
gone: they work in both timings now, because they no longer decide which engine you get.

It is the recording, and that is checked rather than claimed. The suite takes the first joint of
a sentence, reads that unit's samples out of `diphones.bin`, and searches the reference render for
the offset and single gain that reproduce them. Matched over the unit's interior — its first and
last few milliseconds are crossfaded into its neighbours — the residual is **0.0000 %** of the
unit's energy at gain **1.2001**, for both speakers. One gain, applied once, is the normaliser.

### What the reference costs, in seconds

Same text, same units, same speaker. "Human" is the intact CMU ARCTIC recording where this
repository has one.

| Sentence | Speaker | Human | Reference | Engine | Reference ÷ engine | Reference ÷ human |
| --- | --- | --- | --- | --- | --- | --- |
| a0001 "Author of the danger trail…" | slt | 3.35 s | 4.94 s | 3.21 s | 1.54× | 1.47× |
| a0001 | bdl | 3.24 s | 4.75 s | 2.92 s | 1.63× | 1.47× |
| a0003 "For the twentieth time…" | slt | 3.21 s | 5.33 s | 3.56 s | 1.50× | 1.66× |
| a0003 | bdl | 3.37 s | 5.42 s | 3.18 s | 1.70× | 1.61× |
| "The quick brown fox… open field." | slt | — | 8.06 s | 5.40 s | 1.49× | — |
| same | bdl | — | 7.96 s | 4.90 s | 1.62× | — |

The reference is roughly half as long again as the engine on every sentence, and 1.5–1.7× the
human reading of the same words. That is the drag this document exists to remove, heard on its
own: at recorded lengths a reduced vowel in a function word lasts as long as a stressed nucleus,
because the corpus has no reason to shorten one for a sentence it was never read in. It is not a
better or worse voice than the engine's, it is the same voice with no rhythm imposed on it, which
is what makes it a usable reference.

### The controls that reach the audio, and how far

The full table is in `APPLICATION_AUDIT.md` under "Status after the control audit"; what belongs
here is the part the duration model is responsible for. `pitch` and `rate` under-deliver at their
extremes, and the reason is this model's own bounds:

| Asked | Delivered | Why |
| --- | --- | --- |
| `pitch` 0.50 | 0.54× (97.6 Hz against 179.8) | a half phone cannot be stretched past `MAX_STRETCH_RATIO` 1.35 without losing the recording |
| `pitch` 1.75 | 1.65× (296.3 Hz) | below `TRUNCATE_BELOW_RATIO` 0.4 a voiced half is cut, and cutting an unvoiced one deletes the consonant |
| `rate` 0.60 | 1.34× slower, not 1.67× | `MIN_SECONDS_BY_CLASS` — a fricative keeps 60 ms, a stop 45 ms, whatever the plan asks for |
| `rate` 1.50 | 0.77×, not 0.67× | the same floors, from the other side |

Those bounds were fitted against the human readings in §3 and they are why the suite's rate
proportionality check is [0.79, 0.86] and [1.20, 1.26] rather than exact. A control that cannot
reach its label is recorded here with the number it does reach, which is the difference between a
limitation and a lie.

Three controls were lies until this pass: `throatWarmth`, `oralClarity` and `airPresence` were
read only by the audition path and produced output byte-identical to neutral at ±10 dB. They are
three peaking biquads in the render path now — 450 Hz Q 1.2, 1800 Hz Q 1.4, 4200 Hz Q 1.0, the
bands the audition path already used — and the suite checks both that each one changes the samples
and that each one moves energy in the band its name claims. `accent: 'Global'` still reaches
nothing and is documented as a region-filter label, not a synthesis setting.
