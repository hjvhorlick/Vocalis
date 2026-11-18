# Original-library protection and real voice-creation plan

**Decision date:** 2026-11-18  
**Product rule:** keep the current personalities, names, profiles and original imported recordings unchanged. AI is permitted **only** when the user explicitly creates a new output voice file. It must not silently alter the original library or run as an undisclosed playback effect.

This plan replaces the earlier “choose a route” decision in `VOICE_QUALITY_AUDIT_2026-11-18.md`. Vocalis will have an immutable original library, a separate real-DSP variant workshop, and an explicit, consent-gated AI creation action.

---

## 1. Non-negotiable product contract

### 1.1 Original Voice Library — read-only

The first section of the application is the **Original Voice Library**.

- Keep every current personality, name, avatar, descriptive profile and source item exactly as it is.
- Original audio bytes are never overwritten, normalized, stretched, pitch shifted, formant shifted, resynthesized, denoised, or passed through an AI model.
- Every original asset carries a SHA-256 digest, source/provenance reference, original licence/notice, and import date.
- The user can play and download the original source exactly as imported.
- An “original” item is never removed because a variant tested badly. Only the derived candidate is rejected or deleted.
- Original playback is clearly labelled **Original recording — unprocessed**.

This means “keep original” is technical, not just visual: code must make originals immutable and must verify their file hash after import and before export.

### 1.2 Voice variants — a separate library

The **Voice Variants** section is a separate, non-destructive workspace.

- A variant has a parent original ID and parent audio hash; it is a new asset, not an edit to its parent.
- It stores a complete transformation recipe, engine/version, input hash, output hash, creation time, licence notices, quality warnings and listener ratings.
- A variant is always labelled **Derived from [original profile]** and never relabelled as the original voice or a newly recorded human.
- Rejecting a bad result deletes or archives only the variant and its rendered file. The original remains intact.
- Approved variants can be placed in the free library with their provenance and licence notices.

### 1.3 AI boundary — explicit create-file action only

AI may be used only when the user presses an explicit **Create voice file with AI** action.

- No AI runs when browsing originals, playing an original, editing a normal DSP control, or loading the app.
- AI never mutates an original asset and never replaces the original audio URL/hash.
- The user sees the input source, rights/consent status, requested script, model/provider version, intended use and output disclosure **before** the job starts.
- AI output is a new derived WAV/audio file and is saved in the Voice Variants library with its creation record.
- AI credentials remain server-side. No API secret is embedded in browser JavaScript, localStorage, project exports or source archives.
- AI output is visibly labelled **AI-created derived audio**. It cannot be called an original recording.
- Consent, deletion and revocation must block future jobs and remove accessible derived files where legally/technically possible.

This boundary permits AI for the user-approved creation step while preserving a completely untouched original collection.

---

## 2. A necessary technical distinction

A short imported recording can be used in two different, honest ways:

1. **Transform the recording itself.** Real DSP can make a different derived version of that exact clip. This is immediate, local and non-destructive, but it cannot speak new words.
2. **Create a new file from a new script.** A full voice engine must create that new audio. For a local concatenative engine it needs a real, sufficiently covered voice bank. For AI creation it needs a consented, licence-eligible reference and a server-side creation job.

A five- or ten-second source clip cannot truthfully become a high-quality arbitrary-text local voicebank by simple EQ, pitch shifting or by changing a profile name. The application must show this distinction instead of pretending that a sample clip can speak any text.

The current repository has two packaged arbitrary-text CMU unit packs (BDL and SLT). Many of the other source clips are suitable for original audition only unless the project obtains a legal, sufficiently large corpus and builds a real voice pack for that speaker. The existing CMU ARCTIC notice permits use/modification but requires notices to be retained and modifications to be marked. Every non-CMU source needs its own rights review before it is offered as an AI creation source or in a free derived library.

---

## 3. Real technology for the adaptation workshop

The workshop will use signal processing with measurable acoustic controls—not generic “AI style” labels and not fake sliders.

### 3.1 Controls and the real acoustic property they change

| User-facing control | Real parameter / process | What it can honestly change | Safety rule |
| --- | --- | --- | --- |
| **Pitch / vibration rate** | Fundamental frequency (F0), measured in Hz or semitones | Perceived high/low register while keeping duration stable | Process voiced frames only; retain unvoiced consonants; use moderate defaults. |
| **Pace** | Duration/time-scale modification | Speaking speed without deliberately changing pitch | Independent from pitch; do not use raw playback rate as the final tool. |
| **Vocal-tract size / formant shift** | Spectral-envelope/formant-frequency warp (F1–F3) | Perceived body, resonance and vowel colour | Use bounded per-frame transformation; never claim a new real speaker or accent. |
| **Warmth / brightness** | Spectral tilt and controlled low/high spectral balance | Timbre balance and perceived soft/bright quality | Explain that this is timbre shaping, not a new identity. |
| **Breathiness / clarity** | Aperiodicity/noise balance and spectral tilt | Amount of air/noise in voiced sound | Restrict range; preserve sibilants and intelligibility. |
| **Tension / force** | Glottal spectral slope, harmonicity and dynamic energy | Perceived vocal effort/firmness | Use only after source-filter analysis; a static distortion effect is not an acceptable substitute. |
| **Vibrato** | Small F0 modulation of voiced frames, with rate and depth | Controlled natural-style pitch movement | Apply only to held/voiced material; zero depth is the default for speech. |
| **Mix level** | Loudness normalization, limiter and final EQ | Delivery consistency | This is mastering, separate from voice identity. |

Pitch comes from vocal-fold vibration (F0), while formants are resonances of the vocal tract. They are different controls. A simple browser `playbackRate` changes duration and pitch together; a static peaking EQ boosts bands but does **not** reliably move a speaker’s formants. Those shortcuts are real effects, but they are not sufficient for the promised voice adaptation.

### 3.2 Engine choice: source-filter DSP / vocoder

The recommended adaptation engine is a browser-integrated WebAssembly build of a peer-reviewed source-filter speech-analysis/resynthesis system, evaluated before product integration.

A strong candidate is **WORLD**: it estimates F0, spectral envelope and aperiodicity, then resynthesizes speech from those parameters. Its upstream project describes it as a high-quality speech analysis, manipulation and synthesis system under a modified-BSD licence, with no patents claimed by its authors. See <https://github.com/mmorise/World>.

Proposed browser pipeline:

```text
original asset bytes (read only)
  -> decoded working copy
  -> WEB WORKER / WASM analysis
       F0 contour + voiced/unvoiced decision
       spectral envelope / formant information
       aperiodicity / noise information
  -> bounded parameter transformation
  -> WASM resynthesis to a new buffer
  -> local quality checks and A/B audition
  -> save a separate derived WAV + immutable recipe/provenance
```

This is real signal processing. It does not require an AI model to alter pitch, formants, tone, aperiodicity, pacing or vibrato. It also gives the application real meters for the parameters it exposes.

**Implementation rule:** first build a proof of concept with fixed, consented test clips and compare it against the unprocessed source. Adopt the engine only if listener tests show it is acceptable at the advertised control ranges. A vocoder can sound artificial when transformations are too large; it is a tool, not a guarantee of naturalness.

### 3.3 Quality protection in the DSP path

- Work from a decoded copy; do not modify the imported blob.
- Preserve original and derived sample rate/bit depth metadata.
- Use independent pitch and time changes; do not multiply `pitch × rate` into a single playback speed.
- Detect unvoiced frames and do not force pitch/vibrato onto fricatives, stops or silence.
- Use a 5–10 ms frame analysis with smoothing between frames to prevent zipper noise.
- Limit transformations to validated ranges at first; show an artefact-risk warning outside them.
- Test peak, clipping, duration, voiced-frame coverage and spectral discontinuities before export.
- Keep a one-click A/B toggle: Original versus Variant, level-matched.

---

## 4. AI-created voice-file workflow

AI is valuable for rendering a requested new script with more natural arbitrary-text speech than a short clip can support. It must be a deliberate, governed creation tool.

### 4.1 Eligibility before an AI job

The source must be one of:

- a user’s own voice with explicit recorded consent;
- a contributor’s voice with an explicit release covering AI-derived audio and the chosen free-library distribution; or
- a packaged source whose licence and performer permissions have been reviewed specifically for AI-derived use.

Do not treat possession of an audio file, a public recording, or a profile name as permission. A simple tick box is not adequate evidence for a public free-voice library; keep a consent/release record with permitted use, distribution terms, revision/revocation date and source hash.

### 4.2 User experience

1. User selects an eligible original or consented source.
2. User chooses **Create voice file with AI**.
3. The app displays the source identity, rights status, requested text, selected model, retention period, expected cost (if any), and an AI-output disclosure.
4. The user confirms the job.
5. The backend submits only the approved data to the approved provider/model.
6. The output returns as a **new candidate file**, never as a replacement for the original.
7. The user performs an A/B listening review and either approves, rejects, or deletes the candidate.
8. An approved candidate receives a provenance manifest and its applicable free-library licence/attribution.

### 4.3 What “AI only in creation” means in practice

- AI may create the final WAV/MP3 when the user asks for a new script.
- No AI runs continuously in playback or in the original-library browser.
- The application does not ship a hidden neural model in the frontend.
- The app should not claim that an AI-created file is a “voice pack” capable of unlimited local arbitrary-text synthesis unless it actually contains a legally distributable model/voicebank that performs that function.
- In the first release, deliver **approved rendered voice files**. Treat reusable AI voice models as a later feature requiring its own permission, storage, abuse-prevention and licensing design.

---

## 5. Data model and interface changes

### 5.1 Preserve profiles and add asset roles

Keep the existing `VoiceModelConfig` and personality data unchanged. Add an explicit asset layer instead of overloading profile fields.

```ts
type VoiceAssetRole = 'original' | 'dsp-variant' | 'ai-created-file' | 'recorded-unit-bank';

type VoiceAsset = {
  id: string;
  role: VoiceAssetRole;
  parentAssetId?: string;
  profileId: string;                 // personality/profile remains unchanged
  audioHash: string;
  sourceHash?: string;
  immutable: boolean;                // true for originals
  audio: Blob;
  sampleRate: number;
  licenceNotices: string[];
  provenance: {
    createdAt: string;
    engine: string;
    engineVersion: string;
    parameters?: Record<string, number | string | boolean>;
    aiDisclosure?: string;
    consentRecordId?: string;
  };
  review: { status: 'candidate' | 'approved' | 'rejected'; ratings: VoiceQualityRating[] };
};
```

Original asset records use `immutable: true`, have no transformation parameters, and cannot be updated through the variant editor. Derived assets always include their parent/source hashes.

### 5.2 Screens

1. **Original Voice Library** — existing personalities retained; original source audition/download only; no transform buttons in this section.
2. **Create Variant** — choose an original, copy it into a work session, use measured DSP controls, A/B compare, save a separately labelled candidate.
3. **Create voice file with AI** — separate consent-gated action and job status; no hidden fallback to DSP or AI.
4. **Review Queue** — user’s rating, notes, original-vs-variant playback, accept/reject/delete candidate.
5. **Free Voice Library** — only approved assets; manifests, source attribution, licence, original/derived/AI label and supported-use scope visible.

---

## 6. Delivery phases

### Phase 0 — protect the library first

- Make original source assets immutable in storage and UI.
- Add SHA-256 checks and original/derived asset roles.
- Ensure current source audition always plays source bytes with no DSP graph attached.
- Remove or disable any UI wording that implies originals are being converted during ordinary playback.
- Keep every personality/profile unchanged.

**Acceptance:** an original’s digest is identical before and after any number of variant or AI jobs.

### Phase 1 — honest review and variant lifecycle

- Add variant asset storage, provenance manifest, review state and delete/reject behaviour.
- Add level-matched original/variant A/B playback and user notes.
- Add controlled free-library export with attribution/notices.

**Acceptance:** rejecting a variant never removes or changes its original; every export identifies original versus derived.

### Phase 2 — real DSP proof of concept

- Integrate analysis in a worker/WASM proof of concept with F0, spectral envelope and aperiodicity meters.
- Implement independent pitch/time controls first, then bounded formant and spectral-tilt controls.
- Run blind listening tests on fixed clips to set safe ranges.

**Acceptance:** every exposed adaptation slider maps to a recorded acoustic parameter; user preference/intelligibility does not regress inside the safe range.

### Phase 3 — AI voice-file creation

- Select an approved provider/model only after a privacy, licence, cost and data-retention review.
- Build a server-side job API with consent gating, source allowlist, deletion/revocation and output disclosure.
- Store created file metadata/provenance, not provider credentials in the browser.

**Acceptance:** an ineligible source cannot submit an AI job; all output has a source/consent record and AI-created label; originals remain byte-identical.

### Phase 4 — build the free library responsibly

- Add only approved, licence-cleared originals and variants.
- Keep full notices and modification labels on all exports.
- Publish a versioned manifest and simple contributor/revocation policy.
- Add automated verification for hashes, notices and provenance before publishing.

**Acceptance:** every public file can be traced to its original asset, rights record and transformation/AI creation method.

---

## 7. User listening test is the release authority

The owner/listener will be the naturalness gate. Each candidate should be reviewed against its original at matched loudness and scored separately for:

- intelligibility;
- naturalness;
- absence of clicks/warble/metallic artefacts;
- tone/body fit;
- pitch stability and vibrato appropriateness;
- output loudness; and
- suitability for narration, video or a product voice file.

Use a simple state machine: **candidate → approved / rejected**. Do not replace an original because a candidate is preferred. Retain the original as the protected reference and keep the winning recipe so the variant can be reproduced exactly.

---

## 8. References for the technology choice

- **WORLD source-filter vocoder:** the upstream project states that it estimates F0, spectral envelope and aperiodicity, then performs speech synthesis; it is published under modified BSD. <https://github.com/mmorise/World>
- **TD-PSOLA plus source-filter transformation:** classic work separates prosodic modification from spectral-envelope transformation, allowing pitch/rate/intonation to be treated separately from vocal-tract characteristics. <https://researchportal.ip-paris.fr/en/publications/voice-tranformation-using-psola-technique-2/>
- **Real-time formant-preserving pitch modification:** phase-vocoder work explains why direct interpolation shifts both pitch and formant structure, and uses spectral-envelope analysis/restoration to preserve voice quality. <https://www.isca-archive.org/interspeech_2017/lenarczyk17_interspeech.pdf>
- **Formant analysis:** Praat’s Burg/LPC documentation explains a standard analysis path for frame-based formant estimation and the need for appropriate speaker-dependent settings. <https://www.fon.hum.uva.nl/praat/manual/Sound__To_Formant__burg____.html>
- **CMU ARCTIC source material:** the corpus was created for speech synthesis and distributed under a permissive BSD-style licence; the local packaged notice remains the operative distribution notice. <https://www.isca-archive.org/ssw_2004/kominek04b_ssw.html>

This architecture does not promise that every transformed file will be natural. It makes the process scientifically grounded, non-destructive, transparent, testable by the listener, and suitable for a genuinely free voice-library workflow.

---

## 9. Voice-consistent test-script contract

### Requirement

A test script must be generated **by the same voice definition and the same rendering recipe** that will generate the final file. An original source recording is a separate reference and must never be substituted as a misleading “test” of a generated script.

“Sounds the same” means the test and final files have the same speaker/variant identity, adaptation settings and delivery treatment. The spoken words will naturally have different pitch contours and durations, but the application must not quietly switch to another base voice, a generic sample, a different AI voice ID, or a different room effect.

### One renderer for every output

All script-producing paths must call one versioned render contract:

```ts
type VoiceRenderRequest = {
  text: string;
  voiceDefinitionId: string; // original source pack, DSP variant, or approved AI voice definition
  voiceRecipeId: string;     // pinned DSP settings/version, if applicable
  environmentId: string;     // Dry Reference or a pinned room preset/version
  environmentRecipeId: string;
  outputFormat: 'wav';
};
```

The same `VoiceRenderRequest` path must be used for:

- card audition;
- the Voice Hub **Listen** button;
- the Voice Hub WAV export;
- Voice Creator audition/export;
- Dialogue Studio playback/export;
- the fixed validation test script; and
- a final video/narration script.

A render manifest accompanies every file with the voice-definition ID, source/variant hash, renderer version, parameters, room preset/impulse-response hash, text hash and output hash.

### Creation and validation flow

1. Create or choose a voice definition.
2. Render the fixed **Voice Validation Script** with that exact definition in **Dry Reference** mode.
3. Render the same script with each desired room environment.
4. The listener approves or rejects the voice definition and each room treatment separately.
5. Lock the approved definition/recipe version.
6. All final scripts use that locked definition. A change to voice, DSP parameters, AI model/voice ID, or room preset creates a new candidate version and requires another test.

For an AI-created reusable voice, this requires a persistent provider/custom voice definition ID, model version and approved source record. A one-off AI WAV can be tested only as that one file; it cannot honestly promise that a different script will use the same voice. The UI must make that limitation explicit.

### Automated regression tests

Add tests that assert the following:

- audition, export and dialogue submit the same selected `voiceDefinitionId` and recipe for the same text;
- the original-audition button remains a separate source-only playback route;
- a final render cannot use a missing or different test-approved voice definition;
- a room render cannot accidentally become the dry reference;
- manifests preserve the parent/original hash and the room/voice recipe IDs.

---

## 10. Room Environment Studio

Room acoustics are an output environment, not a change to the protected original voice or its identity. The Room Environment Studio therefore sits **after** the selected voice renderer:

```text
protected original (reference only, dry, untouched)

selected voice definition -> voice adaptation recipe -> dry voice render
                                              -> room environment / mix -> delivered WAV
```

An original-library audition bypasses the entire room and DSP chain. A voice test first uses **Dry Reference** so that voice quality can be judged without room coloration. The same test may then be rendered with a selected room preset when the intended delivery requires it.

### 10.1 Real room technology

The preferred room engine is convolution reverb. It convolves dry voice audio with a **room impulse response (IR)**: a measured or physically modelled record of how sound travels from a source to a microphone/listening position in a space. Early reflections, frequency-dependent decay and the late reverb tail are then properties of the selected environment rather than a fake “room” label.

There are two honest preset kinds:

1. **Measured Room** — uses a licensed, documented impulse response captured in a real named/anonymous space. Its preset displays IR source, licence, sample rate, source/listener geometry where known, RT60 measurements, and the IR hash.
2. **Modelled Room** — uses a deterministic room/acoustic model built from declared dimensions, material absorption, source distance and listener position. It is labelled *modelled*, not recorded in a real room.

Never call an exponentially decaying noise effect a specific real room. It can be a useful modelled reverb, but it must be labelled correctly.

### 10.2 Room controls based on sound requirements

| Control | Acoustic meaning | Example user need |
| --- | --- | --- |
| **Room type / IR** | Defines the actual measured or modelled reflections | “Small untreated office”, “narration booth”, “large hall”. |
| **Source distance** | Direct-to-reverberant balance, early reflection strength and high-frequency loss | Close voice-over versus distant on-camera dialogue. |
| **Listener position** | Selects a location-specific IR where available | Front row, middle room, back of hall. |
| **Pre-delay** | Time before early reflections/reverb reach the listener | Preserve speech clarity while adding space. |
| **RT60 / decay** | Time required for room energy to fall by 60 dB | Short dry booth versus long hall. |
| **Early / late reflection mix** | Separates intimacy/localisation from spaciousness | Natural interior dialogue versus cinematic ambience. |
| **Wet/dry level** | Delivered environmental amount | Narration clarity versus a scene’s realism. |
| **Stereo position** | Placement in the delivered stereo scene | Screen placement or dialogue staging. |
| **Output loudness ceiling** | Final delivery safety, independent of the room sound | Video/export conformity without clipping. |

Initial delivery presets should be purpose-based and clearly described: **Dry Reference**, **Treated Narration Booth**, **Close Podcast Studio**, **Small Room**, **Office / Meeting Room**, **Living Room**, **Classroom**, **Theatre / Hall**, and **Large Reverberant Space**. “Telephone”, “radio”, and “cinematic EQ” are device/mix profiles rather than rooms and should remain separate effects.

### 10.3 Room creation workflow

1. Choose a licensed measured IR or create a declared modelled room.
2. Set source/listener position and wet/dry mix.
3. Render the fixed test script with the approved voice definition and that room recipe.
4. A/B compare against **Dry Reference** at matched loudness.
5. Approve/reject the environment independently from the voice.
6. Save a versioned `RoomEnvironment` record with its IR/model parameters, hashes and output settings.

A real room can be measured for the library using an exponential sine sweep played through a speaker and recorded at the intended microphone position; the deconvolved response becomes the room IR. This creates a reproducible, licence-owned room asset when the team has permission to measure the venue.

### 10.4 Testing and safety rules

- Room profiles never alter an original asset; they render a new delivered file from a dry working copy.
- Do not bake a room into a reusable **voice identity**. Keep the voice recipe and room recipe independently selectable.
- Test intelligibility before and after room treatment; reject a room setting that masks consonants or makes narration tiring.
- Include room ID, preset version, IR/model hash, wet/dry amount, source/listener setting and output loudness in every export manifest.
- Keep a zero-room **Dry Reference** option permanently available.

---

## 11. Additional references for room rendering and consistency

- **Room impulse response and convolution:** measured room impulse responses can be convolved with dry audio to place that audio in the measured acoustic space. <http://arqen.com/acoustics/surround-sound-impulse-response/>
- **Browser convolution support:** a Web Audio `ConvolverNode` receives an impulse-response buffer and applies it as a reverb effect. <https://docs.w3cub.com/dom/convolvernode/buffer.html>
- **Voice consistency evaluation:** compare the same voice across multiple fixed scripts and keep intelligibility, naturalness, identity, stability and artefacts as separate review dimensions. <https://github.com/IsaacFLZA/voice-similarity-eval>
