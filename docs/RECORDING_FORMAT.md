# Vocalis recording and voice formats

All three formats are JSON containers, not ZIP archives or new audio codecs.
The extension is a convenience; consumers must validate the `format`, `version`,
and encoding fields. Audio is mono, 24 kHz, signed 16-bit little-endian PCM WAV,
encoded as base64. No format contains executable code or neural weights.

## `.vproject`: `vocalis-recording-project`, version 2

- `synthesis`: `recorded-phrases-only` (the project is authoring data, not a bank).
- `audio`: `{ encoding: "PCM_S16LE", sampleRate: 24000, channels: 1 }`.
- `project`: ID, name, language, accent, creation and update timestamps.
- `rights`: acknowledgement and notice, not an assignment/license grant.
- `prompts`: `{ id, text, category }[]`, including unrecorded sentences.
- `recordings`: `{ promptId, recordedAt, wavBase64, alignment? }[]`.
- `alignment`: `{ reviewed: boolean, segments: { phone, start, end }[] }`.
  Start/end are seconds in the exact associated WAV. Labels are English ARPABET
  without stress, plus `SIL` for silence. Boundaries must not overlap.
- `pronunciations`: optional dictionary of word → English phone-label array.

Version 1 projects remain importable and have no required alignment fields.
Imports create a new project ID and require permission confirmation again.
Audio measurements are recomputed. Replacing a recording drops its old alignment.

The original browser-encoded microphone stream is decoded/resampled into the
canonical WAV and not retained separately. No denoising, loudness normalization,
automatic trimming or acoustic alignment is applied. Microphone tests and unkept
takes are excluded. Import limit: 120 MiB; 100 prompts of at most 500 characters;
30 seconds per recording; at most 300 segments per recording.

## Phrase `.vvoice`: `vocalis-recorded-phrase-voice`, version 1

Same base layout as a recording project, but every included prompt has approved
audio. Unrecorded prompts and sound alignments are excluded. It replays whole
sentences and cannot synthesize arbitrary text. Open it in the recording toolbar.

The phrase arranger selects up to 20 clips with a combined length up to 180
seconds, adds 180 ms between phrases and applies 5 ms boundary fades. The sequence
is temporary; download its assembled WAV to keep that arrangement.

## Sound-bank `.vvoice`: `vocalis-unit-voice`, version 1

Open under **Build & test → Open sound bank**. This format is deliberately distinct
from the phrase format. Importing requires renewed permission confirmation before
synthesis, installation or re-export.

```text
format: "vocalis-unit-voice"
version: 1
method: "manual-phoneme-units-v1"
speaker: { name, language, accent }
createdAt, exampleText?
audio: { sampleRate: 24000, channels: 1, encoding: "PCM_S16LE",
         sha256, wavBase64 }
units: [{ phones: ["B", "IY"], offset, length, sourcePromptId }, ...]
pronunciations: { word: ["PHONE", ...], ... }
notices: ["...", ...]
```

`offset` and `length` count **samples in the WAV payload**, not file bytes. Each
entry contains one to three phone labels. The bank builder extracts contiguous
reviewed spans; `SIL` or gaps over 35 ms break multi-phone spans. Extremely quiet
units are skipped. Up to eight candidates are kept per sequence. Source prompt
IDs are provenance references, not pointers to files on the receiver's device.

Limits: 6,000 units, 60 MiB of decoded WAV, 120 MiB JSON import. Units must be
within audio bounds and no longer than 6.1 seconds. Every candidate label must
belong to the supported inventory. The SHA-256 digest covers the WAV, detects
accidental audio modification and is **not** a digital signature or proof of
speaker identity/consent. Metadata and unit labels require separate review.

The English dictionary runs locally in the application. Only project-specific
pronunciation entries are embedded. Bank exports include dictionary notices and
a statement that speaker/recording rights remain with their owners. Imported
notices are retained; the software cannot verify their legal truth.

## How the experimental selector works

Text is looked up in the local dictionary, with project-specific overrides.
Unsupported characters/numbers and unknown pronunciations raise errors rather
than silently dropping text. Numbers must be written in words for custom banks.
Missing single-phone coverage blocks rendering. There is no fallback to another
speaker or to formant synthesis for a user bank.

For each word, a bounded deterministic beam search selects one-, two- or
three-phone candidates. Its cost favours fewer joins and penalizes waveform/RMS
mismatch and atypical unit durations. Overlap crossfades are followed by small
word-edge fades and punctuation pauses. This is not learned prosody, phonetic
alignment or a naturalness guarantee. Inventory coverage does not measure
intelligibility, diphone coverage, voice identity or accent accuracy.

## Persistence and components

- `vocalis-recording-studio` IndexedDB: projects and approved recordings/labels.
- `vocalis-sound-banks` IndexedDB: installed sound banks.
- `vocalis-audio-vault` IndexedDB: generated takes and their actual WAV blobs.
- localStorage: profile metadata, personal ratings and legacy preferences.

`RecordingStudio`, `RecordingCapture`, `SoundAlignmentEditor`, `VoiceBankBuilder`
and `PhraseWorkbench` are separate UI components. `voicePhonetics`,
`voiceBankEngine`, `voiceBankArchive`, `voiceBankStorage`, `recordingArchive`,
`recordingAudio` and `takeStorage` keep data, processing and persistence separate.

Changing the frontend origin does not migrate browser data. Export both authoring
projects and runtime banks; download saved WAV takes separately. Do not put
private voice files in the Git repository or source export.
