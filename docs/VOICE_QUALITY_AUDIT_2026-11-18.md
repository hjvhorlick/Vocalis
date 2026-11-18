# Vocalis voice-quality audit and roadmap

**Audit date:** 2026-11-18  
**Scope:** current `arena/391f8297-vocalis` branch, local non-neural product direction  
**Important:** this is an engineering and research audit, not a claim that the current voices passed a human listening test.

## Executive summary

Vocalis has a sound technical foundation for a privacy-preserving, browser-local **experimental concatenative voice builder**: recordings stay in the browser, imports are normalized to a documented PCM format, reviewed labels are required, missing sounds fail safely rather than borrowing another speaker, and the project/bank formats preserve provenance notices.

The largest limitation is not a failing build: it is the gap between the product's current unit inventory and natural, robust arbitrary-text speech. A full 39-phone inventory is **not** enough. Quality is limited primarily by sparse contextual coverage, manually placed boundaries, simple join scoring, and almost no prosody model. The most valuable next release is therefore a *voice-quality workflow*, not more persona cards or more tone effects:

1. measure and guide recording quality;
2. collect several context-rich examples of each required transition;
3. score/choose joins using acoustic and prosodic features;
4. add text normalization and phrase-level prosody; and
5. make blind listening results the release gate.

If the product must remain local and non-neural, it should be positioned as an honest, controllable recorded-unit synthesizer. If near-human arbitrary-text quality is a business requirement, the team should explicitly decide to add a separate consented neural/hosted lane; that is a product-policy change, not a small DSP improvement.

---

## 1. Test results

### Automated verification completed

Run from a clean dependency install on 2026-11-18:

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm ci` | PASS | Lockfile resolves; 0 npm-reported vulnerabilities in the audit run. |
| `npm run lint` | PASS | TypeScript type check passes. |
| `npm test` | PASS — 18/18 | Recording formats, PCM round trips, basic level gates, archive validation, reviewed labels, bank construction, coverage refusal, text-render mechanics, ratings and storage behavior. |
| `npm run build` | PASS | Production bundle builds successfully. |
| Development server smoke test | PASS | App shell `200`, pronunciation dictionary `200`, `/api/voice/status` `200`. |

### Browser and listening limits

The optional Playwright workflow could not be run in this sandbox because neither `playwright-core` nor a Chromium executable is installed. The repository deliberately documents that test as optional. No microphone, speaker, or human listener is available in this environment, so this audit **cannot** validate microphone behavior, acoustic labels, intelligibility, naturalness, speaker similarity, or mobile touch ergonomics.

Before release, run the documented browser command on a workstation with Chrome/Chromium and execute the listening plan in section 5.

### What the passing tests do *not* prove

The current tests are strong mechanical regression tests, but they use synthetic fixture audio. A valid WAV, a non-empty bank, or 39/39 phone labels must never be treated as evidence that the resulting speech is understandable or natural.

---

## 2. Findings from the implementation

### A. Context coverage is the primary quality bottleneck — **P0**

The custom-bank gate checks single-phone coverage. The bank does keep one-, two-, and three-phone spans, but it does not measure whether common diphones/triphones have enough *good* candidates in useful positions or prosodic contexts. A single /T/ and /IY/ does not guarantee that a new /T-IY/ transition will sound like “tea.”

**Why it matters:** coarticulation lives in the transitions. Unit-selection research builds inventories around phonetic and prosodic context, then chooses a global path with both target and join costs. See [Multisyn](https://www.sciencedirect.com/science/article/abs/pii/S0167639307000398) and the [Vepa & King join-cost study](https://publications.idiap.ch/export/publication/314/marc21).

**Recommendation:** replace the headline-only `39/39` progress signal with a coverage dashboard that shows:

- phone, diphone and high-frequency triphone coverage;
- number of reviewed candidate units per transition;
- unseen transitions in a user's proposed script;
- a “record next” queue selected to reduce the largest coverage gap.

Start with a curated, phonetically rich script, then generate prompts greedily from the user’s target domain. Published corpus workflows similarly optimize phoneme/diphone/triphone coverage before recording; for example, this [corpus-creation study](http://www.lrec-conf.org/proceedings/lrec2006/pdf/688_pdf.pdf) targets repeated phone, diphone and triphone occurrences rather than phone presence alone.

### B. Join scoring is too simple for quality selection — **P0**

`voiceBankEngine.ts` uses endpoint waveform/RMS mismatch, duration, and a bounded beam search. It does not compare spectral continuity, voicing/F0, phone context, stress, word position, or candidate recording quality. It also applies fixed overlap crossfades.

**Recommendation, in order:**

1. cut/fade at a nearby zero crossing and apply a short equal-power overlap;
2. record candidate features during bank creation: RMS, zero-crossing rate, voiced/unvoiced state, estimated F0 where voiced, spectral envelope/MFCC summary, duration, and left/right phone context;
3. add weighted target costs (context, stress, phrase position, required duration) and join costs (energy, F0 and spectral distance);
4. select over the full utterance with a pruned Viterbi/beam path; and
5. show the selected sources and a join-risk heat map so users can re-record the actual weak area.

The literature consistently treats F0, power and spectral mismatch as join-cost inputs, not just endpoint amplitude. [Vepa & King](https://publications.idiap.ch/export/publication/314/marc21) also finds that local smoothing is needed after selection.

### C. Custom-bank pitch and rate are coupled — **P1**

For a user bank, `audioDspEngine.ts` currently renders with `playbackRate = pitch × rate`; this changes pitch when speed changes and vice versa. The README accurately calls this out. The CMU preset path has a small WSOLA-style rate stage, but custom banks do not receive the same independent treatment.

**Recommendation:** extract a shared, bounded time-scale modification layer for custom-bank output before applying optional pitch modification. Do not allow large transformations by default; present “safe,” “noticeable,” and “artifact risk” ranges. The Web Audio specification describes `playbackRate` as the stream rendering speed, so it is not an independent pitch/rate control by itself ([W3C Web Audio API](https://www.w3.org/TR/webaudio-1.1/)). For high quality, use pitch-marked/PSOLA-style processing when a reliable voicing estimate exists, and fall back to WSOLA only for modest rate changes.

### D. The recorder only gates duration, RMS and clipping — **P1**

`inspectRecording` correctly rejects silence/very short takes and warns for quiet/clipped audio. It does not yet estimate noise floor/SNR, DC offset, speech activity, room echo, plosive risk, microphone consistency, or take-to-take loudness differences.

**Recommendation:** add an on-device “recording health” panel before a take can be used for a bank:

- duration, peak, clipped-sample count and DC offset;
- frame-based noise floor and estimated speech-to-noise ratio;
- active-speech percentage and long-silence detector;
- approximate integrated loudness/peak consistency between takes;
- a clear retake instruction, not an opaque score.

For controlled delivery, separate *recording capture targets* from *distribution loudness targets*. EBU R 128 is a useful export/mastering reference: it recommends average programme loudness of −23 LUFS and tracking loudness range and maximum true peak ([EBU R 128](https://tech.ebu.ch/publications/r128)). Do not normalize aggressively before unit extraction if it damages consonants or creates pumping; diagnose first and preserve the original source.

### E. Alignment needs more help and stronger review evidence — **P1**

The app intentionally makes even spacing only a starting point, which is honest. However, hand-labeling every phone remains the highest-friction and highest-error step. A checkbox alone cannot tell whether a boundary is near a stable point of a phone.

**Recommendation:** keep human confirmation but add non-generative local aids:

- waveform + spectrogram view, zoom, keyboard nudging and zero-crossing snap;
- suggested voiced/unvoiced regions and silence intervals;
- label duration outlier warnings (for example, a 5 ms vowel or a 900 ms stop);
- before/after context playback around a boundary;
- a revision history and per-segment confidence/quality note.

If the non-neural constraint is relaxed for authoring tools, forced alignment should still be presented as a *suggestion* and every automatic boundary should require review before it enters a bank.

### F. Text handling prevents realistic testing — **P1**

Custom banks deliberately reject numerals, symbols and unknown words. Failing safely is preferable to silently saying something wrong, but real narration needs a local text-normalization layer for dates, times, currency, ordinals, abbreviations and URLs. The present “spell it out” requirement also hides pronunciation failures during demos.

**Recommendation:** add deterministic English normalization with a preview of the exact expanded text and phonemes. Preserve manual pronunciation overrides. Add a test set for South African and global names only where users supply verified pronunciations; do not simulate an accent merely by changing a profile label.

### G. Preset naming must remain transparent — **P1 trust/product issue**

The repository correctly explains that the preset catalog is made from two packaged CMU ARCTIC bases (BDL and SLT) plus formant mode, and that the 60 items are delivery profiles rather than 60 independent arbitrary-text speakers. In the current implementation no preset sets `baseVoiceId`; `speakerForModel` falls back to BDL for masculine profiles and SLT for feminine profiles. `baseSampleId` is useful for separately auditioning a source clip, but it does not select that clip for new-text synthesis.

**Recommendation:** make the catalog’s base explicit on every card: **“BDL delivery profile,” “SLT delivery profile,” “formant synthesis,” or “your recorded bank.”** Rename the catalog filter from “Speaker Accent” to “Profile locale / intended pronunciation,” unless an actual accent-specific synthesis bank is installed. This avoids a preventable trust problem and makes quality comparisons meaningful.

### H. There is no quality regression gate — **P0**

The application has excellent functional tests but no fixed audio benchmark, blind listening record, objective artifact report, or release threshold. This means a new join rule can make speech worse while every automated test still passes.

**Recommendation:** add a versioned `quality-fixtures/` manifest (text only in Git; generated WAVs stored as release artifacts) and make a quality dashboard/release checklist mandatory. Section 5 gives a practical protocol.

### I. Unused/legacy surface should be removed or connected — **P2**

`SpeechStudio.tsx` and `PredefinedVoiceList.tsx` are not imported by the active app navigation. They include older “convert” and “real human speaker” wording that conflicts with the clearer current Voice Hub/README disclosure. Dead UI code creates maintenance risk and can be accidentally reintroduced.

**Recommendation:** either delete it after confirming no intended route depends on it, or refactor it to use the same source labels, recording workflow and consent language as the active product.

---

## 3. A practical voice-creation workflow

### Recommended recording setup for the present local-unit architecture

1. **Obtain explicit permission and state the intended use.** A browser checkbox is not a durable speaker release. Keep a consent record, recording date, allowed use, retention choice and revocation process with the project.
2. **Use one speaker, one microphone chain, one quiet, dry room.** Keep microphone distance, gain, posture and delivery consistent. Use a pop filter and listen for fan noise, room ring and plosives.
3. **Record dry, mono source material at a high capture quality** (for example 48 kHz/24-bit WAV when the device permits), then make Vocalis’s canonical 24 kHz/16-bit derivative for the current bank format. Keep the unmodified originals outside the public web bundle.
4. **Approve a small pilot set first.** Build a bank from 20–40 prompts, test it with unseen text, then fix the recording/labeling procedure before collecting hundreds of prompts.
5. **Record for coverage, not merely duration.** Include frequent and rare transitions, word/phrase-final phones, questions, statements, proper names, numbers/dates after text-normalization rules are ready, and target-domain terms.
6. **Take two or more usable candidates for fragile transitions.** Favor clean, natural takes over attempting to “repair” clipping or room echo with heavy processing.
7. **Review labels and listen to joins in context.** Do not approve evenly spaced labels unchanged. Every low-rated word should produce a targeted re-record or alignment task.
8. **Export the project and bank; retain a provenance manifest.** Keep rights, microphone, environment, script version and processing history separate from public source code.

The broader voice-recording advice from hosted voice-cloning products is still useful even though Vocalis is not a cloning product: clean one-speaker audio, stable microphone placement, no clipping, no background music/room echo, and consistent delivery materially improve the source. See [ElevenLabs’ recording guidance](https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning) for an industry example; adapt its capture advice, not its cloud-cloning workflow, to Vocalis.

---

## 4. Product routes: choose one deliberately

| Route | What it means | Realistic quality expectation | Decision needed |
| --- | --- | --- | --- |
| **A. Local recorded-unit Vocalis (recommended current route)** | Continue fully local/non-neural. Invest in corpus coverage, unit selection, alignment and prosody. | Characterful and controllable; can become much clearer and smoother, but quality will vary by text and corpus. | Maintain honest “experimental recorded-unit” positioning. |
| **B. Hybrid product** | Keep local bank authoring; offer an *opt-in* hosted neural rendering/export lane for users who need high-quality arbitrary text. | Modern neural TTS can substantially improve naturalness/expressiveness, but introduces cost, network, vendor, privacy and consent responsibilities. | Approve a policy change, backend architecture, AI disclosure, data retention and support model. |
| **C. Self-hosted neural product** | Run an approved model in the team’s infrastructure or on user hardware. | More control than a hosted API, but model evaluation, GPUs/latency, licensing, abuse prevention and updates become the team’s responsibility. | Fund ML/MLOps and security work; do not treat it as a browser-DSP task. |

A neural route must have explicit, revocable consent, output disclosure, speaker rights review, abuse controls and a deletion lifecycle. Do **not** add it silently beneath the existing “Zero AI” promise. If an external TTS service is used, the application must clearly disclose that generated speech is AI-generated; for example, OpenAI’s TTS guide explicitly requires a clear end-user disclosure ([OpenAI TTS guide](https://platform.openai.com/docs/guides/text-to-speech)).

---

## 5. Quality evaluation plan

### Build a stable benchmark first

Freeze 20–30 short test items before changing the engine. Include:

- plain statement and question; short and long sentence;
- /s/, /sh/, /ch/, /th/, voiced/unvoiced stop transitions and nasals;
- common diphthongs and phrase-final vowels;
- commas, semicolons, em dashes and quotation/dialogue;
- multisyllable stress and ambiguous names with user-approved pronunciations;
- numbers, currency, dates and abbreviations after normalization ships;
- actual customer/domain copy.

For each item, store text, expected normalized text, phoneme sequence, engine/bank version, settings, source candidate IDs, generated WAV hash, join-risk flags and listener results.

### Use two complementary measures

1. **Blind paired preference:** play baseline versus candidate in random order. Ask separately: “Which is easier to understand?” and “Which sounds smoother/more natural?” A/B preference is more sensitive than asking people to remember a previous version.
2. **Five-point listening ratings:** record *intelligibility/listening effort*, *join smoothness*, *prosody appropriateness*, *naturalness*, and, for a custom voice, *speaker resemblance* as separate questions. Do not reduce them to a single “good voice” score.

ITU-T P.800 defines standard five-point listening quality and listening-effort scales; P.808 documents crowd-friendly controls, including short tasks, screening and reporting confidence intervals ([P.800](https://www.itu.int/rec/dologin_pub.asp?lang=e&id=T-REC-P.800-199608-I%21%21EPB-E&type=items), [P.808](https://www.itu.int/epublications/publication/itu-t-p-808-2021-06-subjective-evaluation-of-speech-quality-with-a-crowdsourcing-approach)). Start with 8–12 internal listeners, randomized samples and headphones. Report listener count, sample count, mean, spread/confidence interval and the exact engine/bank commit. Use an external panel only after the internal procedure is stable.

### Release gates

Do not ship a synthesis algorithm change unless all are true:

- no regression in blind intelligibility preference;
- no increase in severe clicks, missing words, clipping or incorrect pronunciation on the frozen set;
- median smoothness and naturalness do not regress;
- failures are attached to concrete text/phone/join IDs, not vague comments;
- claims in the UI match the actual synthesis source.

Optional diagnostics can include an ASR word-error check against the intended text, F0/duration plots, peak/true-peak checks, and spectral discontinuity scores. These are triage tools, **not** replacements for listeners.

---

## 6. Prioritized implementation backlog

### Now — one or two short iterations

1. Correct/standardize source disclosure in all active and legacy UI surfaces.
2. Add recording-health metrics and clear retake guidance.
3. Add a quality-fixture manifest, generated-artifact procedure and blind A/B score sheet.
4. Add deterministic English number/date/currency expansion with visible preview and tests.
5. Make phone/diphone/triphone candidate coverage visible and generate “record next” prompts.

### Next — quality engine work

6. Persist unit features and recording-quality metadata.
7. Upgrade joins: zero crossing + equal-power fade, energy/F0/spectral continuity costs, global search.
8. Share bounded independent rate/pitch processing with user banks; disclose artifact risk.
9. Add phrase segmentation, lexical stress and simple rule-based intonation/duration targets.
10. Add spectrogram/zoom/nudge/quality warnings to the alignment editor.

### Later — scale and product choice

11. Corpus-prompt optimizer and bulk review tools.
12. Separate, licensed accent-specific banks and validated locale dictionaries rather than profile-label approximations.
13. A consent/revocation/provenance record suitable for commercial voice creation.
14. Only after an explicit policy decision: prototype, benchmark and govern a neural rendering lane.

---

## 7. Success definition

A better Vocalis release is not “more voices” or a higher WAV count. It is one where a consented speaker can record a predictable, well-guided corpus; the app explains coverage gaps before rendering; unseen text is intelligible without audible joins on the benchmark; pitch/rate controls do what their labels say; every synthesis source is truthfully identified; and a blind listener panel can demonstrate the improvement over the previous version.
