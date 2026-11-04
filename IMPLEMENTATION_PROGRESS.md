# Implementation progress

Updated 2026-11-04. Earlier claims in this report that stages 2–10 were implemented were inaccurate; inspection found engine module shells rather than a synthesiser. This file records the verified state instead.

The interface now supports creating, editing, duplicating, deleting, importing and exporting SQLite-backed profiles. The selected personality and simple low/medium/high characteristics are stored as data only. Speech generation, audio preview and trained voices are not implemented. Stage 2 is substantially improved but still incomplete against the roadmap; Stage 3 is partial and Stages 4–10 remain future work. See PROJECT_STATUS.md.

### Voice DNA work, 2026-11-04
Implemented validated ranges and defaults for a subset of identity and performance parameters, six editable parameter presets, an API endpoint for the presets, and numeric studio controls. Existing legacy level fields are retained but not converted. The stage remains partial; no audio is produced.

### First experimental speech engine, 2026-11-04
Added an independent hand-authored limited vocabulary, phoneme planning, voiced pulse source, formant resonators, noise/fricative and stop approximations, WAV encoding, synthesis API and browser playback/download. No external engine, model or recordings are used. Output is an early experiment with unverified intelligibility, not a finished speech engine. It rejects unknown words. Many roadmap components remain shells.

### Sentence and listening workflow
A small hand-authored lexicon and simple English spelling-to-phoneme rules now let the experiment attempt short sentences instead of rejecting all unknown words. Numbers 0–9999 and basic punctuation are supported. Pronunciation, naturalness and intelligibility are not established. The studio also offers an optional audio-output chooser where the browser supports it; otherwise the operating-system default is used. No audio output device identifiers are stored in profiles.

### H sound experiment
Following user feedback, the experimental engine now shapes H aspiration using the following vowel's resonances and reduces its level. This is a targeted synthesis change; a listening assessment is needed to tell whether it helps.
