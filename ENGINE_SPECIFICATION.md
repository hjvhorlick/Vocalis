# ENGINE SPECIFICATION — VOCALIS
## Version 2.0
**Last Updated:** 2026-11-04

### 12. Overall Processing Sequence (Directive Part G)
1. TEXT INPUT
2. TEXT NORMALISATION (`engine/vocalis_engine/text/`)
3. LINGUISTIC ANALYSIS (`engine/vocalis_engine/text/`)
4. PHONEME CONVERSION (`engine/vocalis_engine/phonetics/`)
5. SYLLABLE AND WORD STRUCTURE (`engine/vocalis_engine/phonetics/`)
6. SENTENCE AND CONTEXT ANALYSIS (`engine/vocalis_engine/prosody/`)
7. PERFORMANCE PLANNING (`engine/vocalis_engine/prosody/`)
8. VOICE DNA APPLICATION (`engine/vocalis_engine/identity/`)
9. PHONEME-LEVEL ARTICULATION PLANNING (`engine/vocalis_engine/articulation/`)
10. TIME-DEPENDENT VOCAL CONTROL (`engine/vocalis_engine/acoustics/`)
11. ACOUSTIC SOUND GENERATION (`engine/vocalis_engine/synthesis/`)
12. NATURALNESS REFINEMENT (`engine/vocalis_engine/refinement/`)
13. AUDIO VERIFICATION (`engine/vocalis_engine/audio/`)
14. OUTPUT AUDIO (`engine/vocalis_engine/audio/`)

### Module Specifications

#### text/ (Text Normalisation & Linguistic Analysis)
- Input: Raw text
- Output: Normalised text tokens
- Handles: Punctuation, numbers, dates, times, currency, abbreviations, acronyms, symbols, paragraphs, quotation marks, sentence boundaries

#### phonetics/ (Phoneme Conversion & Structure)
- Input: Normalised text
- Output: Phoneme sequences, syllables, words, sentence structure
- English phoneme inventory, pronunciation dictionary, fallback strategy

#### prosody/ (Prosody & Speech Planning)
- Input: Phoneme structure, performance direction
- Output: F0 contours, pitch range, pitch accents, stress, durations (syllable/phoneme/word), energy, phrase boundaries, pauses, rhythm, intonation, sentence type, emotional intention
- Levels: Sentence, Phrase, Word, Syllable, Phoneme

#### identity/ (Voice DNA)
- Input: Profile configuration, performance direction
- Output: Identity parameters applied to planning
- Structures: Voice Identity Profile (stable), Performance Direction (temporary)

#### articulation/ (Phoneme-Level Articulation)
- Input: Phoneme sequence, identity parameters
- Output: Articulation targets, transition planning
- Settings: Relaxed, Neutral, Clear, Crisp, Precise

#### acoustics/ (Time-Dependent Vocal Control)
- Input: Articulation targets, identity parameters
- Output: Control variables F0(t), E(t), D(t), G(t), R(t), A(t), B(t), V(t)
- Model: Source-Filter Y(z) = G(z) × H(z) × L(z)
- Time-varying vocal tract, filter interpolation, resonance transitions

#### synthesis/ (Acoustic Sound Generation)
- Input: Control variables
- Output: Waveform (PCM)
- Components: Glottal excitation, resonant filters, noise sources, formant control, vowel/consonant generation

#### refinement/ (Learning System)
- Model A: Duration predictor
- Model B: Prosody predictor
- Model C: Articulation transition predictor
- Model D: Acoustic refinement
- Model E: Natural variation planner

#### audio/ (Audio Verification & Output)
- Input: Waveform
- Output: WAV file (Mono, documented sample rate, PCM)
- Functions: Preview, download, duration info, integrity checks, error reporting

### Interface Contract (Directive Part F & K)
- **Input:** Text, Voice DNA (Profile + Performance), Pronunciation configuration
- **Output:** Generated audio, duration, sample rate, metadata, errors
- **Status:** Independent implementation (No Piper, No external APIs, No external AI tokens)

### Independence Constraints (Directive Part B, Section 3)
- Prohibited: Piper source/models/weights/data, commercial TTS engines, external APIs, external AI tokens, unlicensed pretrained models, copied code
- Allowed: Development libraries (licensed), scientific publications, mathematical methods, acoustic principles, documented research
