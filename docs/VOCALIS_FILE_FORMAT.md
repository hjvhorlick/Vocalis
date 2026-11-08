# The `.vls` voice file

One voice, one file, Vocalis only.

A voice in this project is two things: a unit index and a block of recorded
samples. Kept as a folder of `manifest.json` + `diphones.bin` that pair is readable
by anything — a sample editor opens the bin, any other diphone engine can use the
pair, and nothing about the file says where it came from. The `.vls` container
seals the two together into a single file that this application opens and nothing
else does, without touching the audio.

* **Lossless by construction.** The payload *is* the original 16-bit PCM. Sealing is
  a container, not a codec: no resampling, no re-quantisation, no normalisation, no
  extra generation loss. A voice heard from a `.vls` file is bit-identical to
  the pack it was made from, and `tests/vocalisFile.test.ts` asserts exactly that
  with `Buffer.equals`.
* **One file.** Export gives you `arctic-awb.vls`; import takes that file and
  nothing else. No sidecar JSON to lose, no folder to zip.
* **Integrity before audio.** Every byte is covered by AES-GCM and a SHA-256 digest,
  so a truncated download or a single flipped bit is caught before a sample is used,
  and the message says which it was.
* **The licence travels inside.** The header still names the source, the licence and
  the attribution in the clear, because a sealed file that has forgotten where the
  recordings came from is worse than no file at all.

## Layout

```
offset  size          field
     0     8          magic "VOCALIS\0"
     8     1          file version (1)
     9     1          flags: bit 0 = sealed payload
    10     2          reserved, zero
    12     4          header length, uint32 little-endian
    16     n          header, UTF-8 JSON
16+n      m          payload: AES-256-GCM ciphertext
16+n+m    16          GCM authentication tag
```

The header is readable without the key — that is deliberate, so the library can show
what a file is before installing it:

```json
{
  "format": "vocalis",
  "version": 1,
  "createdAt": "2026-11-07T22:08:11.982Z",
  "id": "cmu-kal",
  "displayName": "CMU KAL (diphone)",
  "language": "English",
  "accent": "US English",
  "gender": "Male",
  "sampleRate": 16000,
  "encoding": "pcm-s16le",
  "unitCount": 1578,
  "durationSeconds": 219.8,
  "payloadBytes": 7099339,
  "payloadSha256": "…",
  "licence": { "name": "CSTR / University of Edinburgh diphone database terms" },
  "provenance": { "sourceProject": "CMU KAL diphone database" },
  "crypto": { "cipher": "AES-256-GCM", "kdf": "HKDF-SHA256", "salt": "…", "iv": "…" }
}
```

The sealed payload is a second, tiny container — `uint32LE manifestLength`, the
diphone manifest JSON, then the samples — so the unit table is hidden along with the
audio.

Keys: `HKDF-SHA256(application key, per-file 16-byte salt, info = "vocalis-voice-v1|<id>")`
→ a 256-bit AES-GCM key. The voice id is part of the derivation, so a payload cannot
be moved into another voice's file and opened; the test renames a header and the file
refuses to open.

## What this is not

The application key ships inside Vocalis, because a player must be able to decode
what it plays. The container therefore stops the file being *used* anywhere else —
a sample editor, a WAV player, `jq`, another synthesiser, a search engine — and makes
silent tampering impossible. It does not stop someone who runs this application and
instruments it. Treat `.vls` as a sealed container with provenance, not as DRM
that outlives the app, and say so in any marketplace copy rather than overclaiming.

## The creator page, and the switch block

The `.vls Voice Creator` tab is where a file is made: the recorded voices are cards you can
reorder, **all eight settings** each have a switch on the same line as their control —
Pace, Volume, Warmth, Clarity, Air, the Tone character, Intonation (the phrase contour,
which re-pitches every unit onto one line) and Join levels — and the export sits
on the same page.

There is no pitch setting, on purpose. A recorded voice keeps the pitch its speaker
actually used, and no control in the application can move it: the pitch stage was
removed from the render pipeline rather than switched off, so there is no code path in
which a pitch value could do anything. Apart from that, there is no control on that
page that cannot be switched off, which is the only way to find out which one a
particular voice file does not want. Each row's **A/B** button plays the sentence once with
the setting as set and once with it bypassed, so "which one is spoiling it?" is
answered by listening to the difference. The Spoken Word page has no sliders and no switches at all: it plays the card you
pick exactly as its file was sealed, and offers nothing to change. The
settings block is the part that ends up in the file:

```json
"profile": {
  "enabled":  { "rate": true, "volume": true, "tone": false,
                "throatWarmth": false, "oralClarity": true, "airPresence": false,
                "contour": false, "joinLevel": false },
  "settings": { "rate": 0.92, "volume": 1, "throatWarmth": 0,
                "oralClarity": 0.2, "airPresence": 0 },
  "tone": "deep"
}
```

Older files may still carry `pitch` in `enabled` or `settings`. It is read and
discarded on import, so an old file opens at the speaker's recorded pitch rather than
failing or quietly speaking higher.

A session starts with every switch off and every knob at the value that changes
nothing, so the first preview is the recording exactly as it was captured. Turning one
switch on is then the only processing in the chain — which is what makes "is it the
pace or the tone?" a question with an answer. Selecting a different voice resets the
switches, so no setting follows a voice it was not chosen for.

A switch is a bypass, not a neutral value: `enabled: {"clarity": false}` means the
clarity filter was not run at all. That distinction is measured, not asserted —
`tests/bypass.test.ts` renders with every stage bypassed and requires the samples to
come back bit-identical to the recording, and separately requires each stage to change
the audio when it is on.

`enabled` records what was switched **on at the time of export**, and `settings` the
knob positions that were live. A switched-off feature is stored as off, not as a
neutral number, so "export it again without Clarity" is a decision the file itself
carries rather than something the listener has to remember. On install, the profile
is applied to the voice when it is selected, so an exported voice sounds like the one
that was auditioned.

`POST /api/voices/<id>/export` takes `{ "name": "My Radio Voice #2", "profile": … }`:

* the name becomes the file's display name, and its slug becomes the voice id —
  `my-radio-voice-2` — so the installed copy is addressable and can be re-exported;
* the samples are still the source pack's, byte for byte; the profile rides in the
  header and never touches the audio;
* `GET` on the same route still exports under the source voice's own id with no
  profile, which is what the library card's Export button uses.

## Using it

Export an installed voice from the library card (**Export**), or from a terminal:

```sh
npm run voices -- pack cmu-kal --out ~/Desktop/cmu-kal.vls
```

The CLI prints what it sealed, which is also what the file header says:

```
✓ cmu-kal → /home/you/Desktop/cmu-kal.vls  (6.8 MB, 1578 units, 219.8 s at 16000 Hz, sealed)
```

Install a `.vls` file on any machine running Vocalis:

```sh
npm run voices -- import ~/Desktop/cmu-kal.vls
npm run voices -- verify cmu-kal
```

`import` copies the file as it stands into `public/optional-voices/<id>/voice.vls`
— it does **not** unpack the manifest and audio beside it, so an imported voice stays
sealed on disk. `verify` renders a sentence from it through the same loader the
browser uses, which is how the round trip is checked rather than assumed.

The HTTP route behind the Export button is `GET /api/voices/<id>/export`; it answers
with `Content-Type: application/vnd.vocalis.voice`, a download filename, and the
sealed bytes. Protected base voices (`slt`, `bdl`) and traversal attempts are refused
with a 400, before any file is read.

## Compatibility

Both shapes are accepted for installed voices: a pack directory may hold either
`voice.vls` or the original `manifest.json` + `diphones.bin` pair, and the older
`voice.vocalis` name is still read so files written before the rename keep working. The loader
tries the sealed file first, so the six packs shipped in this repository keep working
and anything imported as `.vls` works too. The format is versioned in two places
(byte 8 and the header); a file that disagrees with itself is refused as corrupt
rather than opened on a guess.

## Files

| File | What it is |
|---|---|
| `src/utils/vocalisVoiceFile.ts` | the format: encode, decode, header read, typed errors |
| `tests/vocalisFile.test.ts` | 53 checks — quality, exclusivity, integrity, CLI and browser round trips |
| `scripts/voice_library.ts` | `pack` and `import`, and the shared pack loader |
| `server.ts` | `GET /api/voices/<id>/export` |
| `src/components/RecordedVoiceLibrary.tsx` | the Export control on an installed card |
| `src/components/VoiceFileCreator.tsx` | the creator page: cards, switches, naming, export |
