# Vocalis

Vocalis is a browser-based, non-AI speech synthesizer. Its default voice assembles speech from real, time-aligned CMU ARCTIC recordings using local diphone concatenation. A mathematical formant synthesizer is available as an experimental alternative. The app does not depend on browser/system TTS, cloud services, neural voice generation, or voice cloning.

## The base voice is permanent

The recorded CMU ARCTIC base voice is a fixture of this project, not a component under review. It is never removed, never replaced, never re-encoded and never edited in place; recorded-unit synthesis stays the default method; and every improvement is made in the technology around it — pronunciation, prosody, duration, unit selection, join smoothing, pitch and accent modelling, playback, export and evaluation. New speakers are added as additional frozen packs alongside the existing ones.

No third-party source code lives in this repository. Only the licensed voice recordings come from outside, with their copyright notices retained. Published algorithms and research findings are used as ideas and re-implemented from scratch as original Vocalis code.

The rule, its enforcement and the data inventory are in [`docs/BASE_VOICE_CONTRACT.md`](docs/BASE_VOICE_CONTRACT.md); `config/base-voice.lock.json` pins the byte-exact fingerprints and `npm run verify:base-voice` checks them. Contributors and agents should also read [`AGENTS.md`](AGENTS.md).

## Current build status

The base voice data and the recorded-unit engine are present, intact and verified, but the engine is **not yet reachable from the user interface**: no component imports it, so the app currently plays pre-recorded reference sentences through a Web Audio effects chain rather than speaking typed text. The speech workflow described below is what the engine does, and re-wiring it is the first task in [`docs/VOICE_IMPROVEMENT_PLAN.md`](docs/VOICE_IMPROVEMENT_PLAN.md). Every discrepancy found in a full investigation of the tree, with measurements, is listed in [`docs/APPLICATION_AUDIT.md`](docs/APPLICATION_AUDIT.md).

## Complete speech workflow

1. **Text preparation:** words and numbers are tokenized; numbers are expanded into words, punctuation controls pauses, and ordinary spaces stay closely connected.
2. **Pronunciation:** Vocalis looks up words in the bundled CMU Pronouncing Dictionary (124,076 entries), preserves vowel stress, and applies local spelling-to-sound rules when a word is not found. Users can store pronunciation hints in browser storage.
3. **Default recorded voice:** the phoneme sequence selects compact units extracted from CMU ARCTIC 0.95 recordings. Vocalis joins the recorded waveform segments locally and applies pitch/rate processing. The default selectable bases are BDL (male US English) and SLT (female US English); these are the only actual recorded speakers in the app.
4. **Experimental mathematical voice:** alternatively, phonemes are generated locally from shaped glottal-flow pulses and time-varying formant resonators, with modeled consonant noise and release bursts. This is synthetic speech, not a human recording, and it is still experimental.
5. **Playback and export:** the same synthesis path powers voice auditions, Speech Studio, dialogue playback, and PCM WAV export. Word highlighting follows synthesized audio timing. No audio is sent to a server.

The recorded-unit method can still sound rough because the current compact packs use one selected candidate per diphone and simple joins. The packs contain 1,337 BDL and 1,324 SLT units at 16 kHz. Vocalis should not call the output quality-proven until listeners evaluate it. UK and Australian settings are rule-based approximations to US-English recordings, not authentic regional recordings.

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

Before committing anything that touches the voice data, the synthesis engine, or the voice presets, confirm the base voice contract still holds:

```sh
npm run verify:base-voice   # frozen fingerprints, pack integrity, engine presence, no foreign code or TTS
npm run audit               # type-check plus the contract check
```

## Project documents

| Document | Purpose |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Binding rules for anyone working in this repository |
| [`docs/BASE_VOICE_CONTRACT.md`](docs/BASE_VOICE_CONTRACT.md) | The permanent base voice, what may never change, and what may |
| [`docs/APPLICATION_AUDIT.md`](docs/APPLICATION_AUDIT.md) | Full investigation of the tree: discrepancies with measurements |
| [`docs/VOICE_IMPROVEMENT_PLAN.md`](docs/VOICE_IMPROVEMENT_PLAN.md) | Research-informed improvements, each specified as original Vocalis work |
| [`docs/VOICE_SYNTHESIS_RESEARCH.md`](docs/VOICE_SYNTHESIS_RESEARCH.md) | Evidence behind the synthesis design choices |
| [`docs/VOICE_LIBRARY_ROADMAP.md`](docs/VOICE_LIBRARY_ROADMAP.md) | Future voice library specifications (planning only) |
