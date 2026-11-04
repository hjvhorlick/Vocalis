# RESEARCH REGISTER — VOCALIS
## Version 2.0
**Last Updated:** 2026-11-04

### Research 1
- **Title:** Computer-Implemented Articulatory Models for Speech Production: A Review
- **Authors:** Bernd J. Kröger
- **Publication Date:** 2022
- **Link:** https://pmc.ncbi.nlm.nih.gov/articles/PMC9040071/
- **Research Subject:** Articulatory models, vocal-tract geometry, vocal-fold/airflow modelling
- **Important Findings:** Articulatory models offer physical control; high-quality natural speech remains difficult; supports hybrid architecture
- **Possible Relevance to Vocalis:** Foundation for engine/articulation/acoustics modules
- **Limitations:** High complexity; natural speech quality challenges
- **Ideas Worth Testing:** Simplified articulatory targets (Experiment 5), vocal-tract geometry mapping
- **Licence/Usage Restrictions:** PMC Open Access (research use permitted)

### Research 2
- **Title:** A Review of Differentiable Digital Signal Processing for Music and Speech Synthesis
- **Authors:** [Journal Authors]
- **Publication Date:** 2023
- **Link:** https://www.frontiersin.org/journals/signal-processing/articles/10.3389/frsip.2023.1284100/full
- **Research Subject:** Differentiable DSP, source-filter approaches, physical components with trainable models
- **Important Findings:** Differentiable operations enable training; source-filter integration possible
- **Possible Relevance to Vocalis:** Learning system (Refinement), Acoustics module integration
- **Limitations:** May require GPU for training; independent implementation needed
- **Ideas Worth Testing:** Differentiable filters in Experiment 2/3, Model D refinement
- **Licence/Usage Restrictions:** Frontiers Open Access (research use permitted)

### Research 3
- **Title:** Controllable Speech Synthesis by Learning Discrete Phoneme-Level Prosodic Representations
- **Authors:** [Journal Authors]
- **Publication Date:** 2023
- **Link:** https://www.sciencedirect.com/science/article/pii/S016763932200139X
- **Research Subject:** Phoneme-level prosody, pitch/duration control, speaker identity vs performance
- **Important Findings:** Prosody prediction without reference recording; identity separation
- **Possible Relevance to Vocalis:** Prosody module (Stage 7), Voice DNA separation (Stage 3)
- **Limitations:** Commercial database usage (must verify rights for Vocalis)
- **Ideas Worth Testing:** Model B prosody predictor, Identity preservation (Stage 6)
- **Licence/Usage Restrictions:** ScienceDirect (verify commercial training rights)

### Research 4
- **Title:** Controllable Neural Text-to-Speech Synthesis Using Intuitive Prosodic Features
- **Authors:** [Conference Authors]
- **Publication Date:** 2020
- **Link:** https://www.isca-archive.org/interspeech_2020/raitio20_interspeech.html
- **Research Subject:** Controllable pitch, range, duration, energy, spectral tilt
- **Important Findings:** Meaningful control parameters affect speech quality
- **Possible Relevance to Vocalis:** Voice Creation Studio controls (Stage 2), Identity Profile (Stage 3)
- **Limitations:** Neural approach (must implement independently)
- **Ideas Worth Testing:** Pitch/depth/texture controls mapping (Stage 2)
- **Licence/Usage Restrictions:** ISCA Archive (research use permitted)

### Research 5
- **Title:** Deep Learning-Based Expressive Speech Synthesis: A Systematic Review
- **Authors:** [Journal Authors]
- **Publication Date:** 2024
- **Link:** https://link.springer.com/article/10.1186/s13636-024-00329-7
- **Research Subject:** Expressive synthesis, prosody control, emotion/style, speaker/style separation
- **Important Findings:** Emotion/style representation; performance direction mapping
- **Possible Relevance to Vocalis:** Performance Direction (Stage 3), Emotion controls (Stage 2)
- **Limitations:** Commercial training data (verify rights)
- **Ideas Worth Testing:** Model B/E predictors, Emotion mapping (Stage 9)
- **Licence/Usage Restrictions:** Springer (verify commercial training rights)

### Research 6
- **Title:** Speech Production and Acoustic Properties
- **Authors:** Aalto University
- **Publication Date:** [Current]
- **Link:** https://speechprocessingbook.aalto.fi/introduction/speech-production-and-acoustic-properties/
- **Research Subject:** Vocal-tract acoustics, resonances, formants
- **Important Findings:** Practical scientific foundation for source-filter model
- **Possible Relevance to Vocalis:** Acoustics module (Stage 4), Source-Filter Y(z) (Stage 4)
- **Limitations:** Educational material; independent implementation required
- **Ideas Worth Testing:** Experiment 2/3 resonance filters, Formant control
- **Licence/Usage Restrictions:** Aalto University (educational/research use permitted)

### Research 7
- **Title:** The Source-Filter Model of Speech Production
- **Authors:** University of Oxford
- **Publication Date:** [Current]
- **Link:** https://www.phon.ox.ac.uk/jcoleman/source_filter
- **Research Subject:** Acoustic sources, turbulence, vocal-fold vibration, source-filter principles
- **Important Findings:** Foundation for G(z)×H(z)×L(z) model
- **Possible Relevance to Vocalis:** Acoustics module (Stage 4), Experiment 1/2/4
- **Limitations:** Theoretical; independent implementation required
- **Ideas Worth Testing:** Glottal excitation (Experiment 1), Noise sources (Experiment 4)
- **Licence/Usage Restrictions:** University of Oxford (educational/research use permitted)

### Research 8
- **Title:** HiFi-Glot: Neural Formant Synthesis with Differentiable Resonant Filters
- **Authors:** [arXiv Authors]
- **Publication Date:** 2024-09
- **Link:** https://arxiv.org/abs/2409.14823
- **Research Subject:** Source-filter + neural waveform, differentiable resonant filters, formant control
- **Important Findings:** Direct formant control potential; neural refinement
- **Possible Relevance to Vocalis:** Research direction only; Model D refinement (Stage 8)
- **Limitations:** Research reference only; DO NOT use implementation/weights (Directive Part B, Section 3)
- **Ideas Worth Testing:** Formant movement (Experiment 3), Differentiable filters (Stage 8)
- **Licence/Usage Restrictions:** arXiv (research reference only; no code copying)

### Register Maintenance
- **Separate Facts from Hypotheses:** Documented above
- **Licence Verification:** Required before training (Directive Part I, Section 22)
- **Commercial Usage Rights:** Must be established (Directive Part I, Section 22)
