# Baseline voice: how we actually pick one

Status: proposal, nothing built yet.

## The problem with the last attempt

The agent (me) has no audio perception. I cannot listen to a render and tell you
whether it sounds like a person. Anything I say about timbre, warmth, or
naturalness is inference from documentation and third-party benchmarks.

So a voice I choose on your behalf is a guess with a confident tone of voice.
The only perceptual instrument in this loop is **your ears**. The protocol below
is built entirely around that constraint instead of pretending around it.

## A "baseline" is four things, not one

People conflate these, and then fail to fix anything because they tweak the wrong one:

1. **Engine** — the model/API that turns text into audio. Sets the quality ceiling.
   You cannot fix a weak engine by picking a better voice.
2. **Voice** — the specific timbre/accent/character. Sets the identity.
   You cannot fix an unconvincing voice by upgrading the engine.
3. **Reference script** — the fixed sentences every candidate renders, so
   comparisons are like-for-like instead of vibes.
4. **Gate** — the record of what was accepted (ID, version, hash, date), so the
   baseline cannot silently drift when someone bumps a dependency.

Pick in that order. Engine first, voice second, then freeze both.

## Step 1 — Fix the reference script

Every candidate renders the *same* six lines. Included because they break TTS:

1. Plain statement, ~15 words, no proper nouns. (baseline naturalness)
2. Numbers, currency, and a percentage: `R1 250,00` ... `8,5%`.
3. A date and a time: `4 November 2026, 14:30`.
4. South African proper nouns: `Gauteng`, `e-toll`, `Nkosi`, `Soweto`.
5. An acronym said as a word vs. spelled out: `SAA`, `NPO`, `VAT`.
6. A question with a long subordinate clause. (prosody, not just phonemes)

Line 6 is the one that separates engines. Flat engines read a question like a
statement, and that is the single most common "this is obviously a robot" cue.

## Step 2 — Blind bake-off

4 candidates, same script, labels hidden (A/B/C/D). Score each 1–5 on:

- **Naturalness** — would I believe a human said this?
- **Intelligibility** — did I catch every word without rewinding?
- **Accent fit** — does this sound like the audience, or like a call centre abroad?
- **Prosody** — does the question sound like a question?
- **Fatigue** — could I listen to 20 minutes of this?

Score blind, all listeners independent, then reveal. If two listeners disagree on
the winner, you have no baseline yet — you have a preference, and that is fine,
but write down whose preference it is.

## Step 3 — Freeze the winner

Once a voice wins, pin every part of it in config, not in someone's memory:

```
engine:    <name> <version>
voice_id:  <id>
script:    docs/reference-script.txt (sha256)
accepted:  2026-11-04
accepted_by: <human who listened>
```

`accepted_by` matters. It records that a person, not the agent, made the call.

## Step 4 — Regression gate

Any change to engine, model weights, or voice settings re-renders the script.
Diff the first three seconds against the frozen render. If it moved, someone
listens again before it ships. No new voice gets merged because a benchmark said
it was better — the benchmark nominates, the ear decides.

## What I can and cannot do here

- **Can:** generate candidate voices for you to A/B, render the script, build the
  comparison harness, wire the pinned config, run the diff.
- **Can:** narrow the engine shortlist using licences and published blind tests,
  and tell you honestly that those are someone else's ears.
- **Cannot:** listen to a render. Cannot dial a voice warmer, slower, or more
  local by describing it. I can only offer candidates, and you reject them.

That last line is the reason the loop has to be structured. Rejection is cheap.
Confident guessing is what cost us the last round.

## Shortlist for Vocalis (decided 2026-11-04)

Constraints from the product owner: read-aloud (fixed voices, not cloning),
must cover South African English and Afrikaans, commercial use.

| Engine | af-ZA | en-ZA | Licence | Verdict |
| --- | --- | --- | --- | --- |
| Azure Speech | Adri (F), Willem (M) | Leah (F) | commercial | **baseline candidate** |
| ElevenLabs | multilingual, coverage to verify | yes | commercial | challenger |
| Chatterbox | 23+ multilingual, verify af | yes | MIT | challenger, needs GPU |
| Kokoro-82M | no | yes | Apache 2.0 | **rejected**: no Afrikaans |
| XTTS v2 | yes | yes | CPML non-commercial | **rejected**: licence |
| Piper | unreliable | partial | MIT/GPL | fallback only |

Licence and coverage facts are checkable. Quality is not — that is what the
bake-off in Step 2 is for, and it is scored by ears, not by this table.
