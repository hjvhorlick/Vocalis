# VOCALIS INTERFACE — STAGE 2 & 3 IMPLEMENTATION
## Version 2.0
**Last Updated:** 2026-11-04

### Stage 2: Build the interface (Continued)
- **Dashboard**: Welcome, Create Voice, Recent voices/projects, Library/TTS shortcuts, Status
- **Voice Creation Studio**: Personality selection, Identity controls, Pitch/Depth, Texture, Resonance, Accent, Articulation, Pace, Emotion, Breathing/Pauses, Preview, Generate, Save
- **Personality Presets**: 6 templates (Documentary, Storyteller, Conversational, News, Educational, Audiobook)
- **Advanced Controls**: Detailed adjustments (Experimental/Unavailable labels)
- **Voice Library**: Save, Rename, Edit, Duplicate, Delete, Import, Export, Reuse
- **Text-to-Speech Studio**: Text input, Voice selection, Performance direction, Generate, Preview, Regenerate, Export

### Stage 3: Build Voice DNA (Continued)
- **Profile Schema**: Versioned JSON (Directive Part L, Section 29)
- **Validation**: Ranges, defaults, migration rules
- **Presets**: Loading and customisation
- **Persistence**: SQLite (Backend API)
- **Operations**: Saving, Loading, Renaming, Duplicating, Exporting, Importing

### Stage 4: Build the acoustic laboratory (Continued)
- **Experiment 1**: Basic excitation (Glottal waveform, F0, harmonics, pulse shape, open quotient)
- **Experiment 2**: Source-filter generation (Resonant filter, vowel-like sounds)
- **Experiment 3**: Formant control (Time-varying, smooth transitions)
- **Experiment 4**: Voiced/unvoiced generation (Noise sources, fricatives)
- **Experiment 5**: Dynamic articulation (Transitions, targets)
- **Experiment 6**: Syllables (CV, VC patterns)
- **Experiment 7**: Words (Controlled vocabulary, transitions)
- **Experiment 8**: Short phrases (Continuous generation)

### Implementation Details (Stage 2-10)
- **Frontend**: React/TypeScript/Vite (Responsive CSS)
- **Backend**: Python/FastAPI/SQLite (Clear API contracts)
- **Engine**: Independent Python package (No Piper, No external APIs, No external AI tokens)
- **Data**: SQLite (Initial), JSON export/import
- **Tests**: Automated (Unit, Integration, Acoustic, Profile)

### Current Progress (2026-11-04)
- **Stage 1**: Foundation (COMPLETED)
- **Stage 2**: Interface (IN PROGRESS - Connecting screens to API)
- **Stage 3**: Voice DNA (IN PROGRESS - Schema validation/persistence)
- **Stage 4**: Acoustic Laboratory (PENDING - Experiment 1)
- **Stage 5**: Phonetics and Articulation (PENDING)
- **Stage 6**: Three Voice Identities (PENDING)
- **Stage 7**: Words and Phrases (PENDING)
- **Stage 8**: Learning and Refinement (PENDING)
- **Stage 9**: Complete Voice Design Experience (PENDING)
- **Stage 10**: Quality and Production (PENDING)

### Live Previews
- **Frontend**: http://5173-ig36biymqf4ashthbb4mp.e2b.app (Port 5173)
- **Backend API**: http://8000-ig36biymqf4ashthbb4mp.e2b.app (Port 8000)

### Next Actions (Immediate)
1. Connect Frontend screens to Backend API (SQLite profile management)
2. Implement functional Voice DNA validation and persistence
3. Begin Experiment 1: Basic excitation (Glottal waveform, F0, harmonics)
4. Run integration tests and acoustic prototype tests
5. Update PROJECT_STATUS.md and NEXT_STEPS.md

### Exact Next Task
**Continue Stage 2/3/4 implementation: Connect interface, implement Voice DNA persistence, and start Experiment 1 (Basic excitation) in the acoustic laboratory.**
