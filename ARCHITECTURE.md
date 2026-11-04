# ARCHITECTURE — VOCALIS
## Version 2.0
**Last Updated:** 2026-11-04

### 26. Application Architecture (Directive Part K)

#### FRONTEND
- **Technology:** React, TypeScript, Vite, Responsive CSS
- **Location:** `apps/web/`
- **Components:** Dashboard, Voice Creation Studio, Personality Presets, Advanced Controls, Voice Library, Text-to-Speech Studio, Settings

#### BACKEND
- **Technology:** Python, FastAPI, SQLite (initial)
- **Location:** `apps/api/`
- **Responsibilities:** API contracts, background generation jobs, database abstraction, profile management

#### ENGINE
- **Technology:** Independent Python package
- **Location:** `engine/vocalis_engine/`
- **Modules:**
  - `text/`: Text normalisation, linguistic analysis
  - `phonetics/`: Phoneme conversion, pronunciation dictionary
  - `prosody/`: Prosody planning, speech planning
  - `identity/`: Voice DNA (Identity Profile, Performance Direction)
  - `articulation/`: Phoneme-level articulation planning
  - `acoustics/`: Source-filter model, time-varying vocal tract
  - `synthesis/`: Acoustic sound generation, naturalness refinement
  - `refinement/`: Learning system (Duration, Prosody, Articulation, Acoustic, Variation)
  - `audio/`: Audio verification, output (WAV)

#### DATA
- **Storage:** SQLite (initial prototype)
- **Format:** Versioned JSON (Voice DNA Profile Format)
- **Export/Import:** JSON voice profile

#### RESEARCH & MODELS
- **Research:** `research/` (literature, experiments, acoustic_notes, datasets)
- **Models:** `models/` (configs, training, evaluation)

#### TESTS
- **Location:** `tests/` (unit, integration, acoustic, profile)

#### DOCUMENTATION & SCRIPTS
- **Location:** `docs/`, `scripts/`

### Hybrid Approach (Directive Part B, Section 4)
1. **Mathematical and physical vocal simulation** (Engine: acoustics, synthesis)
2. **Acoustic engineering** (Engine: acoustics, synthesis, audio)
3. **Independently developed computational learning** (Engine: refinement)

### Source-Filter Architecture (Directive Part C, Section 6)
Y(z) = G(z) × H(z) × L(z)
- G(z): Glottal sound source (Engine: acoustics/synthesis)
- H(z): Vocal-tract filter (Engine: acoustics)
- L(z): Lip radiation (Engine: acoustics)

### Voice DNA Representation (Directive Part D, Section 8)
- **Voice Identity Profile** (Stable characteristics)
- **Performance Direction** (Temporary delivery instructions)

### Development Environment (Directive Part O, Section 35)
- Target: Intel Celeron N3350, ~3.7 GB RAM, Linux
- Python 3.11.2, Node 22.22.3, npm 10.9.8
- Lightweight implementation, separate training scripts for GPU
