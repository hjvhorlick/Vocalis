# Vocalis technical map — verified state of the speech pipeline

Verified against the working tree on branch `arena/6903e65e-vocalis`, base commit `de6272a`,
2026-11-07. Every statement below was re-checked in the current code and measured by the two
suites (`npm run test:engine`, `npm run test:render`); line numbers are exact for this tree.

**One pipeline generates speech, and it is wired to the UI.** The words you type are the words
it speaks. A second, smaller path exists for A/B comparison against an original human
recording, and it is labelled as that in the interface.

Before-and-after measurements: [`PHASE2_PIPELINE_CORRECTION.md`](PHASE2_PIPELINE_CORRECTION.md).

---

## The generation path

```
user types a script and presses Play / Export WAV
  └─ SpeechStudio.handlePlayLive              src/components/SpeechStudio.tsx:155
     SpeechStudio.handleRenderWav                                     :181
     DialogueStudio.playConversation          src/components/DialogueStudio.tsx:180
     DialogueStudio.playSingleLine                                    :211
     PredefinedVoiceList / VoiceLibrary / VoiceManipulator / VoiceShaper
       speakRealWords(model.samplePhrase, …)  (an alias for speakText)
        │
        ├─ speakText(text, model, callbacks)  src/utils/naturalVoiceEngine.ts:384
        │  renderSpeech(text, model)                                  :421
        │  renderDialogue(parts, timing)                              :547
        │    ├─ initializeLocalSpeechEngine(model)                    :308
        │    │    warms /cmudict.txt and the selected speaker's pack before the first Play
        │    ├─ synthesizeText(text, model)   src/utils/phonemeSynthesizer.ts:593
        │    │    ├─ analyzeText(text, accent) src/utils/textAnalysis.ts:1123
        │    │    │    reference mode forces the accent to 'US'            :658
        │    │    │    pass 1  tokenize                                :134
        │    │    │    pass 2  spokenFormsOf(token)                    :385
        │    │    │            money, years, times, ordinals, signs,
        │    │    │            percentages, abbreviations, acronyms, letters
        │    │    │    pass 2b phonesForWord                           :1087
        │    │    │            saved spelling (localStorage)           :754
        │    │    │            → /cmudict.txt  124,076 entries          :645
        │    │    │            → EMERGENCY_PRONUNCIATIONS               :552
        │    │    │            → graphemesToPhones  (reported as guessed) :924
        │    │    │    pass 3  applyAccentTokens over the whole stream  :1043
        │    │    │            scanBoundary → boundaryAfter per word    :1229
        │    │    ├─ segmentUtterance(utterance)                       :1277
        │    │    │    splits at sentence ends and line breaks ONLY
        │    │    ├─ buildWordProsody(utterance, segments)  src/utils/phonemeSynthesizer.ts:347
        │    │    ├─ BRANCH 'cmu-arctic' (the product)                 :627
        │    │    │    └─ renderCmuDiphones(segments, model, fallback, offset)
        │    │    │         src/utils/cmuDiphoneSynthesizer.ts:689
        │    │    │         ├─ speakerForModel(model)   slt / bdl       :208
        │    │    │         ├─ loadVoicePack(speaker)                   :277
        │    │    │         │    manifest.json + diphones.bin
        │    │    │         │    1,337 units bdl (5,582,516 B) / 1,324 slt (5,732,116 B)
        │    │    │         │    16 kHz 16-bit mono; offset in BYTES, length in SAMPLES
        │    │    │         ├─ planDurations(segments, pack.intrinsic)  :780
        │    │    │         │    skipped when model.referenceRaw: with no plan the
        │    │    │         │    units are crossfaded at their recorded lengths
        │    │    │         │    (the shipped timing; the effects still apply after)
        │    │    │         │    src/utils/durationModel.ts:308 — how long each phone
        │    │    │         │    should be: DEFAULT_WEIGHTS               :141
        │    │    │         │    MIN_SECONDS_BY_CLASS (fricative 60 ms)   :224
        │    │    │         │    intrinsic durations from manifest.v2.json
        │    │    │         ├─ joinRetimed(pack, specs, plan, pitch)      :659
        │    │    │         │    markedUnitOf → two half-phone targets    :627
        │    │    │         │    synthesiseUnit  src/utils/psola.ts:569
        │    │    │         │      grains / capped / truncated / silent, counted
        │    │    │         │      in the diagnostics; level() normalises the
        │    │    │         │      overlap-add window sum                 :218
        │    │    │         │    joinInPhase → joins on the voice cycle   :675
        │    │    │         ├─ per segment: lead → one chunk per joint → tail
        │    │    │         │    joint(left, right)                     :745
        │    │    │         │      1. the exact recorded unit  "a|b"
        │    │    │         │      2. outgoingHalfOf(a) + incomingHalfOf(b)   :490 / :503
        │    │    │         │         neighbours ranked by classOf, lengthFit,
        │    │    │         │         neighbourScore                     :394 / :428 / :434
        │    │    │         │      3. only if no half unit exists: the caller's
        │    │    │         │         mathematical phone, counted in fallbackPhones
        │    │    │         ├─ crossfadeJoinWithOffsets(chunks)          :549
        │    │    │         │    reports the boundary offset of every chunk
        │    │    │         └─ segmentStarts → phoneOffsets (measured)   :784 / :898
        │    │    ├─ BRANCH 'formant' (the preserved experiment)        :663
        │    │    │    buildPhoneSamples: glottal-flow pulse, formant resonators,
        │    │    │    coarticulation, stress-weighted duration, aspiration,
        │    │    │    frication, stop bursts, F0 declination            :178
        │    │    │    joinPhonesWithOffsets: equal-power crossfade      :308
        │    │    ├─ processCmuVoice(raw, model, timedFromPlan)  :1109
        │    │    │    runs under BOTH timings — early return when pitch and
        │    │    │    rate are both 1 and the style is natural           :1123
        │    │    │    so the effects panel works on top of the recording,
        │    │    │    and all-neutral is still bit-exact the recording
        │    │    │    resample(pitch × stylePitch)                      :937
        │    │    │    wsolaStretch — skipped when the plan already re-timed the units :986
        │    │    │    applyStyle (whisper / radio / robot)              :1054
        │    │    ├─ applyResonance(samples, model)                       :453
        │    │    │    throatWarmth / oralClarity / airPresence become three
        │    │    │    peaking biquads — 450 Hz Q1.2, 1800 Hz Q1.4, 4200 Hz Q1.0,
        │    │    │    gains clamped ±24 dB, pass-through below 0.01 dB: peakingFilter :417
        │    │    │    also under both timings: 0 dB is the untouched sample
        │    │    ├─ normaliseSamples(combined, volume)                  :399
        │    │    │    make-up gain to the 0.78 ceiling, cap 4×, silence floor 0.02
        │    │    ├─ wordTimingsFrom(utterance, phoneOffsets, …)         :520
        │    │    │    a word boundary is halfway between two measured phone midpoints
        │    │    └─ encodeWav(samples, 16000) → Blob → object URL       :419
        │    └─ SynthesisResult { samples, sampleRate, duration, wordTimings,
        │                         diagnostics, wavBlob, audioUrl }       :501
        │
        ├─ PLAY  playRender(result)             naturalVoiceEngine.ts:433
        │        playDialogueRender(render)                             :690
        │          └─ playRenderedSpeech(samples, rate, callbacks)
        │               src/utils/audioDspEngine.ts:258
        │               samplesToAudioBuffer                            :234
        │               gain → analyser → destination; word events are scheduled
        │               from that render's own measured timings          :340
        │
        └─ EXPORT  result.wavBlob / result.audioUrl
             the SAME sample array, encoded once. Speech Studio reuses the render
             Play already made whenever renderKey() is unchanged  SpeechStudio.tsx:49,181
```

Turn-taking rhythm for a conversation: `gapBeforeLine` (`naturalVoiceEngine.ts:528`) — 0.34 s
when the turn changes hands, 0.15 s when the same voice continues, ×0.6 when the previous line
trailed off without punctuation. The recorded units carry their own sentence-final pause; these
gaps sit on top of it.

---

## The audition path (comparison against an original recording)

```
SpeechStudio.handleAuditionSource             src/components/SpeechStudio.tsx:205
  └─ auditionSourceRecording(model, callbacks) src/utils/naturalVoiceEngine.ts:726
       ├─ resolveBufferForModel(model)                                :698
       │    NATURAL_HUMAN_SAMPLES by baseSampleId  src/utils/naturalHumanAudio.ts:26
       │    a custom recording or upload replaces the reference, not the speech
       │    loadHumanVoiceBuffer → fetch('/samples/cmu_*_arctic_a000X.wav')  :98
       ├─ dspConfigFor(model)                                         :707
       ├─ PLAY   playTransformedVoice(buffer, config)  src/utils/audioDspEngine.ts:156
       └─ EXPORT renderTransformedWav(buffer, config)                 :314
            buildDspGraph: playbackRate, three peaking EQs, tone-style branch,
            masterGain → analyser → destination                       :28
```

This path transforms a **pre-recorded human sentence**. It does not generate speech and it is
not what Play or Export WAV use. It exists so a listener can compare the transformed reference
against the original, which is a legitimate and useful thing to be able to do — the button says
"Audition source recording".

Known divergences on this path only: pitch and tempo are still one `playbackRate` factor, and
the offline export omits the robot ring-modulation and pads 0.3 s. Both are recorded as open
findings (A2, D4) in [`APPLICATION_AUDIT.md`](APPLICATION_AUDIT.md) and are Phase 3 work, which
replaces this graph with the shared transformation module.

---

## The eight questions, answered for the shipped application

| # | Question | Answer |
| --- | --- | --- |
| 1 | What happens when a user enters text? | Speech Studio has a script field (`SpeechStudio.tsx:625`) and Play speaks exactly what is in it. Dialogue Studio generates each line's own text in its own speaker's voice and renders the conversation as one timeline. The four list/editor components audition a preset's `samplePhrase` through the same entry point. |
| 2 | How is text converted to words and phonemes? | `tokenize` → `spokenFormsOf` → `phonesForWord`: a saved spelling, then the bundled CMU dictionary (124,076 entries from file, 16 annotated lines counted, 0 rejected tokens), then a 21-word lifeboat, then Vocalis's own grapheme rules — and a word that needed the rules is listed in `diagnostics.guessedWords` and still gets a measured timing. `applyAccentTokens` then runs over the whole phone stream. |
| 3 | How are phonemes matched to recorded material? | `speakerForModel` picks SLT or BDL (explicitly on every preset; an unresolved voice resolves to SLT). Stress is carried on every `PhoneToken`; `packPhone` normalises the symbol for the *index* only (`AX`→`AH`, stress digit stripped). A pair that was never recorded is covered by two half units of the **same** speaker, ranked by phone class and by how close the unit's own length is to the corpus mean. |
| 4 | How are units assembled? | Per **segment** (a sentence), not per word: a lead, one chunk per joint, a tail, joined by `crossfadeJoinWithOffsets`, which reports where every boundary landed. Silence exists at sentence ends and line breaks. Measured: 9.1–15.7 % of a render, against 38 % when every word was wrapped in pauses. |
| 5 | Where is voice transformation applied? | Generated speech, in order: `planDurations` + `joinRetimed` re-time every half phone on its own pitch marks, so tempo is in the audio before any pitch work; `processCmuVoice` then resamples for pitch (WSOLA is skipped once the plan has re-timed the units) and `applyStyle` adds the tone character; `applyResonance` is three peaking biquads driven by `throatWarmth` / `oralClarity` / `airPresence`. Pitch and rate are independent, and both under-deliver at their extremes because a unit can only be stretched 1.35× or cut to 0.4× of its recorded length: pitch 0.50 measures 0.54× and 1.75 measures 1.65×; rate 0.60 delivers 1.34× slower against the 1.67× asked for. `model.referenceRaw` — absent or `true`, which is what both predefined voices ship — changes the TIMING only, not the effects: it removes the plan and the re-timing, and `processCmuVoice` + `applyResonance` still run and are pass-throughs at neutral. Every control on the effects panel therefore applies on its own to the recording, and all-neutral is bit-exact the recording. `referenceRaw: false` swaps in the duration model, so the default render is the recorded units at their recorded lengths with one normalising gain; the adjustments are opt-in behind a labelled switch in Speech Studio and the Voice Manipulator. The audition path still uses `buildDspGraph`, which couples pitch and rate. |
| 6 | How is final audio produced? | `normaliseSamples` (make-up gain to the 0.78 ceiling, then the profile volume) and `encodeWav` (16 kHz mono 16-bit RIFF) produce one blob and one sample array. Playback wraps that same array in an `AudioBuffer`. |
| 7 | How do Speech Studio and Dialogue Studio access the engine? | Through `naturalVoiceEngine`: `speakText`, `renderSpeech`, `playRender`, `renderDialogue`, `playDialogueRender`, `stopSpeaking`, `releaseSynthesis`, `releaseDialogue`. There is exactly one playback implementation for generated speech (`playRenderedSpeech`). |
| 8 | Does WAV export use the same audio as playback? | Yes, byte-identically. The suite decodes the exported WAV and compares it sample by sample with the preview: maximum difference 0, inside a one-quantisation-step tolerance. Repeated renders of the same text and settings are also byte-identical, and Speech Studio reuses the existing render instead of regenerating it when nothing changed. |

---

## Module status

| Module | Lines | State |
| --- | --- | --- |
| `utils/durationModel.ts` | 418 | **New.** How long each phone should be: intrinsic durations measured from the speaker's own pack, fourteen factors fitted against the four bundled recordings, per-class floors, a rate control that reaches everything. See [`DURATION_MODEL.md`](DURATION_MODEL.md). |
| `utils/psola.ts` | 707 | **New.** Re-times one recorded diphone to two half-phone targets on the pitch marks: overlap-add grains, a stretch ceiling, a cut for a voiced half asked to be under 0.4× of its recording, window-sum normalisation, and joins placed on the voice cycle. |
| `utils/textAnalysis.ts` | 1,321 | **New.** The text/pronunciation front end, extracted from `phonemeSynthesizer.ts` and rebuilt. 212 checks. |
| `utils/phonemeSynthesizer.ts` | 833 | **Rebuilt around segments.** Orchestrator, timings, normalisation, the resonance stage (`peakingFilter` / `applyResonance`) and WAV encoding are new; the formant synthesizer (`getFormants` … `buildPhoneSamples`) and `buildWordProsody` are the preserved originals. |
| `utils/cmuDiphoneSynthesizer.ts` | 1,139 | **Head rebuilt, tail preserved.** Pack loading and indexing kept; assembly, half-unit backoff and offsets are new; it now plans durations and re-times every unit to them, and reports how each half was realised; `resample`, `wsolaStretch`, `applyStyle` kept, and `processCmuVoice` leaves already-timed audio alone. |
| `utils/naturalVoiceEngine.ts` | 812 | **Rewired.** One entry point, one dialogue timeline, presets that state their method and speaker, engine warm-up, the audition feature kept as a labelled separate thing, and `referenceRaw` on the profile for the labelled unadjusted reference. |
| `utils/audioDspEngine.ts` | 395 | **Extended.** `samplesToAudioBuffer` + `playRenderedSpeech` are the single playback path for generated speech; `stopTransformedVoice` releases the analyser and no longer fires `onended`. `buildDspGraph` remains for the audition path and is Phase 3's replacement target. |
| `utils/naturalHumanAudio.ts` | 121 | **Retained, corrected.** Shared context and decode helpers unchanged; licence wording and speaker provenance fixed; each sample names its recorded speaker's pack. |
| `components/SpeechStudio.tsx` | 866 | **Rebuilt.** Script field, measured word highlighting, render reuse for export, a diagnostics panel, labelled audition. |
| `components/DialogueStudio.tsx` | 538 | **Rebuilt.** One timeline, per-line audition, turn-taking gap control, same-voice warning, render report. |
| `components/VoiceManipulator.tsx`, `PredefinedVoiceList.tsx`, `VoiceLibrary.tsx`, `VoiceShaper.tsx` | — | **Retained.** They audition a preset's phrase, which now really speaks that phrase. Their blob-URL leaks and persisted `blob:` takes are still open (D2). |
| Pitch-trainer suite (3,144 lines) | — | **Still disconnected.** Re-exposing it is Phase 5 work; nothing in this phase removed it. |
| `types/voice.ts` | 74 | **Retained as the Phase 4 target schema.** Not yet consolidated with `VoiceModelConfig`. |
| `scripts/build_cmu_voicepack.py` | 152 | **Retained, never re-run.** It built the frozen v1 index; `unit_quality` at :41-63 prefers units near 160 ms, which is why about half of all half-phones must be squeezed. |
| `scripts/build_cmu_voicepack_v2.py` | — | **New.** Derives pitch marks, phone boundaries and per-phone durations from the frozen v1 audio into `manifest.v2.json` beside it. Additive: v1 stays byte-identical. |
| `scripts/check_base_voice.mjs`, `config/base-voice.lock.json` | — | **Retained.** Reports CONTRACT HOLDS; its reachability check now requires a *component* that speaks generated text. |
| `tests/textAnalysis.test.ts`, `tests/renderSpeech.test.ts` | — | **New.** 212 + 710 checks, both running against the real bundled assets through a disk-backed fetch shim. The render suite measures the four intact recordings at run time and anchors its pace, silence and rhythm bands on them. |

---

## Where the transformation technology still has to improve

| Control | What it is now | What it needs to become |
| --- | --- | --- |
| Pitch | `resample` by a factor, then WSOLA back to the original duration. Duration-neutral, but formants move with pitch. | Independent F0 modification from pitch marks (pitch-synchronous overlap-add) with formant preservation |
| Rate | WSOLA over the whole utterance to `length / rate`, plus per-style rate factors | Per-phone target durations from a duration model, achieved by period duplication/skipping |
| Duration | The recorded units' own lengths; no model. The reference sentence takes 3.73 s against 3.00 s of speech in the original SLT recording | Target durations per phone from stress, position and boundary, with each half-phone time-scaled independently |
| "Formants" F1/F2/F3 | Three static peaking EQs at 450 / 1800 / 4200 Hz on the audition path only | Real vocal-tract scaling: shift formant frequencies and bandwidths by a tract-length factor, preserving vowel identity |
| Joins | Equal-length crossfades at every joint, sized by unit kind | Splice search at minimum energy or a zero crossing, RMS equalisation across the join, equal-power fades sized by voiced/unvoiced/silence, no fade across a stop burst |
| Coverage | 79.5 % of the pairs a passage needs; misses covered by same-speaker half units, ranked by class and length, and counted (0 mathematical stand-ins measured) | Pack v2: the internal phone boundary, pitch marks, several candidates per pair, and cost-based selection (target + join cost) over a pruned lattice |
| Articulation | None. Effects apply to the whole signal, consonants included | Voiced/unvoiced separation so sibilants, plosives and fricatives are protected |
| Prosody | `buildWordProsody` shapes the experimental path; the recorded path uses the units' own prosody, with segment-level pauses and dialogue gaps | Stress-driven duration, F0 and energy on the recorded path; declination, boundary tones, question rise |
| Loudness | Peak-normalise to 0.78, make-up gain capped at 4×, then the profile volume | Loudness-consistent normalisation, click/pop detection at joins, de-harshing |
| Profiles | `VoiceModelConfig`, unversioned: pitch, rate, volume, toneStyle, accent, gender, three EQ numbers, method, speaker | One versioned profile schema covering source / tract / resonance / texture / articulation / prosody, reproducible byte-for-byte |

---

## Implementation order

```
Phase 1  Audit                                     ✅ done — APPLICATION_AUDIT.md
Phase 2  Pipeline correction                       ✅ done — this map + PHASE2_PIPELINE_CORRECTION.md
         2.1  text/pronunciation front end extracted into textAnalysis.ts
         2.2  speakText consumes its text argument; Speech Studio has a script field
         2.3  Dialogue Studio renders each line with its own speaker, as one timeline
         2.4  one render feeds preview, player and WAV export — verified byte-identical
         2.5  utterance-level phone stream: 38 % silence → 9.1–15.7 %
         2.6  stress kept; dictionary annotations parsed; fallbacks and guesses reported
         Gate: the words you type are the words you hear, in the recorded voice. ✅ measured

Phase 3  Voice transformation foundation           ← next
         3.1  one transformation module used by both studios and the audition path
         3.2  pitch marks + phone boundaries into a NEW pack v2 (v1 stays frozen)
         3.3  original pitch-synchronous pitch/duration modification
         3.4  vocal-tract stage: formant frequency and bandwidth scaling
         3.5  voiced/unvoiced separation to protect consonants
         3.6  join smoothing: splice search, energy equalisation, equal-power fades
         Gate: copy synthesis of a corpus sentence is indistinguishable from the original;
               pitch ±5 semitones at constant rate keeps vowels recognisable.

Phase 4  Voice identity                            versioned, reproducible profiles
Phase 5  Studio integration                        library CRUD, IndexedDB audio, re-expose the
                                                   pitch-trainer suite
Phase 6  Quality                                   frozen evaluation set, objective metrics,
                                                   blind A/B, copy synthesis against the recording
```

Phases 3 to 6 need no new corpus data from outside. Phase 3's pack v2 is generated locally from
the existing licensed material by extending `scripts/build_cmu_voicepack.py`, and is additive —
the frozen v1 packs pinned in `config/base-voice.lock.json` are never touched.
