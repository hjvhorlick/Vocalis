# Vocalis voice library — future specifications

**Status: planning only.** These ideas are saved for later and are not implemented as active voice choices. The current Vocalis catalog remains a small set of renamed personas using the two integrated CMU ARCTIC bases (BDL male US English and SLT female US English).

## Product direction

Offer a broad set of **descriptive roles**, not celebrity names or implied voice clones. A profile describes intended delivery and points to a licensed recorded-speech base; it is not a separate trained model. Personas should differ through recorded corpus selection, pronunciation rules, pitch/rhythm controls, and restrained signal processing. Do not claim a regional accent unless that accent has a suitable licensed recording corpus.

The role ideas below are inspired by the persona descriptions in [Scenering's voice preset catalogue](https://github.com/hjvhorlick/Scenering/blob/main/src/data/voice-presets.ts). They are a backlog, not a request to add all of them now.

## Planned persona ideas

| Group | Descriptive persona | Voice character | Intended use | Data requirement before activation |
| --- | --- | --- | --- | --- |
| Masculine | Warm Conversational | Relaxed, friendly, natural | Explainers, documentaries, stories | Keep the current BDL base; tune pace and phrase breaks |
| Masculine | Deep Cinematic Narrator | Low, measured, authoritative | Trailers, promos, motivation | BDL base; conservative pitch/rate processing |
| Masculine | British Distinguished | Precise, articulate, polished | History, luxury, academia | Add a licensed UK-English male corpus; US BDL alone is insufficient |
| Masculine | Australian Charismatic Presenter | Bright, crisp, friendly | Travel, technology, entertainment | Add a licensed Australian-English corpus |
| Masculine | Documentary Professional | Smooth, steady, informative | Guides, documentaries, education | BDL base; neutral delivery profile |
| Masculine | Measured Naturalist | Observant, calm, expressive | Nature and science narration | BDL base; slower pace and softer dynamics |
| Masculine | Powerful Baritone | Resonant, commanding | Cinematic openings, dramatic narration | BDL base; validate safe pitch-shift range |
| Masculine | Energetic Presenter | Punchy, quick, engaging | Promos, short video, explainers | BDL base; faster rate and brighter dynamics |
| Masculine | Irish Authority | Grounded, distinctive, assured | Stories and dramatic narration | Add a licensed Irish-English corpus |
| Masculine | Warm Storyteller | Deep, warm, unhurried | Long-form narration and brand films | BDL base; longer phrase timing |
| Feminine | Clear Conversational | Clear, friendly, engaging | Tutorials, reviews, guides | Keep the current SLT base; natural pace |
| Feminine | Bright Modern Presenter | Crisp, bright, dynamic | Short-form and technology | SLT base; faster pace and brighter EQ |
| Feminine | British Elegant Narrator | Polished, expressive, poised | Literature, podcasts, audiobooks | Add a licensed UK-English female corpus |
| Feminine | Australian Calm Guide | Gentle, soothing, resonant | Wellness and nature | Add a licensed Australian-English female corpus |
| Feminine | Peaceful Guide | Calm, balanced, melodic | Relaxation and reflection | SLT base; gentle rate and dynamics |
| Feminine | Warm Articulate Narrator | Witty, warm, precise | Intelligent explainers and audiobooks | SLT base; conversational rhythm |
| Feminine | Stately Narrator | Poised, refined, quietly authoritative | Prestige and history | Add/validate a suitable UK-English source before claiming that accent |
| Feminine | Velvet Sophisticate | Resonant, refined, contemplative | Art and culture | SLT base; careful EQ and slower phrasing |
| Feminine | Documentary Authority | Steady, grounded, assured | Science and investigations | SLT base; even, clear pacing |
| Feminine | Radiant Storyteller | Warm, lively, conversational | Vlogs and interviews | SLT base; light pitch/rate variation |

## Profile data contract

When these are implemented, each voice profile should declare:

- Stable profile ID and descriptive display name.
- Intended gender/register and **actual corpus speaker ID** used as its base.
- Accent/locale, source-corpus provenance, license URL, and attribution text.
- Voice traits (warmth, brightness, resonance, energy, breathiness), plus bounded pitch/rate/volume defaults.
- Recommended use and an original sample sentence.
- Which transformations are applied and which are only approximate.

Keep persona metadata separate from voice-pack assets. A voice pack should carry its speaker ID, sample rate, phoneme/diphone coverage, preprocessing/version information, license file, and attribution in its manifest. The UI should make the active corpus source discoverable through **Credits & licenses**.

## Build/quality gates

1. Add one accent corpus at a time; review the original license and keep the complete notices with the voice pack.
2. Use time-aligned recorded units and classical signal processing only. No neural speech generation, voice conversion, or voice cloning.
3. Test unseen text, phoneme coverage, transitions, numbers, punctuation, and custom pronunciation hints before publishing a profile.
4. Mark missing phoneme coverage as a fallback/approximation; do not label it as a native accent.
5. Keep large source recordings out of the main JavaScript bundle. Package a compact, reproducible unit bank and retain a build script and provenance manifest.
6. Do not add the backlog above to the active library until its corpus, attribution, and audio quality are verified.
