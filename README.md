# Vocalis

Vocalis is a browser-based, non-AI speech synthesizer. Its default voice assembles speech from real, time-aligned CMU ARCTIC recordings using local diphone concatenation. A mathematical formant synthesizer is available as an experimental alternative. The app does not depend on browser/system TTS, cloud services, neural voice generation, or voice cloning.

## The base voice is permanent

The recorded CMU ARCTIC base voice is a fixture of this project, not a component under review. It is never removed, never replaced, never re-encoded and never edited in place; recorded-unit synthesis stays the default method; and every improvement is made in the technology around it — pronunciation, prosody, duration, unit selection, join smoothing, pitch and accent modelling, playback, export and evaluation. New speakers are added as additional frozen packs alongside the existing ones.

No third-party source code lives in this repository. Only the licensed voice recordings come from outside, with their copyright notices retained. Published algorithms and research findings are used as ideas and re-implemented from scratch as original Vocalis code.

The rule, its enforcement and the data inventory are in [`docs/BASE_VOICE_CONTRACT.md`](docs/BASE_VOICE_CONTRACT.md); `config/base-voice.lock.json` pins the byte-exact fingerprints and `npm run verify:base-voice` checks them. Contributors and agents should also read [`AGENTS.md`](AGENTS.md).

## Current build status

The recorded-unit engine **is the product**: Speech Studio speaks the text you type, Dialogue Studio renders a conversation as one timeline, and the exported WAV is byte-identical to the preview. Nothing calls a server, a browser voice or a model.

Measured on the current tree by `npm run test:render` (555 checks) over ten passages and a 326-word passage: 573 exact recorded units plus 8 adaptations of the same speaker's own audio, **0 mathematical stand-ins**, 92.5–100 % recorded coverage, 10.1–17.0 % silence, 91–152 words per minute, peak exactly 0.78 with nothing clipped, every letter of the source text covered by a measured word span, and every profile's transformation measured on known signals (pitch lands on its shifted frequency with 99.99 % of the energy in a five-bin window, nothing folds back over Nyquist, and a 1.4× or 0.7× pace change leaves the pitch where it was). The full record, including what is still rough, is [`docs/PHASE2_PIPELINE_CORRECTION.md`](docs/PHASE2_PIPELINE_CORRECTION.md); how the joined units are given one pitch line, and what that is still not, is [`docs/RECORDED_VOICE_PROSODY.md`](docs/RECORDED_VOICE_PROSODY.md); the verified call graph is [`docs/PIPELINE_MAP.md`](docs/PIPELINE_MAP.md); every discrepancy found in a full investigation of the tree is listed in [`docs/APPLICATION_AUDIT.md`](docs/APPLICATION_AUDIT.md).

Beyond the two protected voices there is a **recorded voice library**: 107 human-recorded, non-neural databases were investigated, and 9 English ones have a working installer — five CMU ARCTIC speakers whose phone labels FestVox actually publishes (AWB, CLB, JMK, KSP, RMS), the CMU KAL diphone database, CSTR RAB, and two Festival diphone voices Debian ships as packages (DON, KED) — each installed, auditioned and removed on its own, as recorded and with no transformation. Six of them ship with the repository as ready-made packs, so a fresh clone speaks the moment you press Audition — no install, no terminal — and `npm run voices -- verify` renders a sentence with each and prints the seconds, the peak and the number of stand-ins, so the claim is measured rather than asserted. Eleven more ARCTIC speakers are catalogued but not installable: FestVox ships them as waveforms plus transcription with no phone labels, which the first real download (LJM) proved — 593 waveforms, 0 label files — so they are class C rather than a download that fails at the end. Run `npm run voices -- inspect <id>` to see what any archive really contains before installing it. Every slider carries its own on/off switch, and a switch really removes its stage — a bypassed pitch or pace is skipped by the engine rather than run at a value of 1.00, so what you hear with the switch off is the recording. — on the Text to Speech panels and in the creator — so a setting can be bypassed one at a time and the file rebuilt without whichever one is spoiling the voice. In the creator each row also has an **A/B** button that plays the sentence with that setting as set and then with it bypassed. The app is two products on two pages: **Text to Speech** (pick a voice from the dropdown at the top, type, hear it) and the **Voice File Creator** (the recorded voices as reorderable cards, every setting with its own on/off switch, a name for the new file, and the export — all on one page, so a setting that spoils a voice can be switched off and the file exported again without it).

Each installed voice can be **exported as one sealed `.vls` file** — the unit index and the original 16-bit samples in a container only Vocalis opens, with the licence inside and tamper detection before a single sample is used. It is lossless by construction, so an exported voice sounds exactly like the one that was installed. The format is specified in [`docs/VOCALIS_FILE_FORMAT.md`](docs/VOCALIS_FILE_FORMAT.md). The findings, the licences and the exclusions are in [`docs/VOICE_LIBRARY.md`](docs/VOICE_LIBRARY.md).

A second, smaller path transforms one pre-recorded reference sentence for A/B comparison. It is labelled "Audition source recording" in the interface and it is not what Play or Export use.

## Complete speech workflow

1. **Text preparation:** words and numbers are tokenized with exact character offsets; money, years, times, ordinals, percentages, signs, abbreviations, acronyms and single letters are expanded into the words a reader would say; a phone stream is built for the whole utterance and split into segments at sentence ends and line breaks only, so silence exists where a reader would breathe and nowhere else.
2. **Pronunciation:** Vocalis looks up words in the bundled CMU Pronouncing Dictionary (124,076 entries), preserves vowel stress, and applies local spelling-to-sound rules when a word is not found. Users can store pronunciation hints in browser storage.
3. **Default recorded voice:** the phoneme sequence selects compact units extracted from CMU ARCTIC 0.95 recordings. Vocalis joins the recorded waveform segments locally and then applies the profile: band-limited pitch resampling, a five-band timbre correction so a lower register is the same speaker, correlation-aligned pace change, tone character and three wide resonance bands. Every character filter is capped at 3 dB, because the measured failure of the previous version was the *sum* of them: a deep profile carried +13 dB through 315–500 Hz. The default selectable bases are BDL (male US English) and SLT (female US English); these are the only actual recorded speakers in the app.
4. **Experimental mathematical voice:** alternatively, phonemes are generated locally from shaped glottal-flow pulses and time-varying formant resonators, with modeled consonant noise and release bursts. This is synthetic speech, not a human recording, and it is still experimental.
5. **Playback and export:** one render feeds everything. `playRenderedSpeech` is the only playback path for generated speech, the WAV is encoded from the same sample array, and word highlighting is scheduled from that render's measured timings — a diphone join lands on a phone midpoint, so a word's position is measured rather than estimated. Every render reports its own diagnostics: exact units, same-speaker adaptations, stand-ins, coverage, guessed words, anything not spoken, the missing unit pairs and the dictionary actually used. No audio is sent to a server.

The recorded-unit method can still sound rough: the compact packs hold one selected candidate per diphone (1,337 BDL and 1,324 SLT units at 16 kHz, covering 79.5 % of the pairs a passage needs), the joins are equal-length crossfades with no splice search, and there is no duration model — units keep the length they were recorded at. The transformation stage around them no longer adds to that: [`docs/PHASE3_VOICE_TRANSFORM.md`](docs/PHASE3_VOICE_TRANSFORM.md) records what it used to do to a voice and what it does now, with the measurements. A pair that was never recorded is covered by two half units of the same speaker and counted in the render report, never by a synthesised stand-in. Vocalis should not call the output quality-proven until listeners evaluate it. UK and Australian settings are rule-based approximations to US-English recordings, not authentic regional recordings.

## Voice profiles

The active profiles are descriptive delivery presets, not separate human recordings or cloned identities. They vary register, pitch, speed, pronunciation rules, and signal-processing character over the selected local synthesis method. Only BDL and SLT are real recorded speakers. Accent and persona labels do not claim new authentic speakers.

## Attribution and licenses

The default recorded-unit method uses CMU ARCTIC material from Carnegie Mellon University; corpus authors John Kominek and Alan W. Black; Copyright © 2003. Vocalis extracted and repackaged selected, time-aligned diphone units. Full CMU notices and disclaimers are retained alongside each speaker bank and linked from the app's **Credits & licenses** item. The pronunciation dictionary notice is in `public/CMUDICT-LICENSE.txt`.

## Run locally

```sh
npm install
npm run dev
```

The development server listens on port 3000. `npm run build` type-checks the project and creates the production build.

## Requirements

Node.js **18.18 or newer** (`engines` in `package.json`; Node 20 LTS is what it is developed on)
and **Python 3**, used by the voice-library installers to unpack archives and cut WAV spans. The
Python executable is discovered automatically — `python3`, `python` or `py` — so a distribution
that only provides `python` works without a symlink. Everything else is in `npm install`.

The whole gate, in the order it should be run:

```sh
npm run lint                # type-check src
npm run test:engine         # 212 checks: text analysis against the real bundled dictionary
npm run test:render         # 555 checks: rendered audio, timings, silence, pace, determinism, export,
                            #   and the transformation itself measured on known signals
npm run test:voices         # 136 checks: the recorded voice library — catalogue, guards, conversion,
                            #   install/remove, the terminal command, and a voice actually speaking
npm run voices -- list      # the library from a terminal: list / install / inspect / verify / remove / urls
                            #   e.g. npm run voices -- install arctic-awb
npm run verify:base-voice   # frozen fingerprints, pack integrity, engine presence, no foreign code or TTS
npm run audit               # type-check plus the contract check
```

Both suites read the real assets in `public/` from disk through a small fetch shim, so they measure the shipped dictionary and the shipped unit packs rather than a fixture.

## Project documents

| Document | Purpose |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Binding rules for anyone working in this repository |
| [`docs/BASE_VOICE_CONTRACT.md`](docs/BASE_VOICE_CONTRACT.md) | The permanent base voice, what may never change, and what may |
| [`docs/PIPELINE_MAP.md`](docs/PIPELINE_MAP.md) | The verified call graph, module by module, with line numbers |
| [`docs/PHASE2_PIPELINE_CORRECTION.md`](docs/PHASE2_PIPELINE_CORRECTION.md) | What was broken, what was built, and every measurement |
| [`docs/PHASE3_VOICE_TRANSFORM.md`](docs/PHASE3_VOICE_TRANSFORM.md) | The pitch/pace/resonance stage: why profiles sounded metallic and what replaced it |
| [`docs/APPLICATION_AUDIT.md`](docs/APPLICATION_AUDIT.md) | Full investigation of the tree: discrepancies with measurements |
| [`docs/VOICE_IMPROVEMENT_PLAN.md`](docs/VOICE_IMPROVEMENT_PLAN.md) | Research-informed improvements, each specified as original Vocalis work |
| [`docs/VOICE_SYNTHESIS_RESEARCH.md`](docs/VOICE_SYNTHESIS_RESEARCH.md) | Evidence behind the synthesis design choices |
| [`docs/VOICE_LIBRARY_ROADMAP.md`](docs/VOICE_LIBRARY_ROADMAP.md) | Future voice library specifications (planning only) |
