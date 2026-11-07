# Rules for working on Vocalis

Read this before changing anything. These rules are binding for every session, human or agent.

## 1. The base voice is permanent

`docs/BASE_VOICE_CONTRACT.md` is the authority. In short:

- The recorded CMU ARCTIC base voice — `public/voicepacks/cmu-arctic/{bdl,slt}/`,
  `public/samples/`, and the recorded-unit engine in `src/utils/cmuDiphoneSynthesizer.ts` plus
  the `cmu-arctic` branch of `src/utils/phonemeSynthesizer.ts` — is **never removed, never
  replaced, never re-encoded and never edited in place**. Its SHA-256 fingerprints are pinned in
  `config/base-voice.lock.json`.
- Recorded-unit synthesis stays the **default** method (`model.synthesisMethod ?? 'cmu-arctic'`).
- No browser TTS, cloud TTS, neural TTS, statistical parametric voice, voice conversion, voice
  cloning, or downloaded prebuilt voice may be added — not as a default, not as a fallback, not
  as a hidden mode.
- All improvement happens **around** the base voice: text analysis, pronunciation, prosody,
  duration, unit selection, join smoothing, pitch/duration modification, accent modelling,
  playback, export, evaluation. New speakers arrive as **additional** frozen packs.

Verify before committing anything that touches `public/`, `src/utils/` or the voice presets:

```sh
npm run verify:base-voice
```

A failure is a blocker. Do not re-pin a fingerprint to make a failure go away; re-pinning is
only legitimate when adding a new pack or adopting a licensor's corrected release.

## 2. Nobody else's code lives here

- Only the **voices** come from outside, under their licences, with notices retained.
- Published **ideas**, algorithms, acoustic facts and research findings may be used freely.
  Ideas are not code.
- Every line of implementation is written for Vocalis, from an understanding of the idea.
  Recreate it; never transcribe it. That includes "standard" formulas, WAV writers, DSP helpers,
  window functions and curve generators — if it is recognisably somebody else's text, rewrite it
  from first principles.
- No vendored third-party directories, no committed `node_modules`, no pasted library internals,
  no generated snippets from tutorials, docs examples, papers' supplementary material or other
  repositories.
- Ordinary npm dependencies declared in `package.json` and imported by name are fine; list any
  new one in `docs/BASE_VOICE_CONTRACT.md` §3.
- Prefer data we generate ourselves (a lexicon mined from the licensed corpus, our own
  grapheme-to-phoneme rules, our own evaluation sentences) over importing somebody else's
  dataset.
- Where an idea came from, cite the concept (paper, authors, year) in `docs/` and state that the
  implementation is original.

## 3. Do not claim what the code does not do

Labels, README text, `metadata.json`, credits and preset descriptions must match the shipped
behaviour. If a control is an approximation, say so in the UI. If a unit is missing, count it and
show it. `docs/APPLICATION_AUDIT.md` lists the places where this is currently untrue; fix them
rather than repeating them.

## 4. Workspace safety

- Never run destructive shell commands (`rm -rf`, `git clean -fdx`, `git reset --hard`,
  force-push) against the workspace root or the repository root. An over-broad `rm -rf` already
  destroyed this working tree once, on 2026-11-06; it was recovered by re-cloning.
- All work happens on the session branch. `config/base-voice.lock.json`,
  `scripts/check_base_voice.mjs` and `docs/BASE_VOICE_CONTRACT.md` are part of the repository and
  are not scratch files.
- Keep generated artefacts (`vocalis-project.zip`, caches, `node_modules`, lockfiles from a
  second package manager) out of commits.

## 5. Current state

- Preview/dev: `npm install && npm run dev` → Express + Vite on `0.0.0.0:3000`.
- The recorded-unit engine **is wired in** (audit A1 closed): Speech Studio speaks the text you
  type, Dialogue Studio renders a conversation as one timeline, and export is byte-identical to
  preview. The reference-recording audition is a separate, labelled feature.
- Run the whole gate before committing:

  ```sh
  npm run lint && npm run test:engine && npm run test:render && npm run verify:base-voice
  ```

  `npm run lint` type-checks `src` only (`server.ts` is not covered — audit finding C6). Both
  suites read the real assets in `public/` from disk, so they measure the shipped dictionary and
  the shipped unit packs. A failing check is a blocker in the same sense as a failing contract
  check: fix the code or the claim, never delete the check.
- Verified call graph with line numbers: `docs/PIPELINE_MAP.md`. The transformation stage is
  `src/utils/voiceTransform.ts`, used by generated speech and by the reference-recording
  audition alike; there is no second implementation. `npm run test:render` now also measures
  that stage on known signals (aliasing, pitch accuracy, pace/pitch independence).
- What was broken, what was built and every measurement: `docs/PHASE2_PIPELINE_CORRECTION.md`,
  and for the transformation stage (pitch, pace, formants, tone, resonance)
  `docs/PHASE3_VOICE_TRANSFORM.md`.
- Known state of the product, finding by finding: `docs/APPLICATION_AUDIT.md`.
- What to build next, and how each idea will be implemented originally:
  `docs/VOICE_IMPROVEMENT_PLAN.md`.
- When you change anything that produces audio, print the numbers: duration, silence fraction,
  pace, peak, exact units, adaptations, stand-ins and coverage. Two defects in this pipeline
  (unit offsets counted in bytes instead of samples, and pitch silently changing duration) were
  invisible in the code and obvious in the measurements.
