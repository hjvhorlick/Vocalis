# DEVELOPMENT ROADMAP — VOCALIS
## Version 2.0
**Last Updated:** 2026-11-04

### Stage 1: Build the real project foundation (Current)
- [x] Inspect repository and environment
- [x] Establish project structure
- [x] Create project documentation (12 files)
- [ ] Create first web application foundation (React/TypeScript/Vite)
- [ ] Create backend foundation (Python/FastAPI)
- [ ] Create engine package initialization
- [ ] Create test framework
- [ ] Create first working application shell
- [ ] Run initial tests
- **Deliverable:** Real, runnable Vocalis project foundation

### Stage 2: Build the interface
- [ ] Dashboard (Welcome, Create Voice, Recent voices/projects, Library/TTS shortcuts, Status)
- [ ] Voice Creation Studio (Personality, Identity controls, Pitch/Depth, Texture, Resonance, Accent, Articulation, Pace, Emotion, Breathing/Pauses, Preview, Generate, Save)
- [ ] Personality Presets (6 templates, customisation)
- [ ] Advanced Controls (Detailed adjustments, experimental labels)
- [ ] Voice Library (Save, Rename, Edit, Duplicate, Delete, Import, Export, Reuse)
- [ ] Text-to-Speech Studio (Text input, Voice selection, Performance direction, Generate, Preview, Regenerate, Export)
- **Deliverable:** Working web application with functional profile management

### Stage 3: Build Voice DNA
- [ ] Profile schema implementation
- [ ] Validation and defaults
- [ ] Presets loading
- [ ] Parameter adjustment
- [ ] Saving/Loading/Renaming/Duplicating/Exporting/Importing
- [ ] Persistent storage (SQLite)
- **Deliverable:** Users construct and save voice identities

### Stage 4: Build the acoustic laboratory
- [ ] Experiment 1: Basic excitation (glottal waveform, F0, harmonics, pulse shape, open quotient)
- [ ] Experiment 2: Source-filter generation (resonant filter, vowel-like sounds)
- [ ] Experiment 3: Formant control (time-varying, smooth transitions)
- [ ] Experiment 4: Voiced/unvoiced generation (noise sources, fricatives)
- [ ] Experiment 5: Dynamic articulation (transitions, targets)
- [ ] Experiment 6: Syllables (CV, VC patterns)
- [ ] Experiment 7: Words (controlled vocabulary, transitions)
- [ ] Experiment 8: Short phrases (continuous generation, limitation recording)
- **Deliverable:** Reproducible acoustic prototype with real sound

### Stage 5: Phonetics and articulation
- [ ] English phoneme inventory
- [ ] Phoneme mapping (text -> normalised -> phonemes -> syllables -> words -> structure)
- [ ] Vowel/consonant generation
- [ ] Transitions and syllable generation
- **Deliverable:** Limited but genuine phonetic synthesiser

### Stage 6: Three voice identities
- [ ] Voice A (Documentary), Voice B (Conversational), Voice C (Storyteller)
- [ ] Performance directions (3 per identity)
- [ ] Identity preservation testing
- **Deliverable:** Parameter-based identity construction demonstration

### Stage 7: Words and phrases
- [ ] Text normalisation and pronunciation dictionary
- [ ] Basic English phoneme conversion
- [ ] Syllable planning, word generation, sentence planning
- [ ] Timing and prosody
- **Deliverable:** First continuous speech experiments

### Stage 8: Learning and refinement
- [ ] Dataset rights establishment
- [ ] Training objective definition
- [ ] Baseline measurement and evaluation metrics
- [ ] Model A-E implementation (Duration, Prosody, Articulation, Acoustic, Variation)
- **Deliverable:** Documented and reproducible refinement experiment

### Stage 9: Complete voice design experience
- [ ] Connect controls to engine
- [ ] Performance direction, emotion, breathing, variation, pronunciation, reuse
- **Deliverable:** Working voice creation and generation workflow

### Stage 10: Quality and production
- [ ] Naturalness, intelligibility, identity consistency, long-form performance
- [ ] Speed, reliability, memory efficiency
- [ ] API documentation and deployment preparation
- **Deliverable:** Tested, documented independent platform

### Current Progress
- Date: 2026-11-04
- Branch: arena/5f698619-vocalis
- Stage: 1 (Foundation)
- Next Milestone: Stage 2 Interface Foundation
