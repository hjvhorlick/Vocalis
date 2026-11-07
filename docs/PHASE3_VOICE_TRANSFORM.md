# Phase 3 — the voice transformation, and why profiles sounded metallic

The recorded units are the product and they were fine. Every profile that asked for a
*pitch*, *pace*, *tone* or *resonance* change sent that audio through a stage that
degraded it. This document records what was wrong, what replaced it, and the numbers
that show the difference. It is the successor to
[`PHASE2_PIPELINE_CORRECTION.md`](PHASE2_PIPELINE_CORRECTION.md), which rebuilt the unit
assembly; this phase only touches what happens *after* the assembly.

All of the new code is `src/utils/voiceTransform.ts`. The recorded-unit assembly, the
packs and the frozen fingerprints were not touched — `npm run verify:base-voice` still
reports CONTRACT HOLDS.

---

## 1. The complaint this started from

> The original voices sound perfect. As soon as any of the app's adaptations is selected the
> voice becomes robot-like and clunky, like a metal box. The purpose is to enhance the voice,
> not break it.

That is an accurate description of three separate defects, all in the transformation stage.

---

## 2. What was wrong

**B4a. Pitch was moved by reading the waveform faster, with no anti-alias filter.**
`resample()` interpolated linearly between two samples at
`position = index × pitchFactor`. When the factor is above 1 the read position advances more
than one input sample per output sample, so everything above the new Nyquist limit folds back
into the band. Measured on a 7 kHz tone shifted by 1.2×: the folded-back image at 7.6 kHz sits
**−11.3 dB** below the input — loud, inharmonic and permanently attached to the voice. This is
the "metal box".

**B4b. Pace was changed on a fixed overlap grid with no phase alignment.**
`wsolaStretch()` hop'd a 640-sample window every 320 samples and crossfaded by summing
`previous + new × ramp`, then divided by the summed weights. Every overlap therefore averaged
two grains whose periods were unrelated, which cancels harmonics and adds a 50 Hz flutter.
It also compared candidate grains against the *already mixed* output rather than against the
continuation of the grain before it. The stretch was applied to the whole utterance at once.

Measured on the shipped sentences, "share of voiced frames whose neighbouring pitch periods
still look alike" (1.0 = perfectly periodic, lower = rougher; the recording itself is the
ceiling):

| Recording | Setting | Before | After |
| --- | --- | --- | --- |
| SLT | rate 1.4 | 0.805 (p10 0.373) | **0.844** (p10 0.481) |
| BDL | rate 1.4 | 0.624 (p10 0.053) | **0.681** (p10 0.094) |
| SLT | pitch 0.72 | 0.851 (p10 0.430) | **0.875** (p10 0.668) |
| BDL | pitch 0.72 | 0.688 (p10 0.274) | **0.743** (p10 0.496) |
| BDL | pitch 1.12 | 0.698 (p10 0.099) | **0.723** (p10 0.306) |
| SLT | pitch 1.12 | 0.869 (p10 0.526) | 0.845 (p10 0.380) |

The last row is the one case that moved the other way: the anti-alias low-pass removes the top
octave that the old resampler let through as aliases, so a pitched-up render is slightly less
"bright" and this metric reads a little lower. It is the trade this stage is making on purpose —
−11 dB of inharmonic content for a stopband at −132 dB (see §3).

**B4c. The tone styles secretly scaled pitch and pace.** `processCmuVoice` multiplied the
profile's pitch by 0.92 and its rate by 0.92 for `deep`, and by 1.06 / 1.1 for `energetic`. A
slider reading 0.72 delivered 0.66; the Marcus preset rendered 34 % flat instead of the 28 % its
own card claims. Nothing in the interface said so.

**D3/D4 (adjacent). The reference-recording audition used a second, different transformation.**
`buildDspGraph` set one `playbackRate` from `pitch × rate`, so the A/B tool played a chipmunk
version of the sentence at the wrong tempo; the robot ring modulator existed only on playback,
never in the exported file; and the oscillator it created was never stopped.

**A resonance feature that did nothing.** `throatWarmth`, `oralClarity` and `airPresence` — the
three "Vocal Tract Formant EQ" sliders — were read only by the audition graph. Generated speech
ignored them completely, so the sliders moved and nothing happened. Every preset shipped with
non-zero values that had no effect on the speech the user actually hears.

---

## 3. What replaced it

One stage, `transformRecordedVoice(samples, settings, sampleRate)`, applied to generated speech
and to the reference recording alike.

1. **`shiftPitchBandLimited`** — a 33-tap windowed-sinc interpolator. When the shift goes up, the
   kernel's cutoff is lowered to 0.85 of the new Nyquist **in the same pass**, so content that
   cannot be represented is removed instead of folded back. Measured on the same 7 kHz tone at
   1.2×: the image at 7.6 kHz is **−132.1 dB** re the input (was −11.3 dB), while a tone that
   does fit lands on its shifted frequency with **99.99 %** of the energy in a five-bin window.
2. **`preserveFormants`** — measures the long-term spectrum before and after the shift
   (Welch-averaged, silent frames skipped) and puts back a configurable share of it with
   **five wide** peaking bands: ±3 dB maximum, 150–5000 Hz only, smoothed across neighbours.
   Half by default, so a lower register sounds like the same speaker rather than a different,
   larger one. The first version of this used eighteen narrow bands and is the subject of §3.5;
   measured on the reference sentence at pitch 0.72, the distance between the rendered envelope
   and the recording's own envelope still falls (4.2 dB to roughly 3.5 dB), and it now cannot do
   it by drawing a comb through the vowels.
3. **`stretchTime`** — correlation-aligned overlap-add. A 40 ms raised-cosine window on a fixed
   20 ms hop; before each grain is mixed in, the candidate within ±10 ms that best continues the
   previously written audio wins (normalised cross-correlation, 4-sample resolution), so the
   overlap never averages two grains with disagreeing periods. The stretch target is measured
   from the *original* length, which is what keeps pitch and pace independent.
4. **`applyToneStyle`** — `deep` and `energetic` are resonance shapes, not hidden pitch/pace
   multipliers, and each is now a **single** wide band at half the colour budget (`deep`:
   190 Hz +1.5 dB; `energetic`: 2.8 kHz +1.5 dB) instead of two bands at +4.5 and +2 dB.
   Deepness is the pitch control; this only takes the edge off. `whisper`, `radio` and `robot`
   keep their deliberate sample-domain character, with the radio saturation softened
   (`tanh(2.4x) × 0.8` instead of `tanh(5x) × 0.75`).
5. **The resonance sliders** — three peaking bands at 450 / 1800 / 4200 Hz, each bandwidth
   about equal to its centre frequency, each clamped to **±3 dB**. Their centres follow the
   vocal tract by the un-preserved part of the pitch shift, so they still name the formants
   they claim to name. The interface offers the same −3…+3 range the engine honours.
6. **`levelMatched`** — the shaping keeps the level of the audio it was given, so a profile is
   a change of timbre and not of volume. The render path is peak-normalised afterwards, which
   means a boost that raises the crest factor still costs about a decibel of final level; that
   is arithmetic, and it is why the shipped profiles stay inside three decibels.

---
---

## 3.5 The second listening test: the algorithms were clean, the *sum* was not

The first rebuild fixed aliasing, grain alignment and the hidden multipliers, and the user's
answer was that the voice still sounded robotic. That sent the diagnosis back to measurement,
and the measurement had to answer an awkward question: which of these stages is actually
changing the voice enough to be heard?

Four candidates were measured against the real recordings.

| Test | What it measures | Result |
| --- | --- | --- |
| Envelope modulation spectrum, 2–300 Hz | warble and chatter | identical in both source recordings and every render (peak 2.0–2.5 Hz, chatter 25–34 Hz) — **not** the artefact |
| F0 jitter, autocorrelation tracker validated on synthetic 95/120/200 Hz tones | pitch instability | recordings 1.7 %/3.5 %, natural TTS 1.9 %/2.1 %, presets 0.5–3.7 % — one outlier (see below) |
| Pace changed 0.85× and 1.2×, envelope spectrum | granular buzz from overlap-add | 40–60 Hz and 80–120 Hz bands unchanged from the untouched render — the stretcher adds nothing here |
| Long-term average spectrum, preset vs the same speaker, pitch and pace with no character | how far the *profile* moves the timbre | **up to +10.8 dB in one region** |

That last row is the finding. Nothing in the DSP was broken; the character filters were stacking.
Marcus — "Deep Cinema", a 90 Hz fundamental — asked for `throatWarmth: 7` (at 450 Hz) *and* a
`deep` tone style that boosted 150 Hz and 420 Hz, all of them narrow. Measured against the same
voice with only pitch and pace applied, his finished render carried:

| Band | 160 Hz | 315 Hz | 400 Hz | 500 Hz | 630 Hz | 1 kHz | 4 kHz |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Before | +5.8 | +9.6 | **+10.8** | +9.2 | +5.4 | +1.6 | −1.4 |

Against the recording Marcus is built from, 315–500 Hz was **+13 dB**. On a voice whose fourth and
fifth harmonics sit at 360 and 450 Hz, that is not warmth; it is a barrel. The same measurement
explained the one jitter outlier: with that much energy between the harmonics, the pitch tracker
locked onto the boosted region and reported 118 Hz mean F0 at 17.9 % jitter for a voice that was
actually at 90 Hz. After the cap the same measurement reads **95 Hz at 5.1 % jitter**, and the
untouched BDL recording itself measures 3.5 %.

The fix is a budget rather than an algorithm: every character filter is capped at
`COLOUR_MAX_GAIN_DB = 3` and made about an octave wide (a wide band can express a tilt, not a
resonance), `deep` became one band at +1.5 dB, the timbre correction went from 18 narrow bands to
5 wide ones at ±3 dB, and the shipped presets were retuned into that range. Measured again:

| Profile | Worst third-octave deviation before | After |
| --- | --- | --- |
| Marcus | +10.8 dB at 400 Hz | +3.0 dB at 400 Hz |
| Jax | +6.5 dB at 3.15 kHz | +3.1 dB at 3.15 kHz |
| Charlotte | +4.0 dB at 2 kHz | +1.7 dB at 2 kHz |
| Oliver | +3.8 dB at 400 Hz | −1.2 dB at 80 Hz |
| Aria | +2.3 dB at 630 Hz | +1.0 dB at 500 Hz |

`whisper`, `radio` and `robot` are exempt in the test: those three are filters on purpose and the
interface says so, and Sterling's −11 dB below 1 kHz is the 1930s broadcast character.

---

## 4. What the renderer now measures about itself

`npm run test:render` — 555 checks. New in this phase (they run on known signals, not on the
renders, so they pin the algorithm rather than one sentence):

| Check | Result |
| --- | --- |
| An upward pitch shift lands on the shifted frequency | 99.99 % of the energy in a five-bin window around 3 kHz × 1.19 |
| A downward pitch shift lands on the shifted frequency | 99.99 % around 3 kHz × 0.72 |
| Content that would pass Nyquist is removed, not folded back | −132 dB re the input (linear resampling: −11 dB) |
| A 1.4× and a 0.7× pace change keep the pitch | median period 70 samples against 72.7 at rest |
| A neutral profile leaves the recording alone | sample-for-sample identical, maximum difference 0 |
| The throat resonance slider reaches generated speech | 450 Hz band share × 1.15 or more at +9 dB |
| A slider past the cap cannot colour the voice more than the cap | worst third-octave deviation ≤ 4.5 dB with all three sliders at +10 |
| Each shipped profile colours the voice by less than 4.5 dB | Aria +1.0, Marcus +3.0, Oliver −1.2, Charlotte +1.7, Jax +3.1 (deliberate characters exempt) |
| Pitch lowers/raises the measured pitch without changing the duration | period 131 / 67 samples against 94, duration 3.73 s in all three |
| Rate changes the duration without changing the measured pitch | 2.66 s and 5.33 s at the same measured period |

The gate: `npm run lint`, `npm run test:engine` (212), `npm run test:render` (555),
`npm run verify:base-voice` — all pass.

---

## 5. What this phase does **not** claim

- **Nobody has listened to it.** The metrics above are objective and they isolate the defects
  that were measured, but "sounds better" is not a claim this document can make. Blind A/B is
  still Phase 6 work.
- **The pitch stage is still a global transform.** Formant preservation is measured over the
  whole render, not per phone, so a vowel keeps its colour *on average*. Pitch-synchronous
  modification from per-unit pitch marks needs pack v2 (§3.2/3.3 of
  [`VOICE_IMPROVEMENT_PLAN.md`](VOICE_IMPROVEMENT_PLAN.md)); the frozen v1 packs do not contain
  them and are not going to.
- **Durations are still the recorded units' own.** There is still no duration model.
- **The silence rails in the render suite did not move in this phase.** They moved once, in the
  previous one, because profiles had started applying their resonance curves to generated
  speech, and a wide boost raises the crest factor; under a peak normaliser that reads as a
  point or two of extra "silence" at unchanged pauses. This phase brought the colouring back
  under three decibels and the shipped passages now measure 10–17 % silence, inside the old
  rails. Only the +/-3 dB sliders at their maximum can still reach the guard rail.
- **BDL is rougher than SLT before any processing.** The recording itself measures 0.76–0.79 on
  the periodicity metric where SLT measures 0.86–0.90, and profile changes do not fix a
  recording. Four of the eight shipped presets speak from BDL.
- **UK and AU accents are still rule-based approximations** over US recordings.
