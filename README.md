# Vocalis

Vocalis is a browser-based, non-AI speech synthesizer. Its default voice assembles speech from real, time-aligned CMU ARCTIC recordings using local diphone concatenation. A mathematical formant synthesizer is available as an experimental alternative. The app does not depend on browser/system TTS, cloud services, neural voice generation, or voice cloning.

## The base voice is permanent

The recorded CMU ARCTIC base voice is a fixture of this project, not a component under review. It is never removed, never replaced, never re-encoded and never edited in place; recorded-unit synthesis stays the default method; and every improvement is made in the technology around it — pronunciation, prosody, duration, unit selection, join smoothing, pitch and accent modelling, playback, export and evaluation. New speakers are added as additional frozen packs alongside the existing ones.

No third-party source code lives in this repository. Only the licensed voice recordings come from outside, with their copyright notices retained. Published algorithms and research findings are used as ideas and re-implemented from scratch as original Vocalis code.

The rule, its enforcement and the data inventory are in [`docs/BASE_VOICE_CONTRACT.md`](docs/BASE_VOICE_CONTRACT.md); `config/base-voice.lock.json` pins the byte-exact fingerprints and `npm run verify:base-voice` checks them. Contributors and agents should also read [`AGENTS.md`](AGENTS.md).

## Current build status

The recorded-unit engine **is the product**: Speech Studio speaks the text you type, Dialogue Studio renders a conversation as one timeline, and the exported WAV is byte-identical to the preview. Nothing calls a server, a browser voice or a model.

Measured on the current tree by `npm run test:render` (534 checks) over ten passages and a 326-word passage: 573 exact recorded units plus 8 adaptations of the same speaker's own audio, **0 mathematical stand-ins**, 92.5–100 % recorded coverage, 9.1–15.7 % silence, 91–152 words per minute, peak exactly 0.78 with nothing clipped, and every letter of the source text covered by a measured word span. The full record, including what is still rough, is [`docs/PHASE2_PIPELINE_CORRECTION.md`](docs/PHASE2_PIPELINE_CORRECTION.md); the verified call graph is [`docs/PIPELINE_MAP.md`](docs/PIPELINE_MAP.md); every discrepancy found in a full investigation of the tree is listed in [`docs/APPLICATION_AUDIT.md`](docs/APPLICATION_AUDIT.md).

A second, smaller path transforms one pre-recorded reference sentence for A/B comparison. It is labelled "Audition source recording" in the interface and it is not what Play or Export use.

## Complete speech workflow

1. **Text preparation:** words and numbers are tokenized with exact character offsets; money, years, times, ordinals, percentages, signs, abbreviations, acronyms and single letters are expanded into the words a reader would say; a phone stream is built for the whole utterance and split into segments at sentence ends and line breaks only, so silence exists where a reader would breathe and nowhere else.
2. **Pronunciation:** Vocalis looks up words in the bundled CMU Pronouncing Dictionary (124,076 entries), preserves vowel stress, and applies local spelling-to-sound rules when a word is not found. Users can store pronunciation hints in browser storage.
3. **Default recorded voice:** the phoneme sequence selects compact units extracted from CMU ARCTIC 0.95 recordings. Vocalis joins the recorded waveform segments locally and applies pitch/rate processing. The default selectable bases are BDL (male US English) and SLT (female US English); these are the only actual recorded speakers in the app.
4. **Experimental mathematical voice:** alternatively, phonemes are generated locally from shaped glottal-flow pulses and time-varying formant resonators, with modeled consonant noise and release bursts. This is synthetic speech, not a human recording, and it is still experimental.
5. **Playback and export:** one render feeds everything. `playRenderedSpeech` is the only playback path for generated speech, the WAV is encoded from the same sample array, and word highlighting is scheduled from that render's measured timings — a diphone join lands on a phone midpoint, so a word's position is measured rather than estimated. Every render reports its own diagnostics: exact units, same-speaker adaptations, stand-ins, coverage, guessed words, anything not spoken, the missing unit pairs and the dictionary actually used. No audio is sent to a server.

The recorded-unit method can still sound rough: the compact packs hold one selected candidate per diphone (1,337 BDL and 1,324 SLT units at 16 kHz, covering 79.5 % of the pairs a passage needs), the joins are equal-length crossfades with no splice search, and there is no duration model — units keep the length they were recorded at. A pair that was never recorded is covered by two half units of the same speaker and counted in the render report, never by a synthesised stand-in. Vocalis should not call the output quality-proven until listeners evaluate it. UK and Australian settings are rule-based approximations to US-English recordings, not authentic regional recordings.

## Voice profiles

The app opens on **Studio Neutral (SLT)** — pitch 1.00, pace 1.00, no delivery style, no resonance shift. At that setting the transformation stage is a proved pass-through: the audio is the joined recordings and nothing else, and the suite asserts it is bit-exact. Every other preset adds processing you can hear, and three of them (radio, robot, whisper) are deliberate effects rather than voices.

The active profiles are descriptive delivery presets, not separate human recordings or cloned identities. They vary register, pitch, speed, pronunciation rules, and signal-processing character over the selected local synthesis method. Only BDL and SLT are real recorded speakers. Accent and persona labels do not claim new authentic speakers.

## Attribution and licenses

The default recorded-unit method uses CMU ARCTIC material from Carnegie Mellon University; corpus authors John Kominek and Alan W. Black; Copyright © 2003. Vocalis extracted and repackaged selected, time-aligned diphone units. Full CMU notices and disclaimers are retained alongside each speaker bank and linked from the app's **Credits & licenses** item. The pronunciation dictionary notice is in `public/CMUDICT-LICENSE.txt`.

## Run locally

```sh
npm install
npm run dev
```

The development server listens on port 3000. `npm run build` type-checks the project and creates the production build.

The whole gate, in the order it should be run:

```sh
npm run lint                # type-check src
npm run test:engine         # 212 checks: text analysis against the real bundled dictionary
npm run test:render         # 534 checks: rendered audio, timings, silence, pace, determinism, export
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
| [`docs/APPLICATION_AUDIT.md`](docs/APPLICATION_AUDIT.md) | Full investigation of the tree: discrepancies with measurements |
| [`docs/VOICE_IMPROVEMENT_PLAN.md`](docs/VOICE_IMPROVEMENT_PLAN.md) | Research-informed improvements, each specified as original Vocalis work |
| [`docs/VOICE_SYNTHESIS_RESEARCH.md`](docs/VOICE_SYNTHESIS_RESEARCH.md) | Evidence behind the synthesis design choices |
| [`docs/VOICE_LIBRARY_ROADMAP.md`](docs/VOICE_LIBRARY_ROADMAP.md) | Future voice library specifications (planning only) |
