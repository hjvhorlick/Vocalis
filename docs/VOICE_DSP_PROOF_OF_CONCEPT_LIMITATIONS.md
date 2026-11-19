# Local DSP proof-of-concept: scope and limitations

**Version:** 2026-11-18

Vocalis currently implements a local, browser-only proof of concept:

- a Web Worker runs deterministic normalized-autocorrelation F0/voicing analysis, LPC spectral-envelope peak estimation and aperiodicity estimates on a decoded working copy;
- pitch is bounded and applied only to detected voiced regions before independent WSOLA duration adjustment;
- a bounded STFT spectral-envelope warp changes broad resonance regions; and
- complementary shelf filters provide a declared broadband spectral-tilt control.

This is **not** a WORLD/WORLD-Vocoder WebAssembly integration and it is **not** a production source-filter resynthesizer. No code or UI calls it a measured formant tracker, a new human speaker, a new accent, a reusable voice model, or a guarantee of naturalness. The fixed low/mid/high EQ controls remain delivery colour, explicitly separate from spectral-envelope warping.

A production source-filter/WASM adoption remains gated on: a maintained upstream/fork, licence and reproducibility review, consented fixed test clips, the blind-listening protocol, artefact and CPU measurements across advertised ranges, and a documented rollback path. Until then, listener approval plus objective clipping/discontinuity/voiced-coverage guards are mandatory for each candidate.
