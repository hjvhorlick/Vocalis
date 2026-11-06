# Vocalis

Vocalis is a browser-based, non-AI speech synthesizer. Its default voice assembles speech from real, time-aligned CMU ARCTIC recordings using local diphone concatenation. A mathematical formant synthesizer is available as an experimental alternative. The app does not depend on browser/system TTS, cloud services, neural voice generation, or voice cloning.

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
