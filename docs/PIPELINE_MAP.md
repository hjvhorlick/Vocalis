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
        ├─ speakText(text, model, callbacks)  src/utils/naturalVoiceEngine.ts:357
        │  renderSpeech(text, model)                                  :394
        │  renderDialogue(parts, timing)                              :520
        │    ├─ initializeLocalSpeechEngine(model)                    :281
        │    │    warms /cmudict.txt and the selected speaker's pack before the first Play
        │    ├─ synthesizeText(text, model)   src/utils/phonemeSynthesizer.ts:574
        │    │    ├─ analyzeText(text, accent) src/utils/textAnalysis.ts:1123
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
        │    │    ├─ BRANCH 'cmu-arctic' (the product)                 :603
        │    │    │    └─ renderCmuDiphones(segments, model, fallback, offset)
        │    │    │         src/utils/cmuDiphoneSynthesizer.ts:460
        │    │    │         ├─ speakerForModel(model)   slt / bdl       :133
        │    │    │         ├─ loadVoicePack(speaker)                   :141
        │    │    │         │    manifest.json + diphones.bin
        │    │    │         │    1,337 units bdl (5,582,516 B) / 1,324 slt (5,732,116 B)
        │    │    │         │    16 kHz 16-bit mono; offset in BYTES, length in SAMPLES
        │    │    │         ├─ per segment: lead → one chunk per joint → tail
        │    │    │         │    joint(left, right)                     :511
        │    │    │         │      1. the exact recorded unit  "a|b"
        │    │    │         │      2. outgoingHalfOf(a) + incomingHalfOf(b)   :342 / :355
        │    │    │         │         neighbours ranked by classOf, lengthFit,
        │    │    │         │         neighbourScore                     :246 / :280 / :286
        │    │    │         │      3. only if no half unit exists: the caller's
        │    │    │         │         mathematical phone, counted in fallbackPhones
        │    │    │         ├─ crossfadeJoinWithOffsets(chunks)          :401
        │    │    │         │    reports the boundary offset of every chunk
        │    │    │         └─ segmentStarts → phoneOffsets (measured)   :534 / :606
        │    │    ├─ BRANCH 'formant' (the preserved experiment)        :617
        │    │    │    buildPhoneSamples: glottal-flow pulse, formant resonators,
        │    │    │    coarticulation, stress-weighted duration, aspiration,
        │    │    │    frication, stop bursts, F0 declination            :178
        │    │    │    joinPhonesWithOffsets: equal-power crossfade      :308
        │    │    ├─ processCmuVoice(raw, model)   recorded path only    :637
        │    │    │    └─ transformRecordedVoice   src/utils/voiceTransform.ts:562
        │    │    │       shiftPitchBandLimited (windowed-sinc, anti-aliased) :190
        │    │    │       preserveFormants (measured envelope, ±6 dB, 100–5000 Hz) :449
        │    │    │       stretchTime (correlation-aligned overlap-add, 20 ms grid) :248
        │    │    │       applyToneStyle / peakingBand (tone, resonance sliders) :505 / :336
        │    │    ├─ normaliseSamples(combined, volume)                  :399
        │    │    │    make-up gain to the 0.78 ceiling, cap 4×, silence floor 0.02
        │    │    ├─ wordTimingsFrom(utterance, phoneOffsets, …)         :506
        │    │    │    a word boundary is halfway between two measured phone midpoints
        │    │    └─ encodeWav(samples, 16000) → Blob → object URL       :419
        │    └─ SynthesisResult { samples, sampleRate, duration, wordTimings,
        │                         diagnostics, wavBlob, audioUrl }       :487
        │
        ├─ PLAY  playRender(result)             naturalVoiceEngine.ts:406
        │        playDialogueRender(render)                             :646
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

Turn-taking rhythm for a conversation: `gapBeforeLine` (`naturalVoiceEngine.ts:501`) — 0.34 s
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
| 5 | Where is voice transformation applied? | Generated speech: `processCmuVoice` → `transformRecordedVoice` (`voiceTransform.ts`) — band-limited pitch resampling, a measured formant correction, correlation-aligned overlap-add for pace, then the tone character and the three resonance sliders. Pitch and rate are independent and neither is secretly re-scaled: pitch 0.72 and 1.4 both render 3.73 s of the reference sentence (measured median period 131 and 67 samples against 94 natural), while rate 1.4 → 2.66 s and rate 0.7 → 5.33 s at the same period. The reference-recording audition runs the same function over the recording, so the A/B compares one transformation, not two. |
| 6 | How is final audio produced? | `normaliseSamples` (make-up gain to the 0.78 ceiling, then the profile volume) and `encodeWav` (16 kHz mono 16-bit RIFF) produce one blob and one sample array. Playback wraps that same array in an `AudioBuffer`. |
| 7 | How do Speech Studio and Dialogue Studio access the engine? | Through `naturalVoiceEngine`: `speakText`, `renderSpeech`, `playRender`, `renderDialogue`, `playDialogueRender`, `stopSpeaking`, `releaseSynthesis`, `releaseDialogue`. There is exactly one playback implementation for generated speech (`playRenderedSpeech`). |
| 8 | Does WAV export use the same audio as playback? | Yes, byte-identically. The suite decodes the exported WAV and compares it sample by sample with the preview: maximum difference 0, inside a one-quantisation-step tolerance. Repeated renders of the same text and settings are also byte-identical, and Speech Studio reuses the existing render instead of regenerating it when nothing changed. |

---

## Module status

| Module | Lines | State |
| --- | --- | --- |
| `utils/textAnalysis.ts` | 1,321 | **New.** The text/pronunciation front end, extracted from `phonemeSynthesizer.ts` and rebuilt. 212 checks. |
| `utils/phonemeSynthesizer.ts` | 710 | **Rebuilt around segments.** Orchestrator, timings, normalisation and WAV encoding are new; the formant synthesizer (`getFormants` … `buildPhoneSamples`) and `buildWordProsody` are the preserved originals. |
| `utils/cmuDiphoneSynthesizer.ts` | 652 | **Head rebuilt, tail moved out.** Pack loading, indexing, assembly, half-unit backoff and offsets unchanged; the pitch/rate/character tail now delegates to `voiceTransform.ts`, so the assembly that *is* the base voice no longer contains signal processing. |
| `utils/naturalVoiceEngine.ts` | 753 | **Rewired.** One entry point, one dialogue timeline, presets that state their method and speaker, engine warm-up, and the audition feature kept as a labelled separate thing. |
| `utils/audioDspEngine.ts` | 290 | **Extended.** `samplesToAudioBuffer` + `playRenderedSpeech` are the single playback path for generated speech; `stopTransformedVoice` releases the analyser and no longer fires `onended`. The Web Audio node graph is gone: the audition transforms its buffer with `transformRecordedVoice` and plays the resulting samples, so playback and export of the reference recording are the same audio (D3 and D4 closed). |
| `utils/voiceTransform.ts` | 598 | **New.** The voice transformation stage: band-limited pitch resampling, formant preservation, correlation-aligned pace change, tone character, resonance sliders. Original code; see `PHASE3_VOICE_TRANSFORM.md` for the measurements. |
| `utils/naturalHumanAudio.ts` | 121 | **Retained, corrected.** Shared context and decode helpers unchanged; licence wording and speaker provenance fixed; each sample names its recorded speaker's pack. |
| `components/SpeechStudio.tsx` | 866 | **Rebuilt.** Script field, measured word highlighting, render reuse for export, a diagnostics panel, labelled audition. |
| `components/DialogueStudio.tsx` | 538 | **Rebuilt.** One timeline, per-line audition, turn-taking gap control, same-voice warning, render report. |
| `components/VoiceManipulator.tsx`, `PredefinedVoiceList.tsx`, `VoiceLibrary.tsx`, `VoiceShaper.tsx` | — | **Retained.** They audition a preset's phrase, which now really speaks that phrase. Their blob-URL leaks and persisted `blob:` takes are still open (D2). |
| Pitch-trainer suite (3,144 lines) | — | **Still disconnected.** Re-exposing it is Phase 5 work; nothing in this phase removed it. |
| `types/voice.ts` | 74 | **Retained as the Phase 4 target schema.** Not yet consolidated with `VoiceModelConfig`. |
| `scripts/build_cmu_voicepack.py` | 152 | **Retained.** Extending it to emit additive v2 packs is Phase 3. |
| `scripts/check_base_voice.mjs`, `config/base-voice.lock.json` | — | **Retained.** Reports CONTRACT HOLDS; its reachability check now requires a *component* that speaks generated text. |
| `tests/textAnalysis.test.ts`, `tests/renderSpeech.test.ts` | — | **New.** 212 + 534 checks, both running against the real bundled assets through a disk-backed fetch shim. |

---

## Where the transformation technology still has to improve

| Control | What it is now | What it needs to become |
| --- | --- | --- |
| Pitch | Band-limited (windowed-sinc) resampling, then the pace stage restores duration. Two thirds of the spectral envelope is put back, so a lower register sounds like the same speaker. | Independent F0 modification from pitch marks (pitch-synchronous overlap-add), with the envelope restored per phone rather than per render |
| Rate | Correlation-aligned overlap-add on a 20 ms grid to `length / rate`. Pitch is measured unchanged (period 70 samples at 1.4× and 0.7× against 73 at rest). | Per-phone target durations from a duration model, achieved by period duplication/skipping |
| Duration | The recorded units' own lengths; no model. The reference sentence takes 3.73 s against 3.00 s of speech in the original SLT recording | Target durations per phone from stress, position and boundary, with each half-phone time-scaled independently |
| "Formants" F1/F2/F3 | Three peaking bands at 450 / 1800 / 4200 Hz, applied to generated speech *and* the audition, with the band centres following the pitch shift by the un-preserved part of the tract scale | Real vocal-tract scaling: shift formant frequencies and bandwidths by a tract-length factor, preserving vowel identity per phone |
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
