# Vocalis

Vocalis is a browser-based, non-AI speech synthesizer. Its default voice is generated mathematically from phonemes using harmonic excitation, vocal-formant filters, timing, and prosody. It does not depend on a browser/system TTS engine, cloud service, neural model, or voice-cloning system.

## Complete speech workflow

1. **Text preparation:** words and numbers are tokenized; numbers are expanded into words, punctuation controls pauses, and ordinary spaces stay closely connected.
2. **Pronunciation:** Vocalis looks up words in the bundled CMU Pronouncing Dictionary (124,076 entries), preserves vowel stress, and applies local spelling-to-sound rules when a word is not found. Users can store pronunciation hints in browser storage.
3. **Default mathematical voice:** voiced phonemes use a shaped glottal-flow pulse and time-varying formant resonators; consonants add modeled aspiration, frication, and stop-release bursts. Dictionary stress controls duration and prominence, while punctuation shapes pauses. Pitch, register, and delivery controls modify the generated signal. Adjacent phones are smoothly joined. No source speech recording is used in this mode.
4. **Playback and export:** the same synthesis function powers voice auditions, the Speech Studio, dialogue playback, and PCM WAV export. Word highlighting follows synthesized audio timing. No audio is sent to a server.

A second method, **CMU ARCTIC recordings (experimental)**, is available from the voice controls for comparison. It joins selected units from CMU ARCTIC 0.95 speaker recordings. Its joins can sound rough; it is not the default or the quality target for the mathematical voice. The unit banks contain 1,337 BDL (male US English) and 1,324 SLT (female US English) diphones at 16 kHz. UK and Australian settings are rule-based approximations, not authentic regional recordings.

## Voice profiles

The active profiles are descriptive delivery presets, not separate human recordings or cloned identities. They adjust register, pitch, speed, pronunciation rules, and signal-processing character over the local synthesizer. Only US English male/female characteristics are supported by the optional CMU recordings. Accent and persona labels do not claim new authentic speakers.

## Attribution and licenses

The optional recorded-unit method uses CMU ARCTIC material from Carnegie Mellon University; corpus authors John Kominek and Alan W. Black; Copyright © 2003. Vocalis extracted and repackaged selected, time-aligned diphone units. Full CMU notices and disclaimers are retained alongside each speaker bank and linked from the app's **Credits & licenses** item. The pronunciation dictionary notice is in `public/CMUDICT-LICENSE.txt`.

## Run locally

```sh
npm install
npm run dev
```

The development server listens on port 3000. `npm run build` type-checks the project and creates the production build.
