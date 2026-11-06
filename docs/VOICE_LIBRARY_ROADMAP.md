# Vocalis voice library — future specifications

**Status: planning only.** These ideas are saved for later and are not implemented as active voice choices. The current catalog uses descriptive presets over the mathematical formant voice by default. CMU ARCTIC BDL and SLT remain an explicitly experimental alternative, not the default engine.

## Product direction

Offer a broad set of **descriptive roles**, not celebrity names or implied voice clones. The default voice remains self-generating from pronunciation, phoneme timing, harmonic excitation, and formant parameters. Profiles may vary register, pitch, rhythm, pronunciation rules, and restrained signal processing; this does not create additional human identities or authentic regional accents.

A future recorded-speech profile must explicitly identify its licensed corpus/speaker and stay separate from the mathematical voice path. Persona descriptions must not imply a recorded voice when the profile is mathematically synthesized. Do not claim a regional accent unless supported by validated pronunciation rules or a suitable licensed recording corpus.

The role ideas below are inspired by the persona descriptions in [Scenering's voice preset catalogue](https://github.com/hjvhorlick/Scenering/blob/main/src/data/voice-presets.ts). They are a backlog, not a request to add all of them now.

## Planned persona ideas

| Group | Descriptive persona | Voice character | Intended use | Data requirement before activation |
| --- | --- | --- | --- | --- |
| Masculine | Warm Conversational | Relaxed, friendly, natural | Explainers, documentaries, stories | Tune mathematical prosody; if using BDL, clearly label the recorded base |
| Masculine | Deep Cinematic Narrator | Low, measured, authoritative | Trailers, promos, motivation | Bounded pitch/rate processing and listening review |
| Masculine | British Distinguished | Precise, articulate, polished | History, luxury, academia | Validate UK pronunciation rules or add a licensed UK-English male corpus |
| Masculine | Australian Charismatic Presenter | Bright, crisp, friendly | Travel, technology, entertainment | Validate Australian pronunciation or add licensed Australian-English corpus |
| Masculine | Documentary Professional | Smooth, steady, informative | Guides, documentaries, education | Measured mathematical prosody; any recorded base disclosed |
| Masculine | Measured Naturalist | Observant, calm, expressive | Nature and science narration | Tune phrase timing and dynamics |
| Masculine | Powerful Baritone | Resonant, commanding | Cinematic openings, dramatic narration | Validate safe, intelligible register range |
| Masculine | Energetic Presenter | Punchy, quick, engaging | Promos, short video, explainers | Tune stress, phrasing, and rate without implying a new speaker |
| Masculine | Irish Authority | Grounded, distinctive, assured | Stories and dramatic narration | Add/validate Irish pronunciation or obtain a licensed Irish-English corpus |
| Masculine | Warm Storyteller | Deep, warm, unhurried | Long-form narration and brand films | Tune mathematical phrasing; disclose any recorded base |
| Feminine | Clear Conversational | Clear, friendly, engaging | Tutorials, reviews, guides | Tune mathematical prosody; if using SLT, clearly label the recorded base |
| Feminine | Bright Modern Presenter | Crisp, bright, dynamic | Short-form and technology | Tune pace and spectral character |
| Feminine | British Elegant Narrator | Polished, expressive, poised | Literature, podcasts, audiobooks | Validate UK pronunciation or add licensed UK-English female corpus |
| Feminine | Australian Calm Guide | Gentle, soothing, resonant | Wellness and nature | Validate Australian pronunciation or add licensed Australian-English female corpus |
| Feminine | Peaceful Guide | Calm, balanced, melodic | Relaxation and reflection | Tune phrase timing and dynamics |
| Feminine | Warm Articulate Narrator | Witty, warm, precise | Intelligent explainers and audiobooks | Tune mathematical rhythm and stress |
| Feminine | Stately Narrator | Poised, refined, quietly authoritative | Prestige and history | Validate suitable UK pronunciation/source before making accent claims |
| Feminine | Velvet Sophisticate | Resonant, refined, contemplative | Art and culture | Tune formants and pacing within measured bounds |
| Feminine | Documentary Authority | Steady, grounded, assured | Science and investigations | Tune clarity and even pacing |
| Feminine | Radiant Storyteller | Warm, lively, conversational | Vlogs and interviews | Tune mathematical phrasing and dynamics |

## Profile data contract

When future profiles are implemented, each should declare:

- Stable profile ID and descriptive display name.
- Synthesis method: mathematical formant or identified recorded-unit source.
- Intended register, pronunciation locale, and clear statement of which traits are modeled or approximate.
- For recorded units only: actual corpus speaker ID, source-corpus provenance, license URL, and attribution text.
- Voice traits (warmth, brightness, resonance, energy), bounded pitch/rate/volume defaults, recommended use, and an original sample sentence.
- Which transformations are applied and which are only approximations.

Keep persona metadata separate from voice-pack assets. A voice pack should carry its speaker ID, sample rate, phoneme/diphone coverage, preprocessing/version information, license file, and attribution. The UI should make recorded sources discoverable through **Credits & licenses** and identify mathematical voices as synthetic.

## Build/quality gates

1. For recorded voices, add one accent corpus at a time; review the original license and keep the complete notices with the voice pack.
2. Keep the mathematical voice self-generating. No neural speech generation, voice conversion, voice cloning, Piper/ONNX voices, or cloud TTS.
3. Evaluate mathematical synthesis and recorded-unit synthesis separately. Test listening quality—not just successful builds or valid WAV files.
4. Test unseen text, stress, phoneme coverage, transitions, numbers, punctuation, and custom pronunciation hints before publishing a profile.
5. Mark missing coverage, accent rules, and transformed characteristics as approximations; do not label them as a native accent or a distinct human speaker.
6. Keep large source recordings out of the main JavaScript bundle. Package only compact, legally distributable units and retain a build script and provenance manifest.
7. Do not add the backlog above to the active library until its sourcing (if any), attribution, pronunciation, and audio quality are verified.
