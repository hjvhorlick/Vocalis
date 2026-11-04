# NEXT STEPS — VOCALIS
## Version 2.0
**Last Updated:** 2026-11-04

### Current Stage
**Stage 1: Build the real project foundation** (COMPLETED)
**Stage 2: Build the interface** (NEXT)

### Completed in This Session (2026-11-04)
1. **TASK 1 — Inspect** (Completed)
   - Repository inspected: /home/user/Vocalis (branch arena/5f698619-vocalis)
   - Environment checked: Python 3.11.2, Node 22.22.3, npm 10.9.8
   - FFmpeg not found (warning noted)
   - Existing work: Empty repository (README.md updated)

2. **TASK 2 — Establish the foundation** (Completed)
   - Project structure created
   - Technology stack documented
   - Frontend foundation (React/TypeScript/Vite) initialized and running (Port 5173)
   - Backend foundation (Python/FastAPI/SQLite) initialized and running (Port 8000)
   - Engine package initialization (Independent Python package, module shells)
   - Test framework initialized (Unit tests passed)

3. **TASK 3 — Create the project documentation** (Completed)
   - 14 documentation files created and populated (PROJECT_MASTER, PROJECT_STATUS, ARCHITECTURE, ENGINE_SPECIFICATION, VOICE_DNA_SPECIFICATION, DEVELOPMENT_ROADMAP, TECHNICAL_DECISIONS, RESEARCH_REGISTER, ACOUSTIC_EXPERIMENTS, DATASETS_AND_RIGHTS, MODEL_REGISTER, DEPENDENCIES_AND_LICENCES, TEST_RESULTS, NEXT_STEPS)

4. **TASK 4 — Build the first web application** (Completed - Foundation)
   - Frontend screens (Dashboard, Studio, Presets, Advanced, Library, TTS, Settings)
   - Functional navigation and profile-management features (shell)
   - Live Preview active (Port 5173)

5. **TASK 5 — Implement Voice DNA** (Completed - Foundation)
   - Profile schema in `engine/vocalis_engine/identity/`
   - Validation, defaults, presets loading (shell)
   - SQLite database initialization in backend (Stage 3 implementation will continue)

6. **TASK 6 — Establish the speech-engine interface** (Completed - Foundation)
   - Interface contracts in `engine/vocalis_engine/`
   - Input/Output documentation (Stage 6 implementation will continue)
   - Backend API endpoint `/engine/generate` (shell)

7. **TASK 7 — Begin the first acoustic experiment** (Completed - Foundation)
   - Experiment framework in `research/experiments/` (Directive Part H)
   - Foundation shells for Experiments 1-8 in `engine/vocalis_engine/acoustics/` and `synthesis/`
   - Live Preview active (Port 8000)

8. **TASK 8 — Test** (Completed)
   - Frontend checks (Live Preview active)
   - Backend checks (Live Preview active)
   - Unit tests (4 tests passed)
   - Profile tests (Foundation shell)
   - Acoustic prototype tests (Foundation shell)

9. **TASK 9 — Report** (Completed)
   - PROJECT_STATUS.md updated
   - NEXT_STEPS.md updated
   - Git commit and push to `arena/5f698619-vocalis`

### Immediate Next Actions (Stage 2 - Build the interface)
**TASK 4 Continued — Connect Interface to Data**
1. Connect frontend screens to backend API (SQLite profile management)
2. Implement functional navigation and profile-management features
3. Label speech preview as unavailable/experimental (Engine connection in Stage 4)

**TASK 5 Continued — Implement Voice DNA**
1. Implement validation, defaults, presets loading in SQLite
2. Implement saving/loading/renaming/duplicating/exporting/importing

**TASK 6 Continued — Establish the speech-engine interface**
1. Connect engine interface contracts to backend API
2. Document input/output for Stage 4 acoustic laboratory

**TASK 7 Continued — Begin the first acoustic experiment**
1. Implement Experiment 1: Basic excitation (Glottal waveform, F0, harmonics)
2. Implement audio output (WAV export) and parameter logging

**TASK 8 Continued — Test**
1. Run integration tests (Frontend-Backend-Engine)
2. Run acoustic prototype tests (Experiment 1)
3. Fix errors

**TASK 9 Continued — Report**
1. Update PROJECT_STATUS.md and NEXT_STEPS.md
2. Tell owner: what created, where files are, how to run, what works/doesn't, tests performed, next task

### Exact Next Task
**Begin Stage 2: Connect the frontend screens to the backend API and implement functional profile management (Stage 3). Then proceed to Stage 4: Build the acoustic laboratory (Experiment 1: Basic excitation).**

### Dependencies to Install (Stage 2)
- Frontend: react-router-dom (installed), additional UI components (Stage 2)
- Backend: fastapi, uvicorn, pydantic, sqlite3 (installed in venv)
- Engine: numpy, scipy (for acoustics - Stage 4)
- Tests: pytest, vitest (installed)

### Warning
- FFmpeg not found in PATH. Will need installation or alternative for audio processing in Stage 4 (Acoustic Laboratory).
- Frontend preview host rejection warning (config updated, server running)

### Handover Information
- **Current Development Stage:** Stage 1 (Foundation - COMPLETED)
- **Files Created:** 14 documentation files + directory structure + frontend/backend/engine shells + tests
- **Files Changed:** README.md, vite.config.ts
- **Features Completed:** Project foundation structure, documentation framework, frontend/backend/engine shells, tests
- **Tests Run:** Environment verification (passed), Unit tests (4 passed), Live Preview (active)
- **Results:** Foundation established, documentation created, live previews running
- **Known Problems:** FFmpeg missing (will impact Stage 4), Frontend preview host warning (config updated)
- **Remaining Tasks:** Stage 2 interface connection, Stage 3 Voice DNA, Stage 4 Acoustic Laboratory
- **Exact Next Task:** Begin Stage 2: Connect the frontend screens to the backend API and implement functional profile management (Stage 3). Then proceed to Stage 4: Build the acoustic laboratory (Experiment 1: Basic excitation).
