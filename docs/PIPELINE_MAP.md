# Vocalis technical map — verified state of the speech pipeline

Verified against the working tree on branch `arena/21e3d174-vocalis`, base commit `596f360`,
2026-11-06. Every statement below was re-checked in the current code, not carried over from an
earlier investigation. Line numbers are exact.

Two pipelines exist in this repository. **Path A is wired to the UI. Path B is the real
text-to-speech engine and is wired to nothing.**

---

## Path A — what the application actually does today

```
user clicks Play / Render
  └─ SpeechStudio.handlePlayLive            src/components/SpeechStudio.tsx:69
     SpeechStudio.handleRenderWav                                   :85
     VoiceManipulator.handleAudition        src/components/VoiceManipulator.tsx:46
     DialogueStudio.playDialogue            src/components/DialogueStudio.tsx:97
        └─ speakRealWords(text, model)      src/utils/naturalVoiceEngine.ts:247
             │   ⚠ the `text` argument is never read
             ├─ resolveBufferForModel(model)                        :231  (called at :258, :305)
             │    └─ NATURAL_HUMAN_SAMPLES.find(baseSampleId)  src/utils/naturalHumanAudio.ts:26
             │       └─ loadHumanVoiceBuffer(url)                    :93
             │          └─ fetch('/samples/cmu_*_arctic_a000X.wav')  (4 files, 3.2 s each)
             │             └─ ctx.decodeAudioData
             ├─ PLAY:   playTransformedVoice(buffer, dspConfig)  src/utils/audioDspEngine.ts:156
             └─ EXPORT: renderTransformedWav(buffer, dspConfig)                          :211
                  └─ buildDspGraph(ctx, source, config)                                   :28
                       1. source.playbackRate = clamp(pitch × rate, 0.4, 2.5)             :35
                       2. peaking EQ 450 Hz  Q1.2  gain=throatWarmth                      :40
                          peaking EQ 1800 Hz Q1.4  gain=oralClarity                       :46
                          peaking EQ 4200 Hz Q1.0  gain=airPresence                       :52
                       3. toneStyle branch: deep lowshelf / energetic peaking /
                          whisper hp+highshelf / radio hp+lp+waveshaper / robot ring-mod
                       4. masterGain(volume) → analyser → destination
```

**Path A does not generate speech.** It selects one of four pre-recorded CMU ARCTIC sentences by
`model.baseSampleId`, resamples it by a single factor, and applies EQ and effects. The words
spoken are always the words of that recording.

---

## Path B — the recorded-unit engine that exists but is unreachable

```
synthesizeText(text, model)                 src/utils/phonemeSynthesizer.ts:495
  ├─ loadDictionary()  → fetch('/cmudict.txt')  124,076 entries, "word|PHONES"    :64
  ├─ getWordMatches(text)   /[\p{L}]+(?:['’][\p{L}]+)*|\d+/gu                     :216
  ├─ per word:
  │    ├─ getWordProsody()  phrase position / phrase-final / question             :221
  │    ├─ appendSilence(getPauseAfter())   .!?→0.22 s  ,;:→0.11 s  space→0.012 s
  │    ├─ numberWords()      integers up to 9 digits → English words               :93
  │    ├─ wordPhones()       custom hint (localStorage) → dictionary →
  │    │                     DICT_FALLBACK (9 words) → fallbackGraphemeToPhones    :189 / :117
  │    ├─ applyAccent()      UK/AU: delete post-vocalic R                          :198
  │    │
  │    ├─ BRANCH 'cmu-arctic' (default, model.synthesisMethod ?? 'cmu-arctic')     :531
  │    │    ├─ stress digits stripped:  phones.map(splitPhoneStress(p).phone)      :534
  │    │    └─ renderCmuDiphones(phones, model, fallback, offset)
  │    │         src/utils/cmuDiphoneSynthesizer.ts:74
  │    │         ├─ speakerForModel(model)  Male→bdl, Female→slt, else baseVoiceId :16
  │    │         ├─ loadVoicePack(speaker) → manifest.json + diphones.bin          :22
  │    │         │    (5,582,516 B bdl / 5,732,116 B slt, 16 kHz 16-bit mono)
  │    │         ├─ stream = ['pau', …phones, 'pau']      ← per WORD, not per utterance :88
  │    │         ├─ units["left|right"] → Int16 slice ÷ 32768
  │    │         ├─ miss → formant fallback for that single phone                  :100
  │    │         └─ crossfadeJoin(): 96-sample linear ramp at every boundary       :49
  │    │
  │    └─ BRANCH 'formant' (experimental)                                          :539
  │         ├─ buildPhoneSamples(): glottal-flow pulse, 3 formant resonators,
  │         │  coarticulated transitions, stress-weighted duration, aspiration,
  │         │  frication, stop bursts, F0 declination + boundary tones    :324 / :267 / :290
  │         └─ joinFormantPhones(): 64-sample equal-power crossfade                :438
  │
  ├─ processCmuVoice(raw, model)   ← recorded path only                            :570
  │    src/utils/cmuDiphoneSynthesizer.ts:229
  │    ├─ resample(input, pitch × stylePitch)   linear interp, clamp 0.5–2         :119
  │    ├─ wsolaStretch(…, length ÷ (rate × rateStyle))   640-sample window         :133
  │    └─ applyStyle()  whisper / radio / robot only                               :204
  │
  ├─ word timings rescaled globally by combined.length ÷ raw.length                :572
  ├─ writeWav(combined, volume)  16 kHz mono 16-bit, peak-normalised to 0.78       :462
  └─ URL.createObjectURL(blob) → { audioUrl, wordTimings, duration }               :579

Importers of synthesizeText / renderCmuDiphones / processCmuVoice / prepareCmuVoice /
preparePronunciationDictionary / savePronunciationSpelling:  NONE.
Verified: grep -rn "phonemeSynthesizer|cmuDiphoneSynthesizer" src  → only the two files themselves.
```

---

## The eight questions, answered

| # | Question | Answer for the shipped app (Path A) | Answer for the engine (Path B, unreachable) |
| --- | --- | --- | --- |
| 1 | What happens when a user enters text? | Speech Studio has **no text field**; it renders the preset `samplePhrase` (`SpeechStudio.tsx:77, :88-89`, shown as "Source Sentence" at `:417`). Dialogue Studio has per-line text inputs (`DialogueStudio.tsx:214-216`) whose text is passed to `speakRealWords` at `:97` and **discarded**. `PredefinedVoiceList.tsx:131` is a voice-search box. No multi-line script field exists. | `synthesizeText(text, model)` tokenises the text and would speak exactly those words. Nothing calls it. |
| 2 | How is text converted to words and phonemes? | It is not. No tokenisation, no dictionary lookup, no grapheme rules on the wired path. | `getWordMatches` → `numberWords` → `wordPhones` (localStorage hint → `/cmudict.txt` → 9-word fallback → `fallbackGraphemeToPhones`), then `applyAccent`. |
| 3 | How are phonemes matched to recorded material? | They are not. The recording is chosen by `model.baseSampleId` from four fixed sentences. | `speakerForModel` picks BDL or SLT; `units["left|right"]` is looked up in the manifest; **stress is stripped first** (`:534`) so `AH0` and `AH1` request the same units; a miss splices in one formant-synthesised phone. |
| 4 | How are units assembled? | Not applicable. | `crossfadeJoin`: 96-sample (6 ms) **linear** crossfade at every boundary, on a per-word stream wrapped in `pau` on both sides. No pitch marks, no boundary alignment, no energy equalisation, no phase handling. |
| 5 | Where is voice transformation applied? | `buildDspGraph` (`audioDspEngine.ts:28-153`): one `playbackRate` factor for pitch **and** speed, three fixed-frequency peaking EQs labelled F1/F2/F3, and a tone-style effects branch. Identical graph for playback and export. | `processCmuVoice` (`cmuDiphoneSynthesizer.ts:229`): global linear resample for pitch, whole-utterance WSOLA for rate, then `applyStyle`. Formant branch instead shapes the source and tract per phone inside `buildPhoneSamples`. |
| 6 | How is final audio produced? | Live: Web Audio graph to `ctx.destination`. Export: `OfflineAudioContext` → `audioBufferToWavBlob` (`:262`) at the buffer's own sample rate, duration `buffer.duration ÷ playbackFactor + 0.3` (`:216`). | `writeWav` (`phonemeSynthesizer.ts:462`) builds a 16 kHz mono 16-bit RIFF blob, peak-normalised to 0.78 then scaled by `volume`; returns a blob URL plus word timings. |
| 7 | How do Speech Studio and Dialogue Studio access the engine? | Both call `speakRealWords` / `generateSpokenAudioWav` from `naturalVoiceEngine.ts`. Neither can reach `synthesizeText`. | Not accessed at all. |
| 8 | Does WAV export use the same audio as playback? | **Almost.** Same buffer and same `buildDspGraph`, but two differences: the robot ring-modulator and the analyser are gated on `ctx instanceof AudioContext` (`:96`, `:130`) so the offline render omits the robot effect entirely; and the offline render pads `+0.3 s` of silence. | Same `writeWav` output would serve both, since `synthesizeText` returns one blob URL — but there is no playback path wired to it either. |

**Verdict:** arbitrary text-to-speech does **not** work in the shipped application. The claim in
`README.md` and `docs/VOICE_SYNTHESIS_RESEARCH.md` that the shared path defaults to CMU ARCTIC
recorded units was true on earlier branches (`origin/arena/c292118c-vocalis`,
`origin/arena/f4cd97b0-vocalis`, where `naturalVoiceEngine.ts` imports `phonemeSynthesizer`) and
became false at commit `596f360`.

---

## Module verdicts

Retain / rewire / rebuild, under the rules that nothing working is removed and disconnected
features are re-connected rather than deleted.

| Module | Lines | Verdict |
| --- | --- | --- |
| `utils/phonemeSynthesizer.ts` | 581 | **Retain and split.** It currently hosts three responsibilities: the text→phoneme front end (reusable), the recorded-unit orchestration (the primary path), and the mathematical formant synthesizer (experimental, must be preserved per master prompt §14). Extract the front end and the recorded-unit orchestration into their own modules; leave the formant synthesizer as a clearly separated experimental subsystem with its own tests. |
| `utils/cmuDiphoneSynthesizer.ts` | 237 | **Retain, rebuild the processing.** Pack loading, unit indexing and speaker selection are sound. `crossfadeJoin`, `resample`, `wsolaStretch` and `applyStyle` are replaced by the new transformation engine (Phase 3). The file's public entry points stay. |
| `utils/naturalVoiceEngine.ts` | 323 | **Rewire.** `speakRealWords` must consume its `text` argument. `resolveBufferForModel`, `initializeLocalSpeechEngine` and the reference-sentence audition stay as an explicitly labelled "hear the source recording" feature — it is genuinely useful for A/B comparison and it is honest about what it is. |
| `utils/audioDspEngine.ts` | 292 | **Retain the graph concept, rebuild the DSP.** `playbackRate` pitch is replaced by real pitch/duration modification; the three fixed EQ bands become a genuine vocal-tract stage; robot/radio/whisper move into the shared transformation module so preview and export cannot diverge; the borrowed waveshaper curve (audit F5) is replaced with an original characteristic; node and oscillator leaks fixed. |
| `utils/naturalHumanAudio.ts` | 114 | **Retain.** Shared AudioContext, buffer cache and decode helpers are correct and reused. Fix the unsourced speaker-provenance strings and the licence naming (audit E7, F2). |
| `components/SpeechStudio.tsx` | 542 | **Retain the layout, add the missing input.** Needs a script field, a voice/delivery selector wired to real rendering, regeneration, and an honest label on the reference-sentence audition. |
| `components/DialogueStudio.tsx` | 254 | **Retain.** Its per-line text, cast pickers and sequential playback are the right shape; they simply need to reach `synthesizeText` per line with per-speaker configuration. |
| `components/VoiceManipulator.tsx` | 371 | **Retain, extend.** Becomes the voice-identity editor once profiles carry formant/resonance/timbre/texture/articulation/prosody parameters. |
| `components/PredefinedVoiceList.tsx`, `VoiceLibrary.tsx`, `VoiceNavbar.tsx`, `VoiceCredits.tsx`, `SourceVoiceAttribution.tsx`, `VoiceVisualizer.tsx`, `GitHubSyncModal.tsx` | — | **Retain.** Library needs persistent audio storage (IndexedDB) and versioned profile data; credits need the corrected licence wording; the GitHub modal needs the file-browser payload fixed and the token-push flow removed or made safe. |
| Pitch-trainer suite: `LivePitchMonitor`, `ScaleTrainer`, `VocalGym`, `VocalRangeFinder`, `PitchPipeKeyboard`, `Navbar`, `utils/audioPitch.ts`, `utils/scalesData.ts`, `types/vocalis.ts` | 3,144 | **Retain and re-expose.** Master prompt §16 forbids removing features just because they are not connected. `index.html` already titles the product "Vocal Studio & Pitch Trainer" and `metadata.json` declares `MICROPHONE_PITCH_ANALYSIS`, so the intended product includes this half. Add it back as a navbar tab group (Trainer: range finder, scale trainer, gym, live monitor, pitch pipe) rather than deleting it. |
| `components/VoiceShaper.tsx` | 360 | **Retain, decide its role.** It edits voice models against the old `naturalVoiceEngine`; either fold it into `VoiceManipulator` or expose it as the profile editor. Not deleted. |
| `types/voice.ts` (`AcousticVoicePersona`, `PhonemeDef`, `DialogueBeat`) | 74 | **Retain as the target specification.** Those unused fields (glottal open quotient, jitter, vibrato, tract-length scale, nasality, breathiness, intonation style, fx mode) are close to the profile schema Phase 4 needs. Consolidate with `VoiceModelConfig` into one versioned profile type instead of two competing models. |
| `scripts/build_cmu_voicepack.py` | 152 | **Retain and extend.** It is the tool that produces base-voice packs. Extend it to emit *new* v2 files (pitch marks, phone boundary, multiple candidates, context features) without touching the frozen v1 packs. |
| `scripts/check_base_voice.mjs`, `config/base-voice.lock.json` | 357 | **Retain.** The contract guard. |

---

## Where the transformation technology has to improve

Current capability, and what it actually is:

| Control | Current implementation | What it needs to become |
| --- | --- | --- |
| Pitch | `playbackRate = pitch × rate` (`audioDspEngine.ts:35`) — pitch and tempo locked together, formants move with pitch | Independent F0 modification from pitch marks (pitch-synchronous overlap-add), duration handled separately, formants preserved |
| Rate | Same factor; export adds `+0.3 s` | Per-phone target durations from a duration model, achieved by period duplication/skipping |
| "Formants" F1/F2/F3 | Three static peaking EQs at 450 / 1800 / 4200 Hz, ±10 dB | Real vocal-tract scaling: shift F1–F4 (and bandwidths) proportionally by a tract-length factor, preserving vowel identity, with spectral-envelope shaping between |
| Resonance / timbre | `throatWarmth`, `oralClarity`, `airPresence` are the three EQ bands above | Separate source controls (spectral tilt, aspiration, glottal openness) from tract controls (formant scale, bandwidth), plus chest/throat/nasal resonance as measurable spectral shaping |
| Texture | `toneStyle` presets: whisper = high-pass + attenuation; radio = band-pass + borrowed saturation curve; robot = 60 Hz ring mod with DC bias | Independently controllable breathiness, roughness/grain, softness, presence — each a defined, deterministic process, synchronised to voicing, never random noise |
| Articulation | None. Every effect is applied to the whole signal, consonants included | Voiced/unvoiced separation so sibilants, plosives and fricatives are protected; stop bursts excluded from pitch modification and from crossfades |
| Prosody | None on the recorded path (stress is stripped at `phonemeSynthesizer.ts:534`); `pau` inserted at every word boundary | Utterance-level phone stream; stress-driven duration, F0 and energy; declination, boundary tones, question rise; delivery styles layered on a stable identity |
| Joins | 96-sample linear crossfade everywhere | Minimum-energy / zero-crossing-aligned splice search, RMS equalisation across the join, equal-power fade sized by voiced/unvoiced/silence, no fade across bursts |
| Coverage | 1,337 of 1,681 BDL pairs (79.5%); misses inject formant audio | Same-speaker backoff ranks (monophones, longer fragments), multiple candidates per pair, cost-based selection, and a visible fallback count |
| Loudness / quality | Peak-normalise to 0.78 then multiply by volume | Loudness-consistent normalisation, peak control, click/pop detection at joins, de-harshing, no dynamics-destroying compression |
| Profiles | `VoiceModelConfig` with pitch/rate/volume/toneStyle/accent/gender + three EQ numbers, unversioned | Versioned profile schema covering all of the above, reproducible byte-for-byte for the same text and settings, exportable/importable |

---

## Recommended implementation order

```
Phase 1  Audit                                     ← this document + APPLICATION_AUDIT.md  ✅ done
Phase 2  Pipeline correction                       wire text → synthesizeText → playback/export
         2.1  extract the text/pronunciation front end from phonemeSynthesizer.ts
         2.2  speakRealWords consumes its text argument; Speech Studio gets a script field
         2.3  Dialogue Studio renders each line with its own speaker configuration
         2.4  one render result feeds preview, player and WAV export (no divergence)
         2.5  utterance-level phone stream: remove per-word pau wrapping (38% silence → 0)
         2.6  keep stress; fix dictionary annotation parsing; report fallback counts
         Gate: the words you type are the words you hear, in the recorded voice.

Phase 3  Voice transformation foundation           the core of the product
         3.1  central transformation module used by both studios (single implementation)
         3.2  pitch marks + phone boundaries into a NEW pack v2 (v1 stays frozen)
         3.3  original pitch-synchronous pitch/duration modification (independent controls)
         3.4  vocal-tract stage: formant frequency + bandwidth scaling, envelope shaping
         3.5  voiced/unvoiced separation to protect consonants
         3.6  join smoothing: splice search, energy equalisation, equal-power fades
         Gate: copy synthesis of a corpus sentence is indistinguishable from the original;
               pitch ±5 semitones at constant rate keeps vowels recognisable.

Phase 4  Voice identity                            profiles, not presets
         4.1  one versioned profile schema (consolidate VoiceModelConfig + AcousticVoicePersona)
         4.2  source / tract / resonance / texture / articulation / prosody parameter groups
         4.3  identity separate from delivery style (identity + style + emotion + text)
         4.4  deterministic rendering: same profile + same text ⇒ same audio
         Gate: nine distinct identities from one speaker, each reproducible.

Phase 5  Studio integration                        every control must move the audio
         5.1  Speech Studio: text, voice, delivery, characteristics, preview, regenerate, export
         5.2  Dialogue Studio: independent per-speaker configuration and timing
         5.3  Voice Library: create/save/rename/duplicate/edit/delete/preview,
              export/import settings, restore defaults, IndexedDB audio, versioned profiles
         5.4  re-expose the pitch-trainer suite as its own tab group
         Gate: no control exists that changes only its displayed value.

Phase 6  Quality                                   measurement and listening
         6.1  frozen evaluation set (our own sentences) + objective metrics
         6.2  join discontinuity, F0 error, duration error, loudness, clipping counters
         6.3  blind A/B and preference listening, recorded per revision
         6.4  performance: preload with progress, cache packs, keep renders off the UI thread
         Gate: listening tests pass; a 60-second render completes without stalling the page.
```

Phases 2 and 3 need no new corpus data. Phase 3's pack v2 is generated locally from the existing
source material by extending `scripts/build_cmu_voicepack.py`, and is additive — the frozen v1
packs in `config/base-voice.lock.json` are never touched.
