# ACOUSTIC EXPERIMENTS — VOCALIS
## Version 2.0
**Last Updated:** 2026-11-04

### Experiment Framework (Directive Part H, Section 16)
- **Laboratory Location:** `research/experiments/`
- **Reproducibility:** Every experiment records settings
- **Inspection:** Waveforms, frequency spectra, listening samples, saved settings
- **Output:** WAV format (Mono, documented sample rate, PCM)

### Experiment 1: Basic excitation (Directive Part H, Section 17.1)
- **Objective:** Generate mathematically controlled periodic excitation signal
- **Parameters:** Fundamental frequency (F0), pulse shape, open quotient, closing behaviour, harmonic structure
- **Comparison:** Simple periodic vs glottal-flow-derived waveforms
- **Status:** Not yet implemented (Stage 4)
- **Expected Output:** Basic excitation waveform, F0 control demonstration

### Experiment 2: Source-filter generation (Directive Part H, Section 17.2)
- **Objective:** Pass excitation through configurable resonant filter
- **Parameters:** Resonance frequencies, vowel character mapping
- **Status:** Not yet implemented (Stage 4)
- **Expected Output:** Simple vowel-like sounds

### Experiment 3: Formant control (Directive Part H, Section 17.3)
- **Objective:** Implement configurable formant resonances with time variation
- **Parameters:** Formant frequencies, interpolation, smooth transitions
- **Status:** Not yet implemented (Stage 4)
- **Expected Output:** Time-varying formant demonstration

### Experiment 4: Voiced and unvoiced sound generation (Directive Part H, Section 17.4)
- **Objective:** Add noise sources, fricative-like sounds, combination
- **Parameters:** Noise intensity, voiced/unvoiced ratio
- **Status:** Not yet implemented (Stage 4)
- **Expected Output:** Voiced/unvoiced combination demonstration

### Experiment 5: Dynamic articulation (Directive Part H, Section 17.5)
- **Objective:** Simplified articulation targets, vowel/consonant transitions
- **Parameters:** Articulation style (relaxed/neutral/clear/crisp/precise)
- **Status:** Not yet implemented (Stage 4)
- **Expected Output:** Transition demonstration

### Experiment 6: Syllables (Directive Part H, Section 17.6)
- **Objective:** Controlled syllable sequences (CV, VC patterns)
- **Parameters:** Syllable timing, phoneme mapping
- **Status:** Not yet implemented (Stage 4)
- **Expected Output:** Syllable sequence generation

### Experiment 7: Words (Directive Part H, Section 17.7)
- **Objective:** Small controlled phonetic vocabulary, transition testing
- **Parameters:** Word timing, pronunciation dictionary
- **Status:** Not yet implemented (Stage 4)
- **Expected Output:** Word generation demonstration

### Experiment 8: Short phrases (Directive Part H, Section 17.8)
- **Objective:** Continuous generation, limitation recording
- **Parameters:** Phrase timing, prosody planning
- **Status:** Not yet implemented (Stage 4)
- **Expected Output:** Short phrase generation

### Measurement Records (Directive Part N, Section 33)
- **Fundamental frequency:** Median and range of F0
- **Formant distributions:** F1, F2, F3 frequencies
- **Spectral envelope:** Characteristics
- **Harmonic-to-noise:** Ratio measurements
- **Timing patterns:** Phoneme/syllable/word durations
- **Articulation behaviour:** Transition measurements
- **Energy:** Intensity over time
- **Speech rate:** Words/phonemes per second
- **Signal-to-noise:** Quality measurements

### Listening Evaluation (Directive Part N, Section 34)
- **Collection:** Vowels, Consonants, Syllables, Words, Questions, Statements, Long sentences, Emotional sentences, Difficult names, Numbers, Paragraphs
- **Assessment:** Intelligibility, Naturalness, Identity consistency, Expressiveness, Pronunciation, Listening comfort
- **Method:** Blind tests (when quality sufficient), human listeners
- **Status:** Not yet implemented (Stage 10)

### Experiment Logging Format
```json
{
  "experiment_id": "string",
  "date": "ISO8601",
  "settings": {
    "f0": "float",
    "pulse_shape": "string",
    "open_quotient": "float",
    "resonance_frequencies": "array",
    "formant_control": "object",
    "noise_intensity": "float",
    "articulation_style": "string"
  },
  "observations": "string",
  "results": {
    "waveform_file": "path",
    "spectrum_file": "path",
    "audio_file": "path",
    "measurements": "object"
  },
  "limitations": "string"
}
```

### Current Status
- **Stage:** 1 (Foundation)
- **Next Task:** Implement Experiment 1 in Stage 4 (Acoustic Laboratory)
