# Vocalis voice improvement plan

Research-informed, implementation-original. Every item below takes a **published idea** and
specifies how Vocalis will build it **from scratch, in its own code**. No source code, snippet,
patch or generated fragment from any project, paper supplement, tutorial or documentation
example enters this repository (`docs/BASE_VOICE_CONTRACT.md` §3). Citations here name concepts
so a reader can check the reasoning; they are not code provenance.

The base voice — the CMU ARCTIC recorded units and their frozen index — is never modified. All
of this is technology *around* it, plus **new, additional** data files.

---

## Status (2026-11-07)

**Phase 0 and Phase 1 below are built and measured.** In the numbering used by
[`PIPELINE_MAP.md`](PIPELINE_MAP.md) and
[`PHASE2_PIPELINE_CORRECTION.md`](PHASE2_PIPELINE_CORRECTION.md) that work is called
"Phase 2 — pipeline correction"; it is the same work, and this plan's Phase 2 and Phase 3
are its Phase 3.

| Plan phase | State | Evidence |
| --- | --- | --- |
| Phase 0 — put the base voice in the product | **done** | Speech Studio speaks typed text; Dialogue Studio renders a conversation as one timeline; `npm run verify:base-voice` reachability check requires a component that speaks generated text |
| Phase 1 — speak in sentences, not isolated words | **done** | one phone stream per utterance, `pau` only at sentence ends; silence 38 % → 9.1–15.7 %; pace 94.8 → 91–152 wpm (117.2 on a 326-word passage); stress preserved; dictionary annotations parsed; timings measured from phone midpoints |
| Phase 2 — modify the recorded units properly | next | needs pack v2 (pitch marks, phone boundary) — additive, v1 stays frozen |
| Phase 3 — cover every transition with the same speaker | partly pre-empted | same-speaker half-unit backoff is built (0 mathematical stand-ins, 8 adaptations across ten passages and 4 across a 326-word passage); the mixed-rank inventory and cost-based selection are still to do |
| Phase 4 — accent, speaker range, voice character | partly | accent rules now run over the whole stream and reach the audio; still an approximation over US recordings |
| Phase 5 — evaluation harness | seeded | `tests/renderSpeech.test.ts` (534 checks) and `tests/textAnalysis.test.ts` (212 checks) are the objective half; blind listening gates are still to do |

Measurements: [`PHASE2_PIPELINE_CORRECTION.md`](PHASE2_PIPELINE_CORRECTION.md) §3.

---

## Ground rules for the work

1. **Additive data only.** Any improved unit inventory ships as *new* files
   (`manifest.v2.json` + `units.v2.bin` beside the frozen v1). v1 stays byte-identical and
   stays the contract's frozen baseline, so `npm run verify:base-voice` still pins it.
2. **Same speaker or nothing.** A missing unit is filled from the *same* recorded speaker
   (a shorter or longer unit, a monophone, a neighbouring-context diphone) — never from the
   formant synthesizer and never from another voice. If nothing exists, the app says so.
3. **No new speech technology from outside.** No browser TTS, cloud TTS, neural models, voice
   conversion or cloning. The formant synthesizer stays as the clearly-labelled experimental
   alternative.
4. **Measure, then listen.** Every phase has an objective metric *and* a listening gate. A
   green build is not a quality pass (`docs/VOICE_SYNTHESIS_RESEARCH.md` already requires this).
5. **Honest labels.** What a control actually does is what it is called. If accent is
   approximated, the UI says "approximated".

---

## Phase 0 — Put the base voice in the product (fixes A1–A4, D8)

Nothing else matters until typed text is spoken by the recorded voice.

- **0.1 Wire the synthesizer to the UI.** Add a real script input to Speech Studio, use
  `synthesizeText(text, model)` for playback and export, and make `speakRealWords` actually
  consume its `text` argument (or delete the misleading signature). Keep the existing
  reference-sentence audition as a separate, clearly-labelled "hear the source recording"
  control — that comparison is useful and it is honest about what it is.
- **0.2 Preload with progress.** Fetch the dictionary and the selected speaker's pack once,
  report bytes/percentage, and store them in the Cache API so 14.6 MB is a one-time cost.
  Preload the pack for the *selected* speaker only; lazy-load the other.
- **0.3 Expose the two methods and both speakers.** A visible switch: *Recorded CMU ARCTIC
  units (default)* / *Mathematical formant (experimental)*, and an explicit BDL / SLT choice
  that stops relying on `gender` alone. Fix `speakerForModel`'s silent `Neutral → slt` default.
- **0.4 Surface the fallback count.** `renderCmuDiphones` already returns
  `usedDiphones`/`fallbackDiphones`; show them. Contract rule 6: no silent substitution.
- **0.5 Independent pitch and rate.** Split the single `playbackRate` factor into a real
  pitch change plus a real duration change (Phase 2), so "Pitch Height" changes pitch and
  "Speaking Pace" changes speed. Until then, relabel the control honestly.

**Acceptance:** typing an arbitrary sentence produces that sentence in the recorded voice;
BDL and SLT are both selectable; fallbacks are counted on screen; nothing is fetched twice.

---

## Phase 1 — Speak in sentences, not in isolated words (fixes B1, B3, B8, B9, B2)

The biggest single win, and it is pure organisation of data we already have.

- **1.1 One phone stream per utterance.** Build the whole text into a single phone sequence
  with prosodic boundaries, then request diphones across it. `pau` is inserted at sentence
  ends (long), clause punctuation (medium) and — optionally — strong phrase breaks, never at
  every word. Measured today: 38% of rendered audio is `pau`-bounded and the effective rate is
  94.8 words/min; target is 0% word-internal pauses and ~140–160 words/min.
  *Idea source:* the standard hourglass architecture — text → words → phones+prosody → units
  → waveform (Jurafsky & Martin, *Speech and Language Processing*, ch. 8; LSA 352 lecture notes).
  *Vocalis implementation:* our own tokenizer, boundary detector and stream builder in
  `phonemeSynthesizer.ts`, replacing the per-word `['pau', …, 'pau']` wrapper.
- **1.2 Keep and use lexical stress.** Stop stripping stress digits. Store stress on each
  target phone and drive three things from it: unit **duration** (stressed vowels longer),
  **F0** (a small rise on stressed syllables) and **energy**. *Idea source:* stress/duration/F0
  interaction in prosody models; MBROLA's interface exposes per-phone duration in ms plus
  piecewise-linear F0 targets (Dutoit et al., ICSLP 1996). *Vocalis implementation:* our own
  `ProsodyTrack` — per-phone target duration, an F0 target list (time, Hz) and an energy curve,
  generated by our own rules from stress, phrase position, sentence type and punctuation.
- **1.3 A real duration model.** Today every unit plays at its recorded length. Replace that
  with a target duration per phone = intrinsic duration × stress factor × phrase-position
  factor × rate, then modify the unit to hit it (Phase 2). Intrinsic durations should be
  **measured from our own pack** (median unit length per phone, split at the phone boundary),
  not copied from a published table. *Idea source:* duration prediction as a function of
  phonetic and prosodic context, classically a CART/regression tree (Riley et al.; Festival's
  duration models). *Vocalis implementation:* a small, explainable rule/multiplicative model we
  fit to our own unit statistics — no tree-learning library, no borrowed tables.
- **1.4 Intonation that follows the sentence.** Declination across a phrase, a final fall for
  statements, a rise for questions, a smaller rise for commas, plus a reset after each
  boundary. The formant path already sketches this (`phraseDeclination`, `boundaryMovement`);
  promote it to the shared `ProsodyTrack` so the recorded path gets it too. *Idea source:*
  declarative/prosodic-phonology intonation and ToBI-style boundary tones (Pierrehumbert;
  rule-based ToBI generation for TTS). *Vocalis implementation:* our own rule set producing F0
  targets, tuned by listening on our own evaluation sentences.
- **1.5 Fix the dictionary loader.** Strip `#` annotations and any non-phone token; validate
  every phone against the pack inventory; log unknown symbols instead of feeding them to the
  diphone lookup. Fixes 16 entries (`gdp`, `hiv`, `aalto`, `d'artagnan`, …) that currently
  produce synthetic blips.
- **1.6 Correct timings from the render, not from a global scale.** Record each word's start
  sample *after* concatenation and modification, so highlighting cannot drift.

**Acceptance:** a 50-word paragraph renders with no word-internal pauses, at 140–160 wpm at
rate 1.0, with audible stress contrast between `REcord` and `reCORD`, and highlight drift under
one syllable across a 60-second render.

---

## Phase 2 — Modify the recorded units properly (fixes B4, B5)

- **2.1 Pitch marks in the pack (new v2 data).** At build time, detect the pitch period of each
  unit from the *source* recording with full surrounding context, and store the marks in
  `manifest.v2.json` together with (a) the internal phone boundary sample and (b) a voiced /
  unvoiced flag per frame. *Idea source:* pitch-synchronous modification needs pitch marks;
  MBROLA recommends keeping ~100 ms of context around a diphone for reliable pitch analysis and
  storing the phone border so half-phone durations can be changed independently (Dutoit et al.,
  ICSLP 1996). *Vocalis implementation:* our own autocorrelation-based period detector written
  for the build script, run offline where the full context exists, so the browser never pays for
  it. Nothing external is downloaded or copied.
- **2.2 Our own time-domain pitch-synchronous modification.** Given pitch marks, re-place
  windowed periods to change F0 and duration independently: overlap-add two-period windows
  centred on marks, with an equal-power window, duplicating or skipping periods to lengthen or
  shorten, and re-spacing marks to retune. Unvoiced frames get plain overlap-add with a
  non-pitch-synchronous window instead. *Idea source:* TD-PSOLA (Moulines & Charpentier 1990) —
  the concept of pitch-synchronous overlap-add for simultaneous F0 and duration change.
  *Vocalis implementation:* written from the concept, with our own window, our own mark
  interpolation, our own unvoiced handling and our own guard rails (limit modification ratios,
  refuse to modify stop bursts). This replaces the current global `resample()` + `wsolaStretch()`
  pair, which moves formants with pitch and clamps silently at 0.5–2.
- **2.3 Half-phone duration control.** Use the stored phone boundary (2.1) so a unit's left and
  right halves can be scaled independently — this is what makes a duration model sound natural
  instead of uniformly smeared.
- **2.4 Join smoothing that respects the signal.** At each boundary: search a small window for
  the minimum-energy / zero-crossing-aligned splice point, equalise RMS across the join, and
  cross-fade with an equal-power curve whose length depends on whether the region is voiced,
  unvoiced or silent. Never cross-fade across a stop burst. *Idea source:* weighted overlap-add
  splicing and waveform synchronisation at minimum-distortion blend points; MBROLA's finding that
  pitch smoothing at boundaries helps more than spectral smoothing; the Bengali *Subachan*
  result that correct pitch marks + energy rescaling + TD-PSOLA removed audible clicks at
  diphone joins. *Vocalis implementation:* our own boundary search and equalisation, using our
  own marks — no spectral resynthesis, no borrowed code.
- **2.5 Transparent copy synthesis as the objective gate.** Render a sentence that exists in
  the corpus using the recorded prosody (no modification) and compare with the original
  recording. If the joins are good, the difference should be near-imperceptible.
  *Idea source:* MBROLA's stated design criterion — a system should achieve transparent copy
  synthesis when original prosodic characteristics are not modified. *Vocalis implementation:*
  our own comparison harness (Phase 5) measuring waveform/cepstral distance and join
  discontinuity, plus a blind A/B against the original.

**Acceptance:** copy synthesis of a corpus sentence is preferred at chance level against the
original recording in a blind A/B; pitch −4 semitones at constant rate keeps formant positions
(measured) and adds no new spectral peaks; no clicks at joins in a 60-second render.

---

## Phase 3 — Cover every transition with the same speaker (fixes B2, B6, B7)

- **3.1 Mixed-rank inventory (quasi-diphone backoff).** Keep diphones for the transitions we
  have, and add **monophone** units from the same speaker as a backoff rank, plus a small set of
  longer units (demisyllables / common word fragments) for transitions that matter most.
  Today 344 of 1,681 pairs are absent in BDL (20.5%) and each miss injects a formant blip.
  *Idea source:* the quasi-diphone / mixed-rank inventory — a modified diphone concept that
  covers critical transitions while staying compatible with phone-length units for
  concatenation, keeping inventory small and intelligibility high. *Vocalis implementation:*
  our own rank ladder (`diphone → monophone pair → longest common fragment`) resolved in our own
  lookup, with the rank used reported per word so quality is visible.
- **3.2 Multiple candidates per diphone.** Store the best *N* units per pair (N≈3 for common
  pairs, 1 for rare) with their context label — which phones surrounded them, word position,
  stress, phrase position, F0 and energy at both edges, and the id of the source utterance so
  originally-adjacent units can be recognised. *Idea source:* unit selection keeps many copies
  of each diphone and chooses by target cost + join cost (Hunt & Black 1996; Black & Taylor
  1997 automatic unit clustering; Festival/Multisyn). *Vocalis implementation:* our own build
  step that extracts and stores these features, our own cost functions, our own search.
- **3.3 Viterbi selection over the utterance.** Choose the whole unit sequence at once,
  minimising Σ target cost + Σ join cost, with join cost ≈ 0 when two units were adjacent in
  the original recording (this is what makes long natural runs appear). Prune to the best few
  candidates per target to keep it fast in the browser. *Idea source:* the classic
  target-cost/join-cost decoding formulation and the zero-cost rule for naturally adjacent
  units. *Vocalis implementation:* our own dynamic-programming search — a short, well-tested
  function, no library.
- **3.4 Use the schwa units we already ship.** 73 BDL units contain `ax` and none are reachable,
  because the dictionary emits `AH0` and nothing maps unstressed `AH0 → ax`. Add that mapping
  (context-dependent: unstressed, non-word-initial) so reduced vowels sound reduced. Verify by
  listening — ARCTIC's automatic labels are not hand-corrected, so `ax`/`ah` usage must be
  spot-checked before trusting the mapping.
- **3.5 Report coverage, don't hide it.** Show inventory coverage per utterance
  (`pairs requested / pairs found at rank 1 / rank 2 / rank 3 / unavailable`) in the UI and in
  the render log.

**Acceptance:** zero formant-synthesizer substitutions on a 500-word test set from the same
speaker; ≥95% of transitions resolved at rank 1–2; a measurable drop in join cost versus
Phase 2 on the same test set.

---

## Phase 4 — Accent, speaker range and voice character (fixes A3, D10, F2)

- **4.1 Genuine accents from the same corpus and licence.** CMU ARCTIC ships more than BDL and
  SLT under the same CMU notice: `clb` (US female), `rms` (US male), `jmk` (Canadian English
  male), `awb` (Scottish English male), `ksp` (Indian English male), plus additional speakers
  with German, Indian and Israeli English accents. Adding `awb`, `jmk` and `ksp` as **new frozen
  packs** gives three authentic non-US accents with no new licence and no new technology —
  exactly what `docs/VOICE_LIBRARY_ROADMAP.md` demands before an accent may be claimed.
  Practical notes for the build: `ksp` is documented as 32 kHz stereo with an EGG channel and
  `awb` as release 0.90, so `scripts/build_cmu_voicepack.py` needs channel selection and
  resampling to 16 kHz mono before segmentation (our own code), and the resulting pack must be
  listening-checked against the others for level and noise. *Idea source:* CMU ARCTIC database
  documentation (Kominek & Black, CMU-LTI-03-177; festvox.org/cmu_arctic).
- **4.2 UK and Australian: real data or an honest label.** ARCTIC has no UK or AU speaker, so a
  "British" or "Australian" voice can only be (a) a rule-based approximation of a US recording,
  which must be labelled as an approximation, or (b) a new pack built from a properly licensed
  corpus — VCTK (110 English speakers across UK/IE/US/CA/AU/NZ/IN accents, ~44 h; distributed by
  Edinburgh CSTR under an attribution licence) or Mozilla Common Voice (CC0). Verify the exact
  licence text at the source before shipping, keep the notice with the pack, and mark
  modifications — the same three conditions we already meet for ARCTIC.
- **4.3 Accent as phonology + prosody, not EQ.** A convincing accent needs its own vowel target
  shifts, its own post-vocalic-R behaviour *with vowel lengthening*, its own TRAP/BATH/LOT
  distinctions, and its own intonation habits — driven through the same `ProsodyTrack` and
  pronunciation layer as everything else. *Idea source:* the general finding that voice/accent
  adaptation must change formant positions and bandwidths and source characteristics, not just
  F0, and that an accent requires appropriate phonology and prosody. *Vocalis implementation:*
  per-accent rule modules we write and validate by listening, with the affected words listed in
  the UI so the approximation is inspectable.
- **4.4 Rename or rebuild the "formant" sliders.** Either implement a genuine vocal-tract
  control — a tract-length scale that shifts F1–F4 proportionally with bandwidth correction,
  applied in the modification stage — or rename the three fixed EQ bands to what they are
  ("warmth / presence / air EQ"). *Idea source:* source-filter theory; formant scaling for
  voice-quality change. Prefer the real control: it is a few lines of our own math on the
  modification path and it makes the persona presets mean something.
- **4.5 Speaker character presets that survive scrutiny.** Rebuild the eight presets on the new
  controls (F0 range, spectral tilt, aspiration, tract scale, rhythm, intonation style), each
  with a stated method and a stated approximation level. Keep the descriptive-role policy — no
  celebrity names, no implied clones.

**Acceptance:** three authentic non-US accents selectable from new frozen packs; UK/AU either
backed by licensed data or visibly labelled "approximation"; every preset control demonstrably
changes the acoustic parameter it names.

---

## Phase 5 — Evaluation harness (makes every other phase provable)

- **5.1 Freeze an evaluation set.** ~40 sentences we write ourselves: statements, questions,
  commands, lists, numbers, dates, proper names, punctuation-heavy text, minimal pairs that
  stress the inventory (`record/record`, `sixth`, `twelfths`, `rural`, `asked`), a long
  paragraph, and a dialogue. Store the text, the voice settings, the rendered WAV and the
  listening notes per revision, so versions can be compared blind.
- **5.2 Objective metrics, our own implementations.** Join discontinuity (sample-difference
  spike at each boundary), spectral distance between adjacent unit edges, F0-track error against
  a target contour, duration error against the model, RMS/peak statistics and clipping count,
  and mel-cepstral-style distortion for the copy-synthesis test. All written by us from the
  definitions; no metric library. *Idea source:* standard objective TTS quality measures
  (mel-cepstral distortion, F0 RMSE, voiced/unvoiced error) and RMS-cost findings for segment
  selection.
- **5.3 Listening gates.** Blind A/B and preference tests on the frozen set, with a written
  rubric (intelligibility, smoothness of joins, naturalness of rhythm, naturalness of
  intonation, speaker consistency, absence of clicks). Record results in `docs/` next to the
  revision that produced them. A phase is not done until it passes listening, not just metrics.
- **5.4 Continuous contract check.** `npm run verify:base-voice` before every commit touching
  voice data or the engine; add the frozen evaluation set to it so the set cannot silently
  disappear either.

---

## Also fix, because they are cheap and they are wrong

From `docs/APPLICATION_AUDIT.md`, in the order they should be picked off:

| ID | Fix | Why it is quick |
| --- | --- | --- |
| B8 | Strip `#` annotations in the dictionary loader | one line + a test |
| C1 | Exclude binary/large files from `/api/project/files`; serve them on demand | prevents a 43.5 MB payload that mangles the voice data |
| C2 | Remove the token-based `push-github` endpoint and its modal flow | removes a command-injection sink and a force-push to `main` |
| C4/C5 | Rebuild the ZIP from the live tree in Node, excluding `.git`, caches and the ZIP itself; state real counts | makes the download honest and drops the `python3` runtime dependency |
| D1/D2 | Store takes in IndexedDB; revoke blob URLs | makes the Takes Vault survive a reload |
| D3/D4 | Build one graph for preview and export; stop and disconnect nodes | fixes the leak and the export mismatch |
| E6/E7/F2/F3 | Correct the credits copy, the licence name, the speaker provenance and the missing notice | licence-condition compliance |
| F1 | Replace `cmudict.txt` with our own ARCTIC-mined lexicon + G2P, or attribute it correctly | contract §3 |
| F5 | Replace the borrowed waveshaper curve in `audioDspEngine.ts` with our own soft-clip characteristic written for a broadcast band | the only foreign code in the tree today; contract §3 |
| E1/E2/E3 | Either re-expose the pitch trainer or move it out of `src/`; drop unused deps | 3,144 lines of dead product and a misleading title |

---

## Sequencing

```
Phase 0  wire the base voice in              → the product speaks typed text
Phase 1  utterance-level stream + prosody    → biggest naturalness jump, no new data
Phase 2  pitch marks + own TD-PSOLA + joins  → stops sounding processed
Phase 3  mixed-rank inventory + selection    → stops the synthetic blips (needs a pack rebuild, additive)
Phase 5  evaluation harness                  → runs alongside 1–3, not after
Phase 4  accents + real tract control        → new frozen packs, honest labels
```

Phases 1, 2 and 5 need no new corpus data. Phase 3 needs a pack rebuild that *adds*
`manifest.v2.json` / `units.v2.bin`. Phase 4 needs new corpora for `awb`, `jmk`, `ksp` (same
CMU licence) and, for UK/AU, a licensed accent corpus — those downloads are outside this
sandbox's network allow-list, so they are a user/CI step using the existing
`scripts/build_cmu_voicepack.py` flow.
