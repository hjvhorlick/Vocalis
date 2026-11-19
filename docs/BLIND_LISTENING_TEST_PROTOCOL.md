# Vocalis blind listening-test protocol

This protocol defines the release gate for a DSP or AI-created candidate. It is intentionally separate from the protected Original Voice Library.

## Trial setup

1. Create a finite candidate WAV and its immutable `VoiceAsset` record.
2. Verify that the asset has a parent/source SHA-256, output SHA-256, linked take and objective quality report.
3. Create a `BlindListeningTrial` using `createBlindListeningTrial(asset, nonce)`. Keep `hiddenMapping` hidden from the listener until their response is recorded.
4. Serve the verified original and candidate at matched RMS playback level. Playback level may attenuate one side, but no source or candidate bytes may be rewritten.
5. Present labels **A** and **B** in the randomized order. Do not name the original, candidate, personality, transform direction or expected winner.

## Listener response

For each trial, collect the seven integer ratings in `BlindListeningResponse` (1–5): intelligibility, naturalness, artefact freedom, tone/body fit, pitch stability, loudness, and intended-use suitability. Also collect A/B/no-preference and free-text notes.

Run at least two fixed source clips per advertised transform range and include an unmodified control pair. Randomize trial order across listeners. Reject or narrow a range when intelligibility or naturalness regresses against its control, or when notes identify repeatable warble, clicks, metallic sound, unstable pitch or tiring room treatment.

## Decision record

Store the trial, response, candidate quality report, transformation/render manifest and listener notes with the candidate review. Only then may a reviewer set **candidate → approved**. A rejected candidate is retained/removed according to the local review choice; the protected original is never modified or removed.

`src/utils/blindListeningTest.ts` provides the versioned data structures and validation used by this protocol. The `hiddenMapping` is auditable metadata, not listener-facing UI state.
