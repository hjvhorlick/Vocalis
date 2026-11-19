# Vocalis

Vocalis is an **experimental, local, non-neural voice application**. It lets a
listener assess protected original recordings, create separately labelled local
voice variants, narrate eligible scripts, and export genuine MP3 delivery files.
It uses no cloud TTS, browser/system TTS, speech-recognition model, or neural
voice generator.

## Start

```sh
npm ci
npm run dev
```

The live development app listens on port 3000. For a real URL:

```sh
npm run build
npm start
```

Serve over HTTPS for microphone access. See [deployment and handoff](docs/DEPLOYMENT.md).

## Four-section workflow

1. **Original Voices:** listen to the 60 protected original recordings and give each a personal five-star naturalness rating.
2. **Voice Creator:** select one original in a compact dropdown, adjust its bounded local voice controls, test it, and create a separate variant.
3. **New Voice Library:** holds only created variants. It starts empty in a new browser and never contains or changes an original import.
4. **Script to MP3:** select an original or created voice, paste a script, test the narration, then create and download a genuine MP3 delivery file.

Original-reference clips remain available in the script selector but cannot honestly narrate new words without a matching voice bank. They are clearly labelled instead of being silently substituted with another voice.

### Current limitations—not quality guarantees

- Manual alignment requires careful listening and phonetic judgement. A suggested
  sound sequence is not evidence that the audio contains those sounds.
- New sound-bank synthesis supports the 39-symbol English ARPABET inventory.
  Stress digits, expressive prosody, automatic acoustic alignment and authentic
  accent modelling are not implemented. Spell out numbers in custom-bank tests.
- The 20 starter prompts are a small practice script, not a complete corpus.
  Even 39/39 sound coverage does not imply complete transitions or natural speech.
- Banks keep up to eight candidates for each one-, two- or three-phone sequence.
  A deterministic beam search considers join discontinuity and unit duration;
  short crossfades reduce clicks. This may still sound choppy or robotic.
- Current custom-bank pitch/rate tuning uses coupled playback-rate processing.
- Actual microphone/speaker quality and intelligibility require human evaluation.
  Automated tests use synthetic audio to check mechanics, not naturalness.

## Existing presets and playback

`speakRealWords` and `generateSpokenAudioWav` now render the supplied text through
the same synthesis path. They no longer replay an unrelated sample in its place.
Original imported recordings are available separately as **Listen to original
source clip (not typed text)**.

The preset catalog comprises delivery profiles over two packaged CMU ARCTIC
bases: BDL and SLT. It is **not sixty independently recorded arbitrary-text
voices**. Missing units in those built-in banks can use deterministic formant
sounds; missing/corrupt bank assets raise an error. A separate mathematical
formant method is also available to profiles that select it. Regional rules and
profile character labels are approximations, not new recorded identities.

Existing installed sound banks have a strict coverage gate and do **not** use
CMU or mathematical fallback sounds. Playback cancellation invalidates pending
renders; word timing callbacks are supplied for generated speech. Voice Creator
and Script to MP3 use the same renderer. Errors are visible in the application.

## Storage and personal ratings

- Recording projects, installed bank audio and saved WAV takes use IndexedDB.
  Vault audio survives reloads; old localStorage-only blob URLs cannot be recovered.
- Voice profile metadata, pronunciation preferences and five-star ratings use
  localStorage. Each voice can be graded, changed or cleared; ratings are shared
  across views and stay personal to this browser.
- Storage belongs to one browser origin and is not an account or cloud backup.
  Export project/bank files and download important WAV takes before changing URLs.
- A save failure is reported. Open recording projects remain in memory where
  possible, but unsaved data can be lost on reload. Avoid concurrent editing of
  one project in multiple browser tabs.

## Attribution and rights

The packaged CMU ARCTIC banks retain the corpus notices beside their audio.
`public/CMUDICT-LICENSE.txt` retains the bundled dictionary packaging notice and
upstream CMU dictionary notice. Sound-bank exports include those dictionary
notices and preserve notices on re-export. Credits are linked in the UI.

A permission checkbox is not a signed speaker release or commercial clearance.
Recordings, scripts, libraries and imported samples have separate rights. A new
format does not remove them. No blanket commercial license or novel-invention
claim is made for the project; complete the rights audit and choose appropriate
application/data licenses before commercial distribution.

## Checks

```sh
npm run lint
npm test
npm run build
```

An optional browser workflow test covers recording import, reviewed labels,
bank creation, missing-sound refusal, installation, export/import, vault reload
and mobile layout. See [deployment notes](docs/DEPLOYMENT.md) for running it.
