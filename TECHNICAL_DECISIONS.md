# TECHNICAL DECISIONS — VOCALIS
## Version 2.0
**Last Updated:** 2026-11-04

### 1. Project Structure (Directive Part K, Section 26)
- **Decision:** Modular monorepo structure with separation between apps, engine, research, models, tests, docs, scripts.
- **Reason:** Ensures independence of engine from application, supports research/training separation, follows Directive Part K.
- **Date:** 2026-11-04

### 2. Technology Stack (Directive Part K, Section 26)
- **Frontend:** React, TypeScript, Vite (Responsive CSS)
- **Backend:** Python, FastAPI (SQLite initial)
- **Engine:** Independent Python package (no external dependencies)
- **Reason:** Lightweight for low-spec hardware (Intel Celeron N3350, 3.7GB RAM), follows Directive Part O.
- **Date:** 2026-11-04

### 3. Independence Policy (Directive Part B, Section 3)
- **Decision:** No Piper source/models/weights/data, no commercial TTS engines, no external APIs, no external AI tokens, no unlicensed pretrained models, no copied code.
- **Reason:** Mandatory independent technology (Directive Part B).
- **Date:** 2026-11-04

### 4. Hybrid Architecture (Directive Part B, Section 4)
- **Decision:** Combine mathematical/physical simulation, acoustic engineering, and independent computational learning.
- **Reason:** Owner selection, supports long-term objective (Directive Part A).
- **Date:** 2026-11-04

### 5. Source-Filter Model (Directive Part C, Section 6)
- **Decision:** Y(z) = G(z) × H(z) × L(z) as foundational approach.
- **Reason:** Scientific foundation (Directive Part C).
- **Date:** 2026-11-04

### 6. Voice DNA Representation (Directive Part D, Section 8)
- **Decision:** Separate Identity Profile (stable) and Performance Direction (temporary).
- **Reason:** Maintains identity consistency across performances (Directive Part D, Section 9).
- **Date:** 2026-11-04

### 7. Development Environment Constraints (Directive Part O, Section 35)
- **Decision:** Lightweight implementation for low-spec hardware (Intel Celeron N3350, 3.7GB RAM). Separate training scripts for GPU.
- **Reason:** Owner's computer limitations (Directive Part O).
- **Date:** 2026-11-04

### 8. Audio Format (Directive Part M, Section 30)
- **Decision:** Initial target WAV (Mono, documented sample rate, PCM). MP3 deferred.
- **Reason:** Independent implementation, licensing considerations (Directive Part M).
- **Date:** 2026-11-04

### 9. Research Integration (Directive Part R, Section 40)
- **Decision:** Study publications but do not copy code/models. Record findings in RESEARCH_REGISTER.md.
- **Reason:** Independent technology requirement (Directive Part B, Section 3).
- **Date:** 2026-11-04

### 10. Testing Framework (Directive Part N, Section 32)
- **Decision:** Automated tests from beginning (Profile, Phoneme, Text, Prosody, Acoustic, Audio).
- **Reason:** Quality assurance (Directive Part N).
- **Date:** 2026-11-04
