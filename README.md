# VOCALIS
## Independent Speech-Generation Platform
**Version 2.0 — Complete Project Vision and Instructions to Begin Implementation**

### Project Foundation (Stage 1)
- **Branch:** `arena/5f698619-vocalis`
- **Status:** Active (Foundation established)
- **Date:** 2026-11-04

### Structure
```
vocalis/
|-- apps/
|   |-- web/       (React/TypeScript/Vite - Frontend)
|   |-- api/       (Python/FastAPI/SQLite - Backend)
|-- engine/
|   |-- vocalis_engine/
|       |-- text/
|       |-- phonetics/
|       |-- prosody/
|       |-- identity/
|       |-- articulation/
|       |-- acoustics/
|       |-- synthesis/
|       |-- refinement/
|       |-- audio/
|-- research/
|   |-- literature/
|   |-- experiments/
|   |-- acoustic_notes/
|   |-- datasets/
|-- models/
|   |-- configs/
|   |-- training/
|   |-- evaluation/
|-- tests/
|   |-- unit/
|   |-- integration/
|   |-- acoustic/
|   |-- profile/
|-- docs/
|-- scripts/
```

### Documentation (Stage 1 Completed)
- PROJECT_MASTER.md (Full directive)
- PROJECT_STATUS.md (Implementation status)
- ARCHITECTURE.md (System architecture)
- ENGINE_SPECIFICATION.md (Module specifications)
- VOICE_DNA_SPECIFICATION.md (Profile schema)
- DEVELOPMENT_ROADMAP.md (Stages and milestones)
- TECHNICAL_DECISIONS.md (Engineering decisions)
- RESEARCH_REGISTER.md (Research findings)
- ACOUSTIC_EXPERIMENTS.md (Experiment framework)
- DATASETS_AND_RIGHTS.md (Training data requirements)
- MODEL_REGISTER.md (Learning system)
- DEPENDENCIES_AND_LICENCES.md (Third-party software)
- TEST_RESULTS.md (Automated tests)
- NEXT_STEPS.md (Immediate actions)

### Environment
- Python: 3.11.2
- Node.js: 22.22.3
- npm: 10.9.8
- FFmpeg: Not found (warning: install for Stage 4)

### Next Actions (Stage 1)
1. Initialize frontend foundation (apps/web/)
2. Initialize backend foundation (apps/api/)
3. Initialize engine package (engine/vocalis_engine/)
4. Run initialization tests
5. Report results in PROJECT_STATUS.md and NEXT_STEPS.md

### Directive Compliance
- Independent technology (No Piper, No external APIs, No external AI tokens)
- Hybrid architecture (Mathematical simulation, Acoustic engineering, Independent learning)
- Voice DNA representation (Identity Profile, Performance Direction)
- Six personality starting points (Documentary, Storyteller, Conversational, News, Educational, Audiobook)
- Ten development stages (Foundation -> Quality/Production)

**Start inspecting the project and implementing Stage 1 now. Do not stop at planning.**

### Current verified functionality
The application can create, edit, duplicate, delete, export and import voice profiles in SQLite. A experimental formant synthesizer with short-sentence support and audio preview are now available; speech quality and intelligibility are not established. Earlier claims of completion of later stages were incorrect; see PROJECT_STATUS.md.

To run locally, create a Python virtual environment and install `fastapi`, `uvicorn`, and `pydantic` (version 2), then run `uvicorn main:app --host 0.0.0.0 --port 8000` from `apps/api`. Run `npm install` and `npm run dev -- --host 0.0.0.0` from `apps/web`. The web development server proxies `/api` to the backend. Run tests from the repository root with `PYTHONPATH=engine python -m unittest discover -s tests/unit -v` using the backend environment.

### Experimental speech synthesis
The Text to speech screen now generates and plays a mono WAV using the independent, hand-built formant prototype. Save a profile first, then try `Hello world.` The studio lists its small hand-authored lexicon; other English words use approximate spelling rules and may be mispronounced. Basic punctuation and whole numbers up to 9999 are supported. This is a limited experiment, not general text-to-speech; output is expected to sound robotic and intelligibility has not yet been established. Pitch, depth, resonance brightness, breathiness, pace, energy and loudness affect generation; other profile controls are not yet connected.
