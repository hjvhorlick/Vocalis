# NEXT STEPS — VOCALIS
## Version 2.0
**Last Updated:** 2026-11-04

### Current Stage
**Stage 1: Build the real project foundation** (In Progress)

### Completed in This Session (2026-11-04)
1. **TASK 1 — Inspect** (Completed)
   - Repository inspected: /home/user/Vocalis (branch arena/5f698619-vocalis)
   - Environment checked: Python 3.11.2, Node 22.22.3, npm 10.9.8
   - FFmpeg not found (warning noted)
   - Existing work: Empty repository (README.md only)

2. **TASK 2 — Establish the foundation** (In Progress)
   - Project structure created: apps/web, apps/api, engine/vocalis_engine/{text,phonetics,prosody,identity,articulation,acoustics,synthesis,refinement,audio}, research/{literature,experiments,acoustic_notes,datasets}, models/{configs,training,evaluation}, tests/{unit,integration,acoustic,profile}, docs, scripts
   - Technology stack documented: React/TypeScript/Vite (Frontend), Python/FastAPI/SQLite (Backend), Independent Python package (Engine)

3. **TASK 3 — Create the project documentation** (Completed)
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
   - NEXT_STEPS.md (This file)

### Immediate Next Actions (Remaining Stage 1)
**TASK 4 — Build the first web application** (Next)
1. Initialize React/TypeScript/Vite frontend in `apps/web/`
2. Create Dashboard, Voice Creation Studio, Personality Presets, Advanced Controls, Voice Library, Text-to-Speech Studio shells
3. Implement functional navigation and profile-management features (mock data initially)

**TASK 5 — Implement Voice DNA** (Following)
1. Create profile schema in `engine/vocalis_engine/identity/`
2. Implement validation, defaults, presets loading
3. Implement saving/loading/renaming/duplicating/exporting/importing (SQLite)

**TASK 6 — Establish the speech-engine interface** (Following)
1. Create interface contracts in `engine/vocalis_engine/`
2. Document input (Text, Voice DNA, Performance, Pronunciation)
3. Document output (Audio, Duration, Sample rate, Metadata, Errors)
4. Report full speech generation as not yet implemented

**TASK 7 — Begin the first acoustic experiment** (Following)
1. Create Experiment 1 (Basic excitation) in `research/experiments/`
2. Implement mathematically generated excitation signal
3. Implement adjustable fundamental frequency
4. Implement simple configurable resonant filter
5. Implement audio output (WAV export) and parameter logging

**TASK 8 — Test** (Following)
1. Run frontend checks
2. Run backend checks
3. Run unit tests
4. Run profile tests
5. Run acoustic prototype tests
6. Fix errors

**TASK 9 — Report** (Final for Stage 1)
1. Update PROJECT_STATUS.md and NEXT_STEPS.md
2. Tell owner: what created, where files are, how to run, what works/doesn't, tests performed, next task

### Exact Next Task
**Initialize the frontend foundation in `apps/web/` using React, TypeScript, and Vite, and create the backend foundation in `apps/api/` using Python and FastAPI. Then create the engine package initialization in `engine/vocalis_engine/`. Run initial initialization tests.**

### Dependencies to Install (Stage 1)
- Frontend: react, typescript, vite, responsive CSS components
- Backend: fastapi, uvicorn, sqlite3, pydantic
- Engine: numpy, scipy (for acoustics), independent package structure
- Tests: pytest, vitest

### Warning
- FFmpeg not found in PATH. Will need installation or alternative for audio processing in Stage 4 (Acoustic Laboratory).

### Handover Information
- **Current Development Stage:** Stage 1 (Foundation)
- **Files Created:** 12 documentation files + directory structure
- **Files Changed:** README.md (existing, will update)
- **Features Completed:** Project foundation structure, documentation framework
- **Tests Run:** Environment verification (passed)
- **Results:** Foundation established, documentation created
- **Known Problems:** FFmpeg missing, no existing code to build upon
- **Remaining Tasks:** Frontend/backend/engine initialization, tests, Stage 2 interface
- **Exact Next Task:** Initialize frontend/backend/engine foundation and run tests
