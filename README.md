# Vocalis

Vocalis is a browser-based, non-neural text-to-speech application. It assembles speech from recorded CMU ARCTIC audio units using classical diphone concatenation. It does not call a browser TTS engine, an AI model, or a cloud speech service.

## How synthesis works

1. Text is split into words and looked up in the bundled CMU Pronouncing Dictionary (124,076 English entries). Numbers are expanded and unfamiliar words use spelling-to-sound rules; users can save local pronunciation hints for names or exceptions.
2. The phoneme sequence is matched to compact, time-aligned diphone banks extracted from CMU ARCTIC 0.95 recordings. Vocalis selects and joins the recorded units, crossfades joins, and writes PCM WAV audio locally.
3. The recorded base is selected by register: BDL is the male US-English recording, and SLT is the female US-English recording. Pitch, rate, volume, and timbre controls modify the assembled audio; styles are signal-processing effects, not separately trained voices.

The two compact unit banks are in `public/voicepacks/cmu-arctic/`. They contain 1,337 BDL and 1,324 SLT diphones at 16 kHz. The source recordings were labeled automatically by the original corpus; unit joins can therefore sound rough, and unsupported diphones use a deterministic formant fallback. UK and Australian choices currently apply pronunciation rules to US-English source material—they are approximations, not recordings of those accents.

The displayed persona names and descriptions (for example, Storyteller or Presenter) are intended-use profiles over these two base speakers, not extra recorded identities. No voice training happens in the app. Custom voice settings and pronunciation hints are stored in the browser.

## Voice library plans

The planned persona and accent catalog is documented separately in [`docs/VOICE_LIBRARY_ROADMAP.md`](docs/VOICE_LIBRARY_ROADMAP.md). Those future personas are specifications only; they are not active voices yet.

## Attribution and licenses

The source voice recordings and labels come from the CMU ARCTIC corpus, Carnegie Mellon University; corpus authors John Kominek and Alan W. Black; Copyright © 2003. Vocalis has extracted and repackaged selected, time-aligned diphone units; the full CMU notices and disclaimers are included next to each speaker bank and are linked from the app's **Credits & licenses** footer item. The pronunciation dictionary notice is in `public/CMUDICT-LICENSE.txt`.

## Run locally

```sh
npm install
npm run dev
```

The development server listens on port 3000. `npm run build` type-checks the project and creates the production build.
