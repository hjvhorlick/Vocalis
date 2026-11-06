# Vocalis application audit

Full-tree investigation of commit `596f360` (branch `arena/21e3d174-vocalis`), 2026-11-06.
Every number below was measured against this working tree, not estimated. Severity:
**P0** blocks the product promise, **P1** materially degrades the voice or the app,
**P2** correctness/hygiene, **P3** polish.

Scope: 7,520 lines of `src/`, `server.ts`, `scripts/`, `public/` data, `docs/`, packaging.

Companion documents: `docs/BASE_VOICE_CONTRACT.md` (the permanent rule),
`docs/VOICE_IMPROVEMENT_PLAN.md` (research-backed fixes, in priority order).

---

## Headline

The base voice data is intact and verified, but **the base voice is not in the product**.
The recorded-unit speech synthesizer exists, is complete, is the documented default — and
nothing imports it. The app currently plays one of four pre-recorded reference sentences
through an effects chain, whatever text you type. That single fact explains most of the
"not perfect yet" feeling, and it is a wiring regression, not a voice-quality problem.

---

## A. P0 — the base voice is disconnected from the UI

**A1. The recorded-unit TTS engine is dead code.**
`src/utils/phonemeSynthesizer.ts` (581 lines, exports `synthesizeText`) and
`src/utils/cmuDiphoneSynthesizer.ts` (237 lines, exports `renderCmuDiphones`,
`processCmuVoice`, `prepareCmuVoice`) are imported by **no file** in the tree. Verified two
ways: import-graph walk from `src/main.tsx`, and `grep -rn "synthesizeText|phonemeSynthesizer|prepareCmuVoice|renderCmuDiphones" src server.ts` outside those two files → no hits.
Consequences:

- There is **no text input for speech anywhere**. `grep -rln textarea src` → no hits.
- `speakRealWords(text, model)` in `naturalVoiceEngine.ts` accepts `text` and never reads it.
  It calls `resolveBufferForModel(model)`, which returns the reference WAV named by
  `model.baseSampleId`. `tsconfig.json` sets `noUnusedParameters: false`, so the compiler
  stays quiet about the ignored argument.
- `DialogueStudio.tsx` lets the user type four lines of dialogue and "Play Full Conversation
  Aloud". Each line plays the *same* fixed sentence belonging to that voice's
  `baseSampleId`. The default line 3 literally reads "The text is mapped to phonemes and
  assembled from recorded CMU ARCTIC speech units" — spoken output does not do this.
- `SpeechStudio.tsx` renders `activeModel.samplePhrase`, a preset string, not user text.
- The 11 MB of diphone PCM and the 3.3 MB dictionary in `public/` are shipped, served and
  fingerprinted, and never fetched by the running app.

**A1a. This is a regression, and the fix already exists in history.** On
`origin/arena/c292118c-vocalis` (`2691f9c fix: default to recorded CMU voices and repair
joins`) and `origin/arena/f4cd97b0-vocalis` (`ca6122b`), `src/utils/naturalVoiceEngine.ts`
*does* import `phonemeSynthesizer`. Commit `596f360` replaced that engine with the
sample-playback DSP path and left the synthesizer behind. `docs/VOICE_SYNTHESIS_RESEARCH.md`
still states "The shared text-to-speech path defaults to CMU ARCTIC recorded units for
audition, Speech Studio, dialogue, and WAV export" — true on those branches, false on `main`.

**A2. "Pitch Height" does not shift pitch.** `audioDspEngine.buildDspGraph` does
`source.playbackRate.value = clamp(config.pitch * config.rate, 0.4, 2.5)`. One resampling
factor drives both controls, so pitch and tempo move together (the classic chipmunk effect)
and there is no independent pitch control anywhere in the wired path. `renderTransformedWav`
uses the same factor for export. The UI presents two separate sliders, `VoiceManipulator`
labels one "Pitch Height" 0.50–1.75× and one "Speaking Pace" 0.60–1.50×, and
`PRESET_VOICE_MODELS` sets e.g. Marcus at `pitch: 0.72, rate: 0.9` → playbackRate 0.648,
i.e. 35% slower *and* 35% flatter, not a deep voice at natural speed.

**A3. Accent has no acoustic effect.** `model.accent` (`US|UK|AU|Global`) is read only by
`phonemeSynthesizer.applyAccent` and `getFormants` — both dead (A1). Nothing in the wired
path consumes it. So "Oliver (Distinguished Baritone)" 🇬🇧 and "Charlotte (Period Classic)"
🇬🇧 are US-English recordings with a pitch/EQ preset, while `PredefinedVoiceList` offers a
region filter (`ALL|US|UK|AU|Global|Custom`) that implies a real difference. Even after A1 is
fixed, `applyAccent` only deletes post-vocalic `R` for UK/AU; it does not lengthen or centre
the vowel, so "car" → /kɑ/ rather than RP /kɑː/. `docs/VOICE_LIBRARY_ROADMAP.md` already
requires validated pronunciation or a real accent corpus before an accent may be claimed.

**A4. Synthesis method and base speaker are unreachable.** `synthesisMethod`
(`'cmu-arctic' | 'formant'`) and `baseVoiceId` (`'slt' | 'bdl'`) exist in `VoiceModelConfig`,
`App.handleNewVoice` sets `synthesisMethod: 'cmu-arctic'`, and no component offers a control
for either. The eight presets never set `synthesisMethod`. Speaker choice happens implicitly
through `gender` (`speakerForModel`: Male→bdl, Female→slt, Neutral→`baseVoiceId ?? 'slt'`),
so "Unit-7 (Cyber Droid)" (Neutral, no `baseVoiceId`) silently becomes SLT. The experimental
formant voice cannot be selected, and the recorded voice cannot be auditioned as such.

---

## B. P1 — measured defects inside the recorded-unit path (surfaces once A1 is fixed)

**B1. Every word is wrapped in recorded silence.** `renderCmuDiphones` builds
`['pau', ...phones, 'pau']` *per word*. Measured on a 54-word paragraph against the BDL
manifest: total unit audio **34.19 s**, of which **12.90 s (38%)** is `pau`-bounded; effective
rate **94.8 words/min** (normal read English is ~150). On the 8-word preset phrase
"Author of the danger trail, Philip Steels, etc." the figures are 5.40 s total, 1.65 s (30%)
pause. `pau` units run up to 0.28 s each. `synthesizeText` then *adds* `getPauseAfter()`
silence between words (0.012 s for a plain space, 0.22 s after `.!?`) on top of the recorded
pauses. The phone stream must be built once per utterance, with `pau` inserted only at real
prosodic boundaries.

**B2. 20.5% of diphone pairs do not exist, and the miss is silent.** The BDL pack holds
**1,337** of the **1,681** possible pairs from its own 41-phone inventory (**79.5%**;
344 missing); SLT holds 1,324. On the 54-word paragraph, **4.0%** of lookups missed — and
`ah|pau` is absent from BDL entirely (9 occurrences in that paragraph alone), which B1
guarantees at every word ending in a schwa. On a miss, `renderCmuDiphones` calls the
*formant synthesizer* for one phone and splices it between recorded audio: a synthetic blip
inside a human voice, with no counter surfaced to the user. `usedDiphones` /
`fallbackDiphones` are returned but discarded by the only caller. This also breaches contract
rule 6 (fallbacks must not masquerade).

**B3. Lexical stress is thrown away on the default path.** `synthesizeText` does
`phones.map((phone) => splitPhoneStress(phone).phone)` before the diphone lookup, so `AH0`
and `AH1` request the same units and no duration/F0/energy emphasis is applied. The
stress-aware machinery (`phonemeDuration`, `stressPitch`, `stressGain`, phrase declination,
phrase-final lengthening, question rise) all lives in `buildPhoneSamples`, i.e. only in the
formant path. `README.md` §2 claims Vocalis "preserves vowel stress" — untrue for the default
voice. Flat stress is the single most cited cause of robotic concatenative output.

**B4. Pitch and duration modification is not pitch-synchronous.**
`processCmuVoice` = global `resample()` (linear interpolation, factor clamped to 0.5–2) then
one whole-utterance `wsolaStretch()`. Consequences: (a) resampling shifts formants with F0, so
pitching down also darkens and lengthens the vocal tract — a 0.72× "deep" preset becomes a
larger-speaker impersonation rather than a lower-pitched same speaker; (b) the clamp is
silent — `pitch 0.5 × stylePitch 0.92 = 0.46` is rounded up to 0.5 with no warning;
(c) one WSOLA pass over 30 s of audio has a fixed 640-sample window and a 96-sample search
radius with a step of 8, so joins are matched coarsely; (d) timing is corrected only on
average, which feeds B9.

**B5. Joins are unaligned 6 ms linear crossfades.** `crossfadeJoin` uses
`overlap = 0.006 × 16000 = 96` samples with a linear ramp, applied at every boundary
regardless of whether the signal there is voiced, silent, a stop burst or a fricative. There
is no zero-crossing or minimum-energy alignment, no per-unit energy equalisation, no F0 or
spectral continuity check, and no phase handling. The manifest stores only `{offset, length}`
per unit — **not** the internal phone boundary and **not** pitch marks — so the pack as built
cannot support half-phone duration control or pitch-synchronous modification without a
rebuild. (`scripts/build_cmu_voicepack.py` computes both phone midpoints and discards them.)

**B6. One candidate per diphone, chosen by a duration heuristic.**
`build_cmu_voicepack.py` keeps a single best-scoring unit per pair
(`unit_quality` favours ~0.16 s, rejects RMS < 80 or peak > 32700) and throws away every
other occurrence plus all context. Result: no target cost, no join cost, no Viterbi path, no
"these two units were adjacent in the original recording" bonus — the mechanisms that make
recorded-unit synthesis sound natural. Unit durations are p5 0.080 s / p50 0.130 s /
p95 0.175 s / max 0.280 s: a narrow, heuristically-selected band, and every unit is played at
its recorded length because there is no duration model.

**B7. 73 units are unreachable.** The BDL inventory contains `ax`, and 73 units (5.5%) involve
it, but `cmudict.txt` contains **0** entries with `AX` and nothing maps unstressed `AH0` to
`ax`. So schwa is rendered from stressed-`ah` units (56 of them) while the corpus's real
reduced-vowel units sit unused.

**B8. The dictionary loader does not strip annotations.** `loadDictionary` splits each line on
`|` and takes everything after it as phones. 16 lines carry trailing `#` comments, e.g.
`gdp|G IY1 D IY1 P IY1 # abbrev`, `aalto|AA1 L T OW2 # name, finnish`,
`d'artagnan|D AH0 R T AE1 NG Y AH0 N # foreign french`, `achill|AE1 K IH0 L # place, irish`.
The tokens `#`, `abbrev`, `place,`, `danish`, `dutch`, `finnish`, `foreign`, `french`,
`german`, `irish`, `name`, `name,`, `title,` therefore become "phones", guaranteeing a
diphone miss and a formant blip on exactly those words.

**B9. Word-highlight timing drifts.** `synthesizeText` records per-word `start`/`end` from the
unprocessed sample count, then rescales *all* timings by one global factor
`combined.length / raw.length` after pitch/rate processing. With per-word pauses (B1) and a
single global stretch (B4), any local non-uniformity moves the highlight away from the audio;
the longer the text, the worse the drift. Timings should be derived from the final rendered
positions.

**B10. `renderCmuDiphones` can double audio on a mid-loop failure.** Its `try` wraps both the
pack load *and* the concatenation loop. If anything throws after some chunks were pushed, the
`catch` re-renders every phone through the fallback and appends it to the chunks already
collected, producing partially duplicated speech. The load and the render need separate error
handling.

**B11. Two different "robot" and "whisper" implementations.** `cmuDiphoneSynthesizer.applyStyle`
ring-modulates at 34 Hz; `phonemeSynthesizer.buildPhoneSamples` modulates at 32 Hz;
`audioDspEngine.buildDspGraph` uses a 60 Hz oscillator. "Whisper" is a high-passed, attenuated
speaking voice in all three (the code comments admit this) while the UI sells it as
"Soft Whisper". Style processing is defined three times with three different results, and
which one you hear depends on which path is wired.

---

## C. P1 — server and distribution

**C1. `/api/project/files` returns 43.5 MB and corrupts the voice data.** Measured:
`HTTP 200, 43,481,742 bytes in 0.53 s`, 53 files, including
`public/voicepacks/cmu-arctic/slt/diphones.bin` (5,732,116 bytes → **2,805,148** U+FFFD
replacement characters), `bdl/diphones.bin` (2,633,160 replacement characters) and all four
reference WAVs (~48–52 k replacement characters each), plus `cmudict.txt` (3.3 MB) and
`package-lock.json`. `GitHubSyncModal` fetches this automatically in a `useEffect` the moment
the modal opens, then holds it in React state and offers per-file copy. The endpoint excludes
`node_modules`, `dist`, `.git`, `*.zip` and `scripts`, but not binary assets. Any file browser
must skip binary/large files (or serve them as base64 on demand).

**C2. `/api/project/push-github` is a command-injection sink and a force-push to `main`.**
`server.ts:103`:

```ts
exec(`git config --global --add safe.directory /app/applet; git add .; git commit -m "…" || true; git push "${remoteUrl}" main --force`, …)
```

`remoteUrl` embeds the user's GitHub personal access token, taken from the request body and
interpolated straight into a shell string. A token containing `"`, `` ` `` or `$(…)` executes
arbitrary commands as the server user. The endpoint also: force-pushes over `main` of a
hardcoded repository (`hjvhorlick/Vocalis`) with no branch protection and no dry run; commits
whatever happens to be in the working tree (including the regenerated ZIP, C3); sets
`safe.directory` to `/app/applet`, a path that does not exist in this deployment; and puts a
live credential on a child-process command line where any process listing can read it.
`GitHubSyncModal` asks the user to paste a `repo`-scoped PAT. Recommendation: remove the
endpoint and the modal's push flow. Publishing belongs to the developer's own authenticated
tooling, never to a token typed into a web page served by the app itself.

**C3. The project ZIP is both committed and regenerated into the repo.**
`vocalis-project.zip` (101,035 bytes) is tracked; `/api/project/download-zip` and
`/api/project/download-base64` shell out to `scripts/export_zip.py`, which rewrites that same
tracked path on every request. Result: a dirty working tree and binary churn in history from a
read-only download. `.gitignore` does not list `*.zip`.

**C4. The committed ZIP cannot rebuild the app.** Its 32 entries are a stale snapshot of an
older tree. Contents include a **10-byte `README.md`**, a 41-byte `.gitignore`, a 329-byte
`metadata.json`, a 5,397-byte `server.ts`, a 13,057-byte `naturalVoiceEngine.ts`, and ten
files that are dead even on that tree (`Navbar`, `ScaleTrainer`, `VocalGym`,
`VocalRangeFinder`, `LivePitchMonitor`, `PitchPipeKeyboard`, `VoiceShaper`, `audioPitch`,
`scalesData`, `types/vocalis`). It is **missing** the entire current engine
(`cmuDiphoneSynthesizer.ts`, `phonemeSynthesizer.ts`, `naturalHumanAudio.ts`,
`audioDspEngine.ts`, `VoiceCredits.tsx`, `SourceVoiceAttribution.tsx`, `VoiceVisualizer.tsx`,
`types/voice.ts` is present but `docs/` and `scripts/` are absent) and **all** voice data
(`public/` is absent: no `cmudict.txt`, no samples, no diphone packs, no licences).
Meanwhile `export_zip.py` does *not* exclude `public/`, so a freshly generated ZIP would
contain ~15 MB of voice data — directly contradicting the UI copy in `GitHubSyncModal`:
"All 32 application files … are plain text code totalling ~350 KB, which compresses to 99 KB"
and "Downloaded vocalis-project.zip (… KB) with all 32 application files!". Both the count and
the size claim are wrong in both directions.

**C5. ZIP generation hard-depends on `python3` at runtime.** If it is absent, both download
endpoints return `500 {error: 'Failed to generate project zip'}`. A Node-only archiver removes
the dependency (and would be original code, per contract §3).

**C6. `npm start` cannot work, and `server.ts` is never type-checked.**
`tsconfig.json` has `"include": ["src"]`, so `npm run lint` and `npm run build`'s `tsc` pass
skip `server.ts` and `scripts/`. `"start": "node server.ts"` runs a TypeScript file through
plain Node — it fails on Node 22 without a loader (`dev` correctly uses `tsx`). Fix: include
`server.ts` in a type-check project and make `start` use `tsx` or the built output.

**C7. Two package managers, no committed npm lock.** The repo pins `bun.lock` (63 KB), the
README says `npm install`. npm ignores `bun.lock` and writes an untracked
`package-lock.json`, which `export_zip.py` then packs into the ZIP the app serves. Installed
versions therefore differ from the pinned set (this environment resolved react 19.3.1,
react-dom 19.3.1, vite 6.4.5, tailwindcss 4.3.5, lucide-react 1.70.0, express 5.3.0,
typescript 5.9.3). Pick one manager and commit its lockfile.

---

## D. P2 — client correctness, leaks, honesty of labels

**D1. Saved takes are dead after a reload.** `App` persists `GeneratedTake[]` to
`localStorage` including `audioUrl`, which is a `blob:` URL. Blob URLs are per-document; after
any refresh `VoiceLibrary` renders `<audio src={take.audioUrl}>` and a download link pointing
at nothing. The Takes Vault cannot work as designed. Needs IndexedDB (or a base64 payload with
a size cap) plus a real revoke policy.

**D2. Blob URLs are never revoked.** `audioDspEngine.renderTransformedWav` (`:236`) and
`phonemeSynthesizer.synthesizeText` (`:579`) create object URLs; nothing revokes them
(`GitHubSyncModal`/`VoiceNavbar` do revoke theirs). Each render/export leaks a full WAV.

**D3. The robot style leaks an oscillator per playback.** `buildDspGraph` creates
`ringOsc`, calls `ringOsc.start()` and never `stop()`s it; `stopTransformedVoice` stops the
buffer source only and never disconnects the filter chain. Ring modulation is also biased:
`ringGain.gain.value = 0.5` with a ±1 oscillator gives a gain range of −0.5…1.5, so the
carrier is passed with DC offset and clicks at style boundaries.

**D4. Export is not what you hear.** The robot ring modulator and the analyser are created only
`if (ctx instanceof AudioContext)`. `renderTransformedWav` uses an `OfflineAudioContext`, so
exported WAVs silently omit the robot effect and any analyser-dependent behaviour. Preview and
download must share one graph builder with an explicit capability flag.

**D5. Storage failures are invisible.** Every `localStorage.setItem` is wrapped in a bare
`catch {}` (App ×4, phonemeSynthesizer ×1). Quota is ~5 MB; a handful of saved takes with
base64 audio would exceed it and the user would see nothing but lost data.

**D6. Three contradictory control ranges.** `VoiceDspConfig` comments say pitch 0.5–1.8,
rate 0.6–1.6, formants ±12 dB. `VoiceManipulator` sliders: pitch 0.5–1.75, rate 0.6–1.5,
volume 0.2–1.0, formants ±10. `SpeechStudio` sliders: pitch 0.5–1.7, rate 0.6–1.5. The DSP
then clamps the *product* to 0.4–2.5, silently overriding extremes. One shared, published
range per control.

**D7. AudioContext may start suspended.** `App` calls `initializeLocalSpeechEngine` on mount,
which calls `getSharedAudioContext()` before any user gesture. Chrome/Safari create it
suspended; `resume()` is attempted only inside `getSharedAudioContext`, so the first click can
produce silence with no error surfaced.

**D8. Nothing preloads the data the voice actually needs.** The on-mount preload fetches a
~105 KB reference sentence WAV. The diphone packs (5.58 MB + 5.73 MB) and `cmudict.txt`
(3.27 MB) are fetched lazily on first synthesis, with no progress indicator, so the first
render stalls for seconds on a cold cache. Preload strategy, caching (`Cache-Control` on
`public/`) and a visible loading state are all missing.

**D9. Mic/upload handling mislabels the audio and overwrites the base sample.**
`SpeechStudio.startMicRecording` wraps MediaRecorder output in
`new Blob(chunks, { type: 'audio/wav' })`; MediaRecorder produces `audio/webm;codecs=opus` in
Chromium and `audio/mp4` in Safari, so the declared type is wrong and `decodeAudioData` fails
in some browsers. It then sets `baseSampleId: 'custom-user'` and rewrites `samplePhrase`, so a
user recording replaces the licensed corpus reference as the voice's base with no distinct
label, no attribution and no persistence policy. `metadata.json` declares the `microphone`
permission for this path. Per contract §2.2 this must never be presented as, or silently
become, a new base voice.

**D10. "Formant" controls are three static EQ bands.** `throatWarmth`/`oralClarity`/
`airPresence` are peaking biquads fixed at 450 Hz (Q 1.2), 1800 Hz (Q 1.4) and 4200 Hz
(Q 1.0), ±10 dB, described in code comments as "Formant F1/F2/F3". They do not track vowel
formants, cannot change vocal-tract length, and at +10 dB on three bands will clip material
that is already peak-normalised. The labels promise articulatory modelling that is not there.

---

## E. P2 — dead code and product identity

**E1. 52.7% of the source tree is unreachable.** Import-graph walk from `src/main.tsx`:
16 reachable files, **12 dead files, 3,962 of 7,520 lines**.

| Dead file | Lines |
| --- | --- |
| `utils/phonemeSynthesizer.ts` | 581 |
| `components/LivePitchMonitor.tsx` | 536 |
| `components/VocalRangeFinder.tsx` | 491 |
| `components/VocalGym.tsx` | 453 |
| `components/ScaleTrainer.tsx` | 390 |
| `components/VoiceShaper.tsx` | 360 |
| `utils/audioPitch.ts` | 300 |
| `components/PitchPipeKeyboard.tsx` | 246 |
| `utils/cmuDiphoneSynthesizer.ts` | 237 |
| `components/Navbar.tsx` | 179 |
| `utils/scalesData.ts` | 133 |
| `types/vocalis.ts` | 56 |

818 of those lines are the base voice engine (must be re-wired, A1). The other 3,144 are a
complete pitch-trainer/vocal-gym product that `VoiceNavbar` does not expose — it offers only
`studio | dialogue | library`.

**E2. Metadata advertises the dead half.** `index.html` title: "Vocalis - Vocal Studio & Pitch
Trainer"; description mentions designing voice characters and shaping pitch and cadence.
`metadata.json` declares capability `MICROPHONE_PITCH_ANALYSIS` and permission `microphone`,
but pitch analysis lives only in the unreachable `audioPitch.ts` / `LivePitchMonitor` /
`VocalRangeFinder` / `ScaleTrainer` / `VocalGym`. Either re-expose the trainer or correct the
metadata.

**E3. Unused dependencies.** `clsx` and `tailwind-merge` are referenced by zero source files;
`canvas-confetti` is referenced only by dead `VocalRangeFinder.tsx`. (`npm run verify:base-voice`
now reports these as warnings.)

**E4. A data model nothing implements.** `src/types/voice.ts` defines `AcousticVoicePersona`
(basePitchHz, glottalOpenQuotient, vocalFryJitter, vibratoRateHz, vibratoDepthCents,
tractLengthScale, nasalResonance, breathinessNoise, intonationStyle, fxMode, reverbDecay),
`PhonemeDef` and `DialogueBeat`. Only `GeneratedTake` is used. The live model is the much
thinner `VoiceModelConfig`. Those unused fields are a good specification for the improvement
plan — but two competing models invite drift.

**E5. Stale prop plumbing.** `VoiceLibrary` takes `onSelectModelForShaper` and
`onSelectModelForStudio`; `App` passes the same handler to both, and `VoiceShaper` no longer
exists in the reachable tree.

**E6. Self-contradictory credits copy.** `VoiceCredits.tsx`: "The **optional experimental**
unit-synthesis method uses labeled recordings from speaker BDL … and speaker SLT …" followed
two sentences later by "The **default** speech method uses these recordings." Pick one; per
contract §2.2 the recorded method is the default and the formant method is the labelled
experimental alternative.

**E7. The corpus licence is misnamed in the UI.** `naturalHumanAudio.ATTRIBUTION_DETAILS`
says "Free Open Data / BSD Permissive License (Attribution Only)"; each
`NATURAL_HUMAN_SAMPLES` entry says "Free Open License (BSD-style attribution)";
`SourceVoiceAttribution` copies "Publicly available under BSD permissive license" to the
clipboard. The notice actually retained in
`public/voicepacks/cmu-arctic/{bdl,slt}/LICENSE.txt` is Carnegie Mellon University's own
permissive licence, Copyright (c) 2003, with three conditions: retain the notice, mark
modifications clearly, do not delete the original authors' names. It is not the BSD licence.
Attribution text must match the notice shipped — condition 1 and 2 make this a licence
obligation, not a style preference.

---

## F. P1 — third-party data and provenance (contract §3)

**F1 / A12. `public/cmudict.txt` is third-party data with the wrong licence file.**
124,076 entries in a non-standard `word|PHONEMES` layout. The notice shipped beside it,
`public/CMUDICT-LICENSE.txt`, is the **ISC licence of an npm packaging** — "Copyright (c) 2015
Zeke Sikelianos <zeke@sikelianos.com>" — not the CMU Pronouncing Dictionary notice from
Carnegie Mellon University. So the file is neither base-voice data nor correctly attributed,
and contract §3 does not allow third-party data beyond the licensed voices. Two acceptable
resolutions, in preference order:

1. **Replace it (recommended).** Build a Vocalis-owned lexicon by mining the licensed
   ARCTIC transcripts and phone labels (the corpus we already licence, ~1,150 utterances per
   speaker, giving word→phone evidence in the base voice's own pronunciation), then cover the
   rest with our own grapheme-to-phoneme rules — an upgraded version of the existing
   `fallbackGraphemeToPhones`, written by us. Result: no third-party data at all, and
   pronunciation that matches the base voice.
2. **Keep it, attribute it correctly.** Ship the real CMU Pronouncing Dictionary notice beside
   the data, cite CMU in **Credits & licenses**, and record the file in the contract's data
   inventory as an explicitly permitted exception.

Whichever is chosen, fix B8 (annotation stripping) at the same time.

**F2. Unsourced speaker provenance claims.** `naturalHumanAudio.NATURAL_HUMAN_SAMPLES` states
"Real Human Female (US California, Studio Clean)" and "Real Human Male (US Boston, Studio
Clean)". CMU ARCTIC documents BDL and SLT as US-English speakers recorded at the Language
Technologies Institute, CMU; no city-level provenance is published for them. Remove the city
claims or cite them — inaccurate attribution is a licence-condition risk.

**F3. No notice beside the reference WAVs.** `public/samples/*.wav` are verbatim corpus
utterances (a0001, a0003, 16 kHz mono 16-bit, 3.21–3.24 s). The CMU notice is retained under
`public/voicepacks/*/LICENSE.txt` only. Add `public/samples/LICENSE.txt` (or a NOTICE) so the
notice travels with the files actually being played.

**F5. Foreign code is present in the tree today: the waveshaper curve.**
`src/utils/audioDspEngine.ts:142-150`:

```ts
function makeVintageSaturationCurve(samples: number): Float32Array {
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  const k = 45;
  for (let i = 0; i < samples; ++i) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}
```

This is the well-known waveshaper distortion curve published in the MDN Web Audio API
tutorial, reproduced essentially verbatim — same magic constant `k = 45`, same
`deg = Math.PI / 180` term, same `(3 + k) * x * 20 * deg / (Math.PI + k * |x|)` expression and
the same off-by-one sample mapping (`x` never reaches exactly +1). Under contract §3 this is
somebody else's code and must be replaced with a Vocalis-original soft-clip characteristic
designed for the effect we actually want (a 1930s broadcast band, not a guitar pedal). It is
also the only place in `src/` that carries a recognisably borrowed fragment, so it is the
concrete test case for the rule.

Note the enforcement gap this exposes: `scripts/check_base_voice.mjs` detects third-party
*markers* (licence headers, "copied from" comments, vendored directories), not borrowed
*mathematics*. Formula-level review has to be done by a reader, and §4 of the contract should be
read with that limitation in mind.

Also worth a look while rewriting: `audioBufferToWavBlob` and `writeWav` are conventional RIFF
writers that closely follow widely published patterns. They are functionally trivial and almost
certainly independently written, but since both will be replaced by the Phase 2/5 render path
anyway, write the successor from the RIFF specification rather than from any existing example.

**F4. A pointer to another repository's data.** `docs/VOICE_LIBRARY_ROADMAP.md:11`: "The role
ideas below are inspired by the persona descriptions in Scenering's voice preset catalogue",
linking `github.com/hjvhorlick/Scenering/blob/main/src/data/voice-presets.ts`. The active
presets in `PRESET_VOICE_MODELS` are original prose, but under contract §3 that pointer should
be removed and the backlog re-described in our own words, so no future contributor treats that
file as a source to copy from.

---

## G. P3 — smaller items

- `server.ts` sets `app.get('*', …)` for the production SPA fallback; with Express 5 the
  wildcard route syntax changed (`'*splat'` / RegExp), so the production path is likely broken
  while dev (Vite middleware) works. Untested here because `NODE_ENV` is not `production`.
- `applyStyle`'s `whisper` branch computes `highPassed` from `previous` but adds it to the
  un-filtered `sample` (`sample * 0.42 + highPassed * 0.42`), so the "softened" timbre keeps
  full low-frequency energy.
- `writeWav` peak-normalises to 0.78 then multiplies by `volume`, so the volume slider is
  applied after normalisation and quiet settings are not compensated — fine, but it means the
  exported level depends on the peakiest sample in the utterance, not on perceived loudness.
- `getWordMatches` regex accepts `\d+` but `numberWords` rejects anything over 9 digits and
  returns `null`, so long digit strings are passed to the dictionary as "words" and end up in
  the grapheme fallback.
- `index.html` loads Google Fonts from `fonts.googleapis.com`; there is no local fallback
  beyond `system-ui`, and no `font-display` control on our side.
- `metadata.json` is not referenced by any code — confirm which platform consumes it before
  editing.
- `bun.lock` is committed but `package-lock.json` is not gitignored; pick one (C7).

---

## H. Process note (transparency)

At 20:35 SAST on 2026-11-06 an over-broad `rm -rf` run from this workspace deleted the working
tree, including `.git` and `node_modules`. Recovery: re-cloned `hjvhorlick/Vocalis` from
GitHub, confirmed HEAD was the session base commit `596f360`, moved the tree back into
`/home/user/Vocalis`, recreated branch `arena/21e3d174-vocalis`, ran `git fsck` (clean) and
`git status` (clean — no work was lost, the tree had no uncommitted changes), reinstalled
dependencies and restarted the preview. Two safeguards came out of it: the base-voice
fingerprint in `config/base-voice.lock.json` now makes accidental loss of voice data
detectable in one command, and destructive shell commands against the workspace root are
prohibited for the rest of this work.

---

## Summary table

| ID | Severity | Finding | Measured evidence |
| --- | --- | --- | --- |
| A1 | P0 | Recorded-unit TTS engine orphaned; no text input; `speakRealWords` ignores its `text` argument | 818 dead lines; 0 importers; 0 `<textarea>` in `src` |
| A2 | P0 | "Pitch" is `playbackRate = pitch × rate` | `audioDspEngine.ts:38`, clamp 0.4–2.5 |
| A3 | P1 | Accent has zero acoustic effect in the wired path | `model.accent` referenced only in dead code |
| A4 | P1 | `synthesisMethod` / `baseVoiceId` have no UI | 8 presets omit `synthesisMethod` |
| B1 | P1 | Per-word `pau` wrapping | 38% of audio pause-bounded; 94.8 wpm |
| B2 | P1 | 20.5% of diphone pairs missing → silent formant blips | 1,337/1,681 pairs; 4.0% fallback on test paragraph; `ah|pau` absent |
| B3 | P1 | Stress discarded on the default path | stress stripped before lookup |
| B4 | P1 | Non-pitch-synchronous global resample + WSOLA | formants shift with pitch; silent 0.5–2 clamp |
| B5 | P1 | 6 ms linear crossfade joins; no pitch marks or phone boundary in the pack | manifest stores `{offset,length}` only |
| B6 | P1 | One candidate per diphone; no target/join cost | `build_cmu_voicepack.py` keeps best score only |
| B7 | P2 | 73 `ax` units unreachable | 0 `AX` entries in `cmudict.txt` |
| B8 | P1 | Dictionary annotations parsed as phones | 16 affected entries |
| B9 | P2 | Word-highlight timings globally rescaled | drift grows with text length |
| B10 | P2 | Catch-all can duplicate audio | `renderCmuDiphones` try scope |
| B11 | P2 | Three inconsistent style implementations | 34 Hz vs 32 Hz vs 60 Hz robot |
| C1 | P1 | `/api/project/files` = 43.5 MB, mangles binary voice data | 5,438,308 replacement characters |
| C2 | P1 | Token interpolated into `exec`; `--force` push to `main` | `server.ts:103` |
| C3 | P2 | Tracked ZIP rewritten by a GET endpoint | `vocalis-project.zip` tracked |
| C4 | P1 | ZIP is a stale snapshot missing the engine and all voice data | 32 entries; 10-byte README; no `public/` |
| C5 | P2 | ZIP export requires `python3` at runtime | `exec('python3 …')` |
| C6 | P2 | `npm start` broken; `server.ts` never type-checked | `include: ["src"]`; `node server.ts` |
| C7 | P2 | Two package managers, no committed npm lock | `bun.lock` + untracked `package-lock.json` |
| D1 | P2 | Saved takes store dead `blob:` URLs | `localStorage` + `<audio src>` |
| D2 | P2 | Blob URLs never revoked | 2 create sites, 0 revoke sites |
| D3 | P2 | Robot style leaks an oscillator per play | `ringOsc.start()`, no `stop()` |
| D4 | P2 | Export omits the robot effect | `ctx instanceof AudioContext` guard |
| D5 | P3 | Storage errors swallowed | 5 bare `catch {}` |
| D6 | P2 | Three contradictory control ranges | ±10 vs ±12; 1.7 vs 1.75 vs 1.8 |
| D7 | P3 | AudioContext created before user gesture | mount-time preload |
| D8 | P1 | 14.6 MB of voice data never preloaded, no progress UI | lazy fetch on first render |
| D9 | P2 | Mic blob mistyped; user audio silently becomes the base sample | `type: 'audio/wav'` on webm/opus |
| D10 | P2 | "Formant" sliders are fixed EQ bands | 450/1800/4200 Hz peaking |
| E1 | P2 | 3,962 of 7,520 lines unreachable (52.7%) | import-graph walk |
| E2 | P3 | Metadata advertises the dead pitch trainer | title + `MICROPHONE_PITCH_ANALYSIS` |
| E3 | P3 | `clsx`, `tailwind-merge` unused; confetti dead-only | 0 references |
| E4 | P3 | `AcousticVoicePersona` model unimplemented | 40+ unused fields |
| E5 | P3 | `onSelectModelForShaper` points at a removed view | `App.tsx` |
| E6 | P3 | Credits call the default method "optional experimental" | `VoiceCredits.tsx` |
| E7 | P1 | Corpus licence mislabelled as BSD in UI + clipboard | actual notice is CMU's own |
| F1 | P1 | `cmudict.txt` attributed to an npm packager, not CMU | `CMUDICT-LICENSE.txt` = ISC 2015 |
| F2 | P2 | Unsourced "US California"/"US Boston" speaker claims | not published by CMU ARCTIC |
| F3 | P3 | No licence notice beside `public/samples/` | notice only under `voicepacks/` |
| F4 | P3 | Roadmap pointed at another repo's preset data (now corrected) | `VOICE_LIBRARY_ROADMAP.md:11` |
| F5 | P1 | Borrowed waveshaper curve from a published tutorial | `audioDspEngine.ts:142-150`, `k = 45` |
| G | P3 | Express 5 wildcard route, whisper HPF misuse, number handling, fonts | see §G |
