# Voice synthesis research and engineering plan

## Non-negotiable direction

Vocalis's speech must remain local and non-AI: no neural speech generation, voice cloning, cloud TTS, or browser/system TTS. The user has asked for a voice that is already ready to use, so the default is now the real CMU ARCTIC recorded-unit path. Mathematical formant synthesis remains available as an experimental alternative; neither method may silently masquerade as the other.

A mathematical formant synthesizer is expected to sound synthetic. It can be made clearer, smoother, and more expressive, but should not be advertised as a natural human recording or a new human identity. Recorded-unit synthesis has real speaker audio as its source, but can still sound poor if unit coverage, timing, selection, or joins are inadequate.

## Evidence-based design choices

- **Source-filter, not a static tone bank.** Klatt's cascade/parallel synthesizer specifies time-varying formant frequencies, bandwidths, voicing, aspiration, and frication. Parallel noise/formant paths are especially relevant to consonants, which a vowel-only harmonic bank cannot produce convincingly. References: [Klatt 1980](https://doi.org/10.1121/1.383940), [MIT speech-synthesis lab notes](https://ocw.mit.edu/courses/6-542j-laboratory-on-the-physiology-acoustics-and-perception-of-speech-fall-2005/pages/labs/lab15/).
- **Shape the voiced source.** A symmetric sine or perfectly regular pulse train overemphasizes buzzy harmonics. The Liljencrants–Fant family models glottal-pulse asymmetry and spectral tilt; aspiration noise adds another important cue. References: [Klatt & Klatt 1990](https://doi.org/10.1121/1.398894), [LF glottal-source synthesis study](https://era.ed.ac.uk/server/api/core/bitstreams/1648d384-8a8a-4ac8-9e10-4bc4f79f6643/content).
- **Prosody is more than pitch shifting.** Phone duration, F0, energy, lexical stress, phrase breaks, and boundary tones work together. MBROLA's interface makes phone durations and piecewise-linear F0 targets explicit. References: [MBROLA project paper](https://www.isca-archive.org/icslp_1996/dutoit96_icslp.pdf), [ToBI rule-based intonation generation](https://www.sciencedirect.com/science/article/abs/pii/S0167639399000084).
- **Do not time-stretch recorded speech by raw resampling.** Pitch-synchronous overlap-add (PSOLA) changes pitch and duration with frames aligned to glottal periods; poor pitch marks or excessive transformations create artifacts. Reference: [Moulines & Charpentier, pitch-synchronous waveform processing](https://courses.physics.illinois.edu/ece420/sp2019/5_PSOLA.pdf).
- **A recorded-unit voice needs real selection, not one unit per pair.** Established unit-selection systems retain candidate examples and minimize both target-context cost and join cost; useful features include stress, neighboring phones, phrase position, F0, energy, and spectral mismatch, commonly searched with Viterbi. The current compact CMU pack stores only one chosen candidate per diphone and basic crossfades, so it is an experiment, not a high-quality unit-selection system. Reference: [Festival 2 / Multisyn](https://www.cstr.inf.ed.ac.uk/downloads/publications/2004/clarkrichmondking_ssw504.pdf).
- **Voice adaptation must change more than F0.** Formant locations/bandwidths and source characteristics contribute to perceived voice quality. Presets should expose bounded, explainable controls, not claim that pitch shifting creates a new person or accent. A real accent requires appropriate phonology and prosody, not a small timbre adjustment.

## Current work in Vocalis

The shared text-to-speech path defaults to CMU ARCTIC recorded units for audition, Speech Studio, dialogue, and WAV export. A join-level amplitude bug that under-scaled one side of every crossfade has been corrected. The mathematical formant path remains explicitly experimental and includes shaped voiced pulses, formant resonators, modeled aspiration/frication and stop releases, smooth formant transitions, stress-weighted timing, phrase-final vowel lengthening, and a basic question-rise/statement-fall contour. These implementation changes do not substitute for listening-based quality checks.

## Next improvement sequence

1. **Freeze an evaluation set:** common statements, questions, names, numbers, punctuation, difficult consonants, and multi-syllable stress patterns. Keep the exact text, settings, generated WAVs, and listening notes for each revision.
2. **Improve the mathematical voice:** move from per-phone chunks to continuous frame-based parameter tracks; refine place-specific consonant targets and nasal poles/anti-resonances; add richer phrase grouping, rule-based pitch accents and emphasis, and controlled intensity variation. Avoid independent per-phone buzz and abrupt filter resets.
3. **Improve persona adaptation:** separate vocal-source controls (F0 range, pulse shape, spectral tilt, aspiration) from vocal-tract controls (formant scale and bandwidth). Keep transformations moderate and label them as modeled characteristics. Accent-specific profiles need validated pronunciation rules and separate listening checks.
4. **Improve the default recorded path:** retain multiple good, context-labelled candidates per transition; score stress/context and pitch/energy/spectral continuity; select a sequence globally; correct and verify segment boundaries; use pitch-marked modification only when necessary. Continue to preserve complete source notices.
5. **Use listening gates:** compare versions blind with a consistent set of speakers; record intelligibility, smoothness, naturalness, and preference. Inspect F0/duration tracks and clipping as diagnostics. A successful build or RIFF header is not an audio-quality pass.

The next implementation should be judged by listening results. If listeners still describe the mathematical mode as robotic, its status should remain experimental and the limitation should be visible rather than hidden by persona names.
