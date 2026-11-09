# Vocalis

Vocalis is an **experimental, local, non-neural voice application**. It can record
sentences, let a person mark their sounds, build a reusable sound bank, synthesize
new text from covered sounds, and export WAV audio. It uses no cloud TTS,
browser/system TTS, speech-recognition model, or neural voice generator.

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

## Create your own voice

Open **Record a Voice**:

1. **Read & record:** create a project and confirm permission. Test the microphone,
   read a sentence, stop, listen, and choose **Keep & next**. You can also upload
   a short audio take. Add your own sentences when needed.
2. **Mark sounds:** select a recording and suggest its English phoneme sequence.
   The starting boundaries are **evenly spaced placeholders**, not automatic
   alignment. Listen to each sound, move the start/end boundaries, correct the
   labels, check the review box, and save.
3. **Build & test:** build a bank from reviewed recordings. Test new sentences;
   missing sounds or unknown pronunciations block output instead of borrowing
   another speaker. Tap a missing sound to add a recording prompt. Correct
   pronunciations here and rebuild after project changes.
4. **Add to voice library:** install the bank for Voice Hub, Voice Creator and
   Dialogue playback. Export a sound-bank `.vvoice` for another browser/site.
5. **Back up project:** `.vproject` keeps recordings, prompts, sound labels and
   pronunciation entries so the voice can be rebuilt later.

**Use my recordings** remains a separate whole-phrase arranger: sequence saved
sentences and export a WAV without sound annotation. Its phrase `.vvoice` is not
an arbitrary-text bank. [Format details](docs/RECORDING_FORMAT.md) distinguish the
formats despite their shared extension.

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

User-built sound banks have a strict coverage gate and do **not** use CMU or
mathematical fallback sounds. Playback cancellation invalidates pending renders;
word timing callbacks are supplied for generated speech. Voice Creator tuning and
Dialogue use the same renderer. Errors are visible in the application.

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
