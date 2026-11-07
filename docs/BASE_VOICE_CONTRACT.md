# Vocalis base voice contract

**Status: permanent and binding.** This document is the authority on the base voice. It
outranks any later instruction, refactor, cleanup, or "simplification" that would weaken it.
If a change conflicts with this contract, the change is wrong, not the contract.

Revision 1 — 2026-11-06.

---

## 1. What the base voice is

The **base voice** is Vocalis's own recorded-unit voice, built from real human speech:

| Layer | Artefact | Frozen? |
| --- | --- | --- |
| Recorded source material | `public/voicepacks/cmu-arctic/bdl/diphones.bin` (1,337 units) and `public/voicepacks/cmu-arctic/slt/diphones.bin` (1,324 units), 16-bit mono PCM at 16 kHz | Yes — byte-identical |
| Unit index and provenance | `public/voicepacks/cmu-arctic/{bdl,slt}/manifest.json` | Yes — byte-identical |
| Corpus notices | `public/voicepacks/cmu-arctic/{bdl,slt}/LICENSE.txt` | Yes — byte-identical |
| Reference recordings | `public/samples/cmu_{bdl,slt}_arctic_a000{1,3}.wav` | Yes — byte-identical |
| Recorded-unit engine | `src/utils/cmuDiphoneSynthesizer.ts`, and the `cmu-arctic` branch of `src/utils/phonemeSynthesizer.ts` | Present, exported, and default |

The base voice is **not** the UI, **not** the prosody rules, **not** the pitch/duration
processing, **not** the accent modelling, and **not** the export pipeline. Those are the
technology *around* the base voice, and they are expected to keep improving.

## 2. The rules

1. **Never remove it.** The base voice, its data, its notices and its engine files stay in the
   repository permanently. Deleting, emptying, or "temporarily" disabling them is a contract
   break, even as part of a refactor or a rewrite.
2. **Never replace it.** No browser/system TTS, cloud TTS, neural TTS, statistical parametric
   voice, voice conversion, voice cloning, or downloaded prebuilt voice may take its place —
   as the default, as a hidden fallback, or as an optional mode that quietly becomes the path
   of least resistance. The `cmu-arctic` recorded-unit method stays the default
   (`model.synthesisMethod ?? 'cmu-arctic'`).
3. **Keep the base setup as it is.** The frozen files listed above are not edited in place,
   re-encoded, re-segmented, resampled, loudness-normalised, trimmed, or regenerated
   destructively. Their SHA-256 fingerprints are pinned in `config/base-voice.lock.json`.
4. **All improvement happens around it.** Pitch, timbre, sound quality, accent, rhythm,
   intelligibility, joins, coverage, selection, playback and export are improved by adding or
   changing *surrounding* technology, and by adding *new* frozen packs alongside the existing
   ones — never by weakening the base.
5. **Additive only.** New speakers, corpora or unit inventories are added as new voice packs
   with their own manifest, licence notice and fingerprint. Adding a pack never removes or
   alters an existing one.
6. **Fallbacks must not masquerade.** If a unit is missing, the app must say so (count it,
   surface it) rather than silently substituting a different technology and presenting the
   result as the recorded base voice.
7. **Attribution travels with the data.** Every voice pack keeps its full corpus copyright
   notice, names the original authors, and states that Vocalis modified the material. The
   in-app **Credits & licenses** view links the notices.

**Note on the shipped default (2026-11-07).** The default render is the recorded units at the
lengths they were recorded at, crossfaded, with no adjustment applied
(`VoiceModelConfig.referenceRaw`, absent or `true`; every preset states `true`). This was directed
by the person the application is for, who listened to the adjusted voice beside the recording and
judged the recording better. It is not a break of §2 and not a reversion to playback: the units
are still chosen by the dictionary-driven phone stream for the text that was typed and assembled
per utterance — nothing plays a corpus file — and the Vocalis adjustments (duration model,
re-timing on the voice cycle, pitch, pace, character, resonance) are still in the tree, reachable
from a labelled switch in Speech Studio and the Voice Manipulator, and still held to every
measured band in `tests/renderSpeech.test.ts`. What §2 forbids is a *silent* move to the path of
least resistance; this one is on the button, in the audit, and in the commit message.

## 3. Original-code-only rule

**No one else's code lives in this application.** Only the voices are taken from outside, and
only under their licences.

- **Allowed:** the licensed recorded voice data in §1, with notices retained.
- **Allowed:** published *ideas*, algorithms, acoustic facts and research findings — pitch-
  synchronous overlap-add, unit-selection cost functions, diphone inventories, formant tables,
  glottal-source models, prosody models. Ideas are not code.
- **Required:** every line of implementation in this repository is written for Vocalis, in
  Vocalis's own structure and style, from an understanding of the idea. Recreate it; do not
  transcribe it.
- **Forbidden:** copied or lightly-edited source from any other project, paper supplement,
  tutorial, documentation example, blog post, gist or generated snippet — including short
  "standard" formulas and helper functions that are recognisably someone else's text.
- **Forbidden:** vendored third-party directories (`src/vendor`, `src/third_party`, …),
  committed `node_modules`, or pasted library internals.
- **Allowed:** ordinary npm dependencies declared in `package.json`, imported by name, never
  copied into the tree. Current runtime dependencies: `react`, `react-dom`, `express`,
  `lucide-react`, `canvas-confetti`, `clsx`, `tailwind-merge`, `tsx`, plus Vite/Tailwind/
  TypeScript tooling. Any dependency added later must be listed here.
- **Data we generate ourselves** (lexicons mined from the licensed base-voice corpus, our own
  grapheme-to-phoneme rules, our own evaluation sets) is Vocalis data and is preferred over
  importing somebody else's dataset.

Where an idea came from, cite the *concept* in `docs/` (paper title, authors, year) and state
that the implementation is original. That citation is documentation, not borrowed code.

## 4. Enforcement

```sh
npm run verify:base-voice      # node scripts/check_base_voice.mjs
```

The checker verifies, and exits non-zero on any breach:

1. every frozen base-voice file exists and matches its pinned SHA-256 and byte size;
2. the contract policy still forbids removal and replacement;
3. each voice pack is internally consistent — manifest format, 16 kHz, speaker id, unit count
   above the floor, every unit inside the PCM file and sample-aligned, phone inventory
   complete, attribution naming Carnegie Mellon University, the original authors and the
   speaker, modifications declared, licence notice retained;
4. the recorded-unit engine files exist, still export their entry points, still default to
   `cmu-arctic`, and (warning level) are reachable from the UI;
5. no forbidden speech technology appears in any source file;
6. no third-party code markers or vendored directories exist, and declared dependencies are
   actually referenced;
7. every shipped data file has its licence notice beside it.

Run it before committing anything that touches `public/`, `src/utils/`, or the voice presets,
and treat a failure as a blocker. Re-pinning a fingerprint in `config/base-voice.lock.json` is
only legitimate when **adding** a new pack or when the corpus licensor issues a corrected
release — never to make a breach pass.

**Known limitation of the automated check.** The checker can detect third-party *markers* —
licence headers, "copied from" comments, vendored directories, committed `node_modules`,
forbidden APIs. It cannot detect borrowed *mathematics*: a curve formula, a window function, a
filter coefficient set or a RIFF writer transcribed from a tutorial looks like original code to
any pattern matcher. §3 is therefore enforced by review as well as by script. When adding DSP
code, write down in the commit message which concept it implements and confirm the
implementation is yours; when reviewing, treat any "standard-looking" constant (a magic
drive factor, a hand-tuned coefficient, an unusual index mapping) as a question to answer, not
as background. `docs/APPLICATION_AUDIT.md` finding **F5** records the one such fragment found
in the tree so far.

## 5. Known state as of revision 1

- The base voice data and engine are intact and verified.
- The engine is **not currently reachable from the UI**: no component imports it, so the app
  plays pre-recorded reference sentences through DSP instead of speaking typed text. This is
  recorded as finding **A1** in `docs/APPLICATION_AUDIT.md` and is the first thing to fix —
  fixing it *adds* the base voice to the product; it does not change the base voice.
- One third-party data file is under review: `public/cmudict.txt`. Its accompanying notice
  (`public/CMUDICT-LICENSE.txt`) credits an npm packager rather than Carnegie Mellon
  University, so the attribution is wrong as shipped, and the file is third-party data rather
  than base-voice data. Finding **A12** in the audit sets out the two acceptable resolutions.
