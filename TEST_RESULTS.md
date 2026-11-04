# TEST RESULTS — VOCALIS
## Version 2.0
**Last Updated:** 2026-11-04

### 32. Testing Framework (Directive Part N, Section 32)
**Objective:** Automated tests from beginning.
**Location:** `tests/` (unit, integration, acoustic, profile)
**Framework:** Pytest (Python), Vitest/Jest (Frontend)

### Test Categories
1. **Voice profile validation** (Stage 3)
2. **Profile save and load** (Stage 3)
3. **Profile export and import** (Stage 3)
4. **Parameter boundaries** (Stage 3)
5. **Invalid parameter combinations** (Stage 3)
6. **Phoneme conversion** (Stage 5)
7. **Text normalisation** (Stage 7)
8. **Sentence segmentation** (Stage 7)
9. **Prosody planning** (Stage 7)
10. **Acoustic filter stability** (Stage 4)
11. **Audio output integrity** (Stage 4)
12. **Audio duration** (Stage 4)
13. **Clipping** (Stage 4)
14. **Silence** (Stage 4)
15. **Discontinuities** (Stage 4)
16. **Engine failures** (Stage 6)

### Test Results Register
```json
{
  "test_run_id": "string",
  "date": "ISO8601",
  "stage": "integer (1-10)",
  "category": "string",
  "test_name": "string",
  "status": "passed|failed|skipped|error",
  "duration_ms": "integer",
  "assertions": "integer",
  "failures": "integer",
  "errors": "integer",
  "logs": "string",
  "measurements": {
    "fundamental_frequency": "object",
    "formant_distributions": "object",
    "spectral_envelope": "object",
    "harmonic_to_noise": "object",
    "timing_patterns": "object",
    "articulation_behaviour": "object",
    "energy": "object",
    "speech_rate": "object",
    "signal_to_noise": "object"
  },
  "listening_evaluation": {
    "intelligibility": "float (0.0-1.0)",
    "naturalness": "float (0.0-1.0)",
    "identity_consistency": "float (0.0-1.0)",
    "expressiveness": "float (0.0-1.0)",
    "pronunciation": "float (0.0-1.0)",
    "listening_comfort": "float (0.0-1.0)"
  },
  "notes": "string"
}
```

### Current Test Results (Stage 1 - Initial Inspection)
**Test Run ID:** stage1-inspection-20261104-001
**Date:** 2026-11-04
**Stage:** 1
**Category:** Environment Verification
**Test Name:** Repository and Environment Inspection
**Status:** passed
**Duration ms:** 1224
**Assertions:** 4
**Failures:** 0
**Errors:** 0
**Logs:**
- Repository exists at /home/user/Vocalis
- Branch: arena/5f698619-vocalis (active)
- Python 3.11.2 detected
- Node.js 22.22.3 detected
- npm 10.9.8 detected
- FFmpeg not found in PATH (warning: will need installation for audio processing)
- Project structure created (apps, engine, research, models, tests, docs, scripts)
- Documentation files created (12 files)
**Measurements:** N/A (environment inspection)
**Listening Evaluation:** N/A (no audio generation yet)
**Notes:** Foundation established successfully. FFmpeg installation required for Stage 4 acoustic experiments.

### Upcoming Tests (Stage 1)
1. **Frontend foundation tests** (React/TypeScript/Vite initialization)
2. **Backend foundation tests** (Python/FastAPI initialization)
3. **Engine package initialization tests**
4. **Test framework initialization tests**
5. **First working application shell tests**

### Measurement Records (Directive Part N, Section 33)
- **Status:** Not yet implemented (Stage 4/10)
- **Planned:** Fundamental frequency, Formant distributions, Spectral envelope, Harmonic-to-noise, Timing patterns, Articulation behaviour, Energy, Speech rate, Signal-to-noise

### Listening Evaluation (Directive Part N, Section 34)
- **Status:** Not yet implemented (Stage 10)
- **Planned:** Vowels, Consonants, Syllables, Words, Questions, Statements, Long sentences, Emotional sentences, Difficult names, Numbers, Paragraphs
- **Method:** Blind tests (when quality sufficient), human listeners

### Next Test Tasks (Stage 1)
1. Initialize frontend/backend/engine structure
2. Run initialization tests
3. Report results in PROJECT_STATUS.md and NEXT_STEPS.md

### 2026-11-04 — interface and profile work
- `PYTHONPATH=engine apps/api/venv/bin/python -m unittest discover -s tests/unit -v`: 6 passed, including isolated SQLite create/read/update/delete, conflict and ID mismatch tests.
- `npm run build --prefix apps/web`: passed.
- `npm run lint --prefix apps/web`: passed with one React effect warning.
- HTTP smoke test via Vite proxy: create, read, update and delete passed; web returned HTTP 200.
- No audio or listening tests were run; the speech engine is not implemented.

### 2026-11-04 — Voice DNA subset
- `PYTHONPATH=engine apps/api/venv/bin/python -m unittest discover -s tests/unit -v`: 8 passed, including parameter boundaries, legacy field retention and preset checks.
- `npm run build --prefix apps/web` and `npm run lint --prefix apps/web`: passed.
- HTTP through Vite proxy: preset listing, profile creation/update/read, validation rejection (422), persistence after rejected update, and delete passed.
- No audio was generated or listening tests performed. Parameter values have not been acoustically calibrated.

### 2026-11-04 — first experimental formant synthesizer
- Unit test discovery: 12 passed, covering every supported word's WAV structure/non-silence, repeatability, pitch and pace changes, unsupported input, and the engine contract, in addition to existing tests.
- Frontend build and lint: passed.
- HTTP smoke test through the Vite proxy: generated a mono 16 kHz PCM WAV from "Hello world." and rejected an unsupported word with HTTP 422.
- Automated checks do not establish speech intelligibility or naturalness; no human listening test was performed.

### 2026-11-04 — generated audio feedback and playback
- The API log recorded successful synthesis requests during the reported test. An additional request using the saved narrator profile returned HTTP 200, a mono 16 kHz WAV of 1.46 seconds, with non-zero samples (peak 16384; RMS 3210).
- The TTS interface now shows a prominent generated-audio panel, attempts playback, and explains how to press play or download if autoplay is blocked. Frontend build and lint pass; Vite serves the updated component.
- Browser playback on the user's device and intelligibility have not been verified by these checks.

### 2026-11-04 — browser playback investigation
- Reproduced a UI issue in headless Chromium at a 900×700 viewport: after generation, the audio result began at y=687, largely below the visible viewport, with no automatic scroll.
- Added automatic scrolling to the result, a prominent Play generated audio button, and playback/error status. Re-tested with autoplay intentionally rejected: the app displayed the explanation, scrolled the play button into view, and a manual click advanced the audio playback clock with no media error. The generated WAV was 1.46 seconds and non-silent.
- This test runs headless with muted audio; it cannot verify the user's speakers, actual audible output or speech intelligibility. The preview frame's precise autoplay policy remains unverified.
- `npm run build --prefix apps/web` and `npm run lint --prefix apps/web` pass.

### 2026-11-04 — browser audio signal path
- Added `tests/integration/browser_audio.cjs` and ran it against the real UI and API using headless Chromium. The test creates/deletes its own temporary profile, generates audio, decodes the WAV with Web Audio, and checks non-zero signal from the HTML audio element's analyser. It passed: decoded RMS 0.096, analyser peak 0.50, playback clock advanced and no browser media error occurred.
- Headless Chromium was muted; this does **not** verify audio reaching the user's device, the Arena iframe's policy, or intelligibility. The reason for the user's lack of sound remains undetermined.
- To rerun: start the API and frontend, install the web dependencies, and set `BROWSER_EXECUTABLE_PATH` to a compatible Chromium executable before running `node tests/integration/browser_audio.cjs`. Chromium's operating-system libraries must also be installed.

### 2026-11-04 — playback event tracing
- Added temporary, in-memory playback diagnostics. They record only a random session ID, event type, WAV byte count/decoded RMS, playback position, media volume/mute state, readiness and error names; no profile data, text, or audio is recorded. They are discarded when the API restarts and limited to the most recent 100 events.
- Browser integration test confirmed generation, WAV decoding with nonzero RMS, `playing` and advancing playback position. An additional test deliberately rejected autoplay and confirmed `NotAllowedError` was recorded before a manual play succeeded.
- These tests do not measure the user's physical sound output. A fresh test in the user's preview is needed to capture its browser's events; the cause of the reported silence remains unconfirmed.

### 2026-11-04 — comparison with Scenering and direct Web Audio
- Inspected `hjvhorlick/Scenering` on GitHub: voice previews use an HTML audio element, optionally routed through a Web Audio gain/echo graph to `AudioContext.destination`; video preview also uses Web Audio. This is browser-managed output, not direct access to computer audio hardware. Scenering uses an external speech engine; VOCALIS did not adopt it.
- The user's previous VOCALIS trace showed an unmuted HTML audio element playing the full non-silent WAV, but this does not prove audio reached the speakers.
- VOCALIS now also tries direct `AudioBufferSourceNode → AnalyserNode → AudioContext.destination` playback, with its audio context created/resumed during the generate click. The standard audio player remains an alternative. The browser test confirmed a running context and non-zero signal in this direct path as well as in the standard player; build and lint passed. The headless browser was muted, so actual audible output is still unverified.

### 2026-11-04 — independent beep test
- Added a one-second 440 Hz test tone generated in the browser using an oscillator and gain envelope, independent of the speech engine and API-generated WAV.
- Headless browser test: the Web Audio context was running and the test tone analyser measured a peak of 0.25; the speech playback integration test, frontend build and lint also passed. The test browser is muted, so actual audibility on the user's device remains unverified.

### 2026-11-04 — synthesizer spectral correction
- User confirmed the independent 440 Hz test beep is audible but reported silence for the generated voice. Browser diagnostics for the voice showed non-zero decoded samples and a running Web Audio graph; physical audibility remained unconfirmed.
- Signal analysis of the previous saved-profile "hello world" WAV exposed a genuine defect: a 32 ms window at 0.15 seconds had virtually no measured energy above 1 kHz, with most energy below 500 Hz. This could make output difficult to hear on small speakers, but has not been proven to be the cause of the reported silence.
- Adjusted excitation, frequency-dependent resonator normalization, lip radiation and per-segment level control. The same window now has 17.3% of its measured spectral energy above 1 kHz; phrase RMS is 0.123 of full scale and peak remains below full scale. Added a frequency/level regression test; 13 unit tests passed.
- Browser integration passed for test tone, direct Web Audio and standard audio decoding. No listening test of the revised voice has yet been performed; intelligibility remains unknown.

### 2026-11-04 — short sentences and headset selection
- `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=engine apps/api/venv/bin/python -m unittest discover -s tests/unit -v`: 14 passed, including dictionary and rule fallback, numbers, sentence WAV generation, invalid inputs, spectral and profile tests.
- API through Vite returned mono WAVs for “Hello, I am learning to speak.” and “It's a beautiful day with 123 birds!” using an existing profile. This verifies generation, not intelligibility.
- Headless Chromium integration passed tone, speech signal graph, and mock headset selection/reset for both AudioContext and media element. Mock output devices are not proof of actual wired or Bluetooth hardware playback.
- `npm run build --prefix apps/web` and `npm run lint --prefix apps/web` passed. The user reported hearing the earlier voice, with “hello” unclear and “world” closer; the sentence expansion has not yet received a listening assessment.

### 2026-11-04 — H sound experiment
- Based on the user's feedback that H is problematic but the other words sounded good, changed only the prototype's `HH` rendering: noise is shaped by the immediately following vowel's formants, the harsh high-frequency frication bypass is removed for H, and its level is reduced relative to vowels. Pronunciation spelling and durations were not changed.
- Automated checks: 15 unit tests passed, including H-before-vowel non-silence/relative level tests for hello, help, he and how. Standalone `world` and `test one two` produced identical WAV hashes before and after the change under default settings. A saved-profile API generation and the muted browser audio integration tests passed.
- These measurements do not prove H is more intelligible or natural; the revised voice has not yet received a human listening assessment.
