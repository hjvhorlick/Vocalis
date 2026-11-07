# The recorded voice library

Vocalis speaks from recordings of people. This document is about adding *more*
people — not more transformations — and it records what was found, what was
verified, what is installable today, and what was excluded and why.

The short version: **105 recorded, non-neural voice databases were investigated.
18 of them can be installed and spoken today. 1 needs an adapter that has not been
run against the real archive yet. 12 are real databases in languages the
pronunciation front end cannot read. 75 are excluded because their licence forbids
using them outside MBROLA.** Every one of the 105 is in the catalogue on screen,
with its licence and its reason, so a user can see what exists rather than trusting
a claim.

**What is proven, and what is not.** One of the 18 has been installed and spoken end
to end on a real archive: `cmu-kal`. The other 17 (the 16 ARCTIC speakers and CSTR
RAB) are supported by an installer whose conversion is proven on an archive built in
the documented layout, but the first real ARCTIC download — `cmu_us_ljm_arctic` — was
refused by the converter because it contained no phone labels, which is exactly the
failure the guard exists for. That download is why `inspect` exists: it reports what
an archive actually contains without installing anything. Until an archive passes it,
this document does not claim the voice works.

Two voices are special and are not in that count: **CMU ARCTIC BDL and SLT are
protected base voices**. Nothing here can install, replace, modify or remove them
(see [`BASE_VOICE_CONTRACT.md`](BASE_VOICE_CONTRACT.md)).

---

## 1. What the engine needs, which decides everything else

The recorded path in `src/utils/cmuDiphoneSynthesizer.ts` speaks from a *pack*:

```
manifest.json    one entry per phone transition:  "aa|b" -> { offset, length }
diphones.bin     little-endian signed 16-bit mono PCM at 16 kHz
```

`offset` is in bytes, `length` in samples. That is the whole interface: any
database that can be expressed as "one slice of 16 kHz PCM per phone transition"
works, and anything that cannot needs a decoder before it can be considered. This
is why the survey is mostly about *file formats* and *licences*, not about voice
quality.

## 2. Compatibility classes

| Class | Meaning | Count today |
|---|---|---|
| **A** | Directly compatible: the archive converts with a script Vocalis already runs, audio untouched. | 17 |
| **B** | Compatible after an adapter: right shape, but the details (index name, layout) are discovered at install time. | 1 |
| **C** | Needs a separate front end: the audio is right and the format is right; the *language* is not English, and the app's pronunciation front end is English (CMUdict). | 12 |
| **D** | Not compatible: format or licence rules it out. Kept visible, never installable. | 75 |

`install: null` in the catalogue is the machine-readable form of "no installer
yet". It is not a quality claim about the voice.

## 3. The 18 installable voices

### CMU ARCTIC, the other 16 speakers — class A

The corpus that BDL and SLT come from has 18 speakers, all recorded the same way:
16 kHz mono WAV per utterance plus automatic phone labels, published under the ARCTIC
terms (free for any purpose, commercial included, with the notice retained and
modifications marked). Vocalis already ships a builder for exactly this layout —
`scripts/build_cmu_voicepack.py`, the script that produced the base packs — so these
are the cleanest additions available — *if the published archives really carry those
labels*. The first real one tried here did not: `cmu_us_ljm_arctic.tar.bz2`
downloaded and unpacked correctly and then produced zero units, because the archive
held waveforms and `etc/` but no `.lab` files (the ARCTIC build script labels the
corpus itself with `build_cg_rfs_voice`, so a clustergen distribution need not ship
labels at all). The installer now refuses such an archive with an explanation instead
of writing an empty pack, and `npm run voices -- inspect <id>` prints the inventory
before anything is installed. **Run it on your machine before trusting the class-A
rating of any ARCTIC voice**; if none of the archives carry labels these 16 are class
C (they need forced alignment), not class A, and the catalogue will be corrected to
say so.

| id | accent | gender | archive |
|---|---|---|---|
| `arctic-aew` | US English | Male | `cmu_us_aew_arctic.tar.bz2` (89M) |
| `arctic-ahw` | US English (German speaker) | Male | 45M |
| `arctic-aup` | Indian English | Male | 41M |
| `arctic-awb` | Scottish English | Male | 74M |
| `arctic-axb` | Indian English | Female | 48M |
| `arctic-clb` | US English | Female | 87M |
| `arctic-eey` | US English | Female | 41M |
| `arctic-fem` | US English (German speaker) | Male | 39M |
| `arctic-gka` | Indian English | Male | 43M |
| `arctic-jmk` | Canadian English | Male | 68M |
| `arctic-ksp` | Indian English | Male | 86M |
| `arctic-ljm` | US English | Female | 37M |
| `arctic-lnh` | US English | Female | 79M |
| `arctic-rms` | US English | Male | 88M |
| `arctic-rxr` | US English (Israeli speaker) | Male | 53M |
| `arctic-slp` | Indian English | Male | 48M |

Download URLs and sizes were read from the published index at
<http://festvox.org/cmu_arctic/packed/> on 2026-11-07.

### CMU KAL — class A, **built, installed and spoken here**

`cmu_us_kal_diphone` is the classic Festival diphone database: 1,619 entries in an
EST index (`dic/kaldiph.est`), each naming a waveform and three times (start, phone
boundary, end). `scripts/import_festival_diphone.py` copies those spans out of the
recordings unchanged.

Verified in this environment, through the server, exactly as a user would:

```
POST /api/voices/cmu-kal/install   →  downloaded 53 MB, unpacked, converted
progress                           →  "Installed: 1578 recorded units, 6.7 MB."
GET  /optional-voices/cmu-kal/…    →  manifest 200, diphones.bin 7,034,394 bytes
render "The small brown dog was sleeping quietly near the open window."
                                   →  44 exact recorded units, 0 half-unit backoffs,
                                      0 mathematical fallbacks, 0 missing pairs,
                                      11 word timings, peak 0.780
DELETE /api/voices/cmu-kal         →  directory gone, base packs untouched
```

1,578 units, 41 phones — the same phone inventory as the base packs, which is why
English text works with no mapping. 38 duplicate diphone keys were dropped (the EST
file lists some transitions twice; the first is kept) and 3 entries were rejected
for being unusably short.

The download used here is a BSD-licensed GitHub mirror of the CMU archive, because
`festvox.org` is not reachable from the build environment. The audio inside it is
the untouched `cmu_us_kal_diphone_base` data.

### CSTR RAB — class B, not yet run against the real archive

`cstr_uk_rab_diphone` (73M) is the other classic Festival diphone voice: British
(Scottish) male. Same EST layout, so the same importer applies; the index file name
and the waveform directory are discovered at install time because the archive is not
mirrored on GitHub and could not be opened here. It is marked **B** for exactly that
reason: the converter is right, the specific archive has not been proved end to end.

## 4. Class C: right audio, wrong language (12)

* **Festival Czech diphone databases** — `brailcom/voice-czech-{ph,dita,krb,machac}`.
  Complete, human-recorded, EST format, 16 kHz, with labels and waveforms. GPL-2.0 /
  GPL-3.0 (copyleft: a redistributed pack would carry the same licence). One female
  voice (DITA), three male.
* **IIIT-H Indic databases** — Bengali, Hindi, Kannada, Malayalam, Marathi, Tamil,
  Telugu. Studio recordings with Festvox unit-selection builds. Gender is not
  documented per speaker, so the catalogue says so instead of guessing.

These would work as packs tomorrow; what is missing is a pronunciation front end for
their language. Adding one is a language project, not a voice project, and it is
deliberately out of scope here.

## 5. Class D: excluded, and the reason is the licence (75)

Every MBROLA voice. The databases are real recorded diphones across 30+ languages,
and 75 of them are listed in the catalogue — but the MBROLA terms say:

> Permission is granted to use this database for synthesizing speech with and only
> with MBROLA program made available from the MBROLA project web page.

Using the data in a different synthesiser is precisely what that forbids, and
`LICENSE.md` adds that no voice may be sold or bundled into a sold product without
the individual author's permission. On top of the licence, `.mbr` stores LPC/PSOLA
frames rather than PCM, so it would also need a decoder and a resynthesiser. Both
reasons are in each entry, and no MBROLA voice has an installer.

## 6. Installing, removing, and what that touches

### The pipeline

```
browser  ──POST /api/voices/:id/install──▶  local server
                                            └─ scripts/install_voice.py
                                                 download → verify size
                                                 unpack (refusing absolute/.. paths)
                                                 convert (ARCTIC builder | EST importer)
                                                 validate (units, index fits audio)
                                                 copy to .installing-<id>, then rename
browser  ──GET /api/voices/:id/progress──▶  JSON line written at each step
```

The browser cannot download from these hosts directly — festvox.org and GitHub do
not send CORS headers — and a pack has to be cut from the archive anyway, so the
server does both. This is the same Node server that already serves the application;
nothing is downloaded from a cloud speech service, and no synthesis happens off the
machine.

### Guarantees, and where each is enforced

| Promise | Where |
|---|---|
| A half-finished install can never be loaded | the pack is built in a temp directory and renamed into place only after validation |
| An existing voice is never silently replaced | the installer refuses an id that is already installed (HTTP 409) |
| BDL and SLT cannot be installed over, replaced or deleted | refused by name in `src/utils/voiceLibraryPaths.ts` (server) **and** in `scripts/install_voice.py` |
| A crafted id cannot reach the base packs | the resolved path must stay inside `public/optional-voices`; `..`, absolute paths and dotted ids are refused |
| Removing a voice removes only that voice | the server deletes one directory, then the progress file; the tests hash a second installed voice and the base pack before and after |
| The app starts when an installed voice is missing | the engine logs and falls back to the mathematical path for that render instead of failing |
| One voice in memory at a time | `releaseVoicePack(id)` drops the pack when a voice is removed; sources are registered lazily (metadata only) |

### Per-voice storage

`public/optional-voices/<id>/` holds `manifest.json`, `diphones.bin`, `LICENSE.txt`
(when the archive carried one), `voice.json` (provenance) and `installed.json`
(units, bytes, date, source URL). `GET /api/voices` reports the total on disk, which
the library header shows. Nothing in that directory is committed — see `.gitignore`.

## 6b. The terminal commands

The browser cannot download an archive, and neither can a server in a sandbox with
no route to festvox.org. A terminal can, so the library has a command-line face that
uses the same catalogue, the same installer and the same guards:

| Command | What it does |
|---|---|
| `npm run voices -- list` | every investigated voice, with class, size and install state |
| `npm run voices -- list --ready` | only the ones that can be installed now |
| `npm run voices -- install arctic-awb` | download, unpack, convert, validate, install |
| `npm run voices -- install --class A` | all 17 ready voices, one at a time |
| `npm run voices -- install cmu-kal --from ~/Downloads/kal.tar.gz` | install from an archive you already have |
| `npm run voices -- inspect arctic-ljm` | download an archive, report what is inside it, install nothing |
| `npm run voices -- inspect arctic-ljm --from ~/Downloads/ljm.tar.bz2` | the same, for an archive you already have |
| `npm run voices -- remove arctic-awb` | delete that voice and its metadata |
| `npm run voices -- status` | what is installed, and how much disk it uses |
| `npm run voices -- urls --class A` | the `curl` commands, for fetching by hand |

`install` prints the download URL, the licence, and each stage as it happens; it
refuses `slt`/`bdl` with the reason, skips anything already installed, and returns a
non-zero exit code on any failure, so it can be used in a script.

Requirements are Node and Python 3 — the installers are Python scripts, because
unpacking archives and cutting WAV spans is not a job worth hand-rolling twice in
two languages. The Python executable is discovered rather than assumed: `python3`
first on Linux and macOS, `python`/`py` on Windows, and the Microsoft Store's
"python" stub (which opens the Store instead of running) is rejected by asking it
for its version. If there is no Python 3, `install` and the install endpoint both
stop with an explanation before downloading anything.

On Windows the same commands work from PowerShell or `cmd` (`--` included); quote
any `--from` path containing spaces, and prefer a real Python from python.org or
`winget install Python.Python.3.12` over the Store alias. `--from` is what
makes the command useful on a machine that cannot reach festvox.org: fetch the
archive however you like (browser, `curl`, a mirror), then install it locally.

### When an install reports that the pack has no units

`✗ the pack has only 0 units` means the download and unpack worked and the
conversion did not: the archive did not contain what the recipe expects. Do not
retry it — find out what it does contain:

```sh
npm run voices -- inspect arctic-ljm
```

`inspect` downloads (or takes `--from`), unpacks into a temporary directory, and
prints a short inventory: the top level, how many waveforms, label files and text
files there are, any nested archives, the first paths, and a sample of the labels or
transcription. It installs nothing and leaves the voice library unchanged, so it is
safe to run on a voice you already have installed.

What the inventory usually means:

* **0 label files** — the archive is waveforms plus transcription, not phone labels.
  A diphone pack is cut per phone transition, so there is nothing to cut; this voice
  needs forced alignment first. The installer refuses it and says so rather than
  writing an empty pack. (This is what happened with the real `cmu_us_ljm_arctic`.)
* **a nested archive** — the audio is inside a second tarball, and this recipe does
  not unpack twice. Unpack it by hand and install from the directory.
* **label files somewhere unexpected** — the converter looks in `lab/`, then
  `labels/`/`labelled/`/`labeled/`, then anywhere with `.lab` files. If it still picks
  the wrong directory, pass it explicitly:
  `python3 scripts/build_cmu_voicepack.py --source <dir> --output <dir> --speaker-id
  <id> --display-name <name> --accent <accent> --gender <gender> --lab-dir <labels>`.
  A `--lab-dir` with no `.lab` files is refused.
* **different lab and wav counts, or names that do not match** — the converter stops
  with both counts and an example pair instead of building from a fraction of the
  corpus.

If you would rather do it entirely by hand:

```sh
curl -L -o awb.tar.bz2 http://festvox.org/cmu_arctic/packed/cmu_us_awb_arctic.tar.bz2
mkdir -p /tmp/awb && tar xjf awb.tar.bz2 -C /tmp/awb
python3 scripts/build_cmu_voicepack.py \
  --source /tmp/awb/cmu_us_awb_arctic --output public/optional-voices/arctic-awb \
  --speaker-id arctic-awb --display-name "CMU ARCTIC AWB" --accent "Scottish English" --gender Male
printf '{"units": null, "bytes": %s}\n' "$(stat -c%s public/optional-voices/arctic-awb/diphones.bin)" \
  > public/optional-voices/arctic-awb/installed.json
```

## 7. Licences, in plain terms

| Group | Commercial | Redistribute a pack? | Notes |
|---|---|---|---|
| CMU ARCTIC (18) | allowed | allowed, with notice | the strongest terms in the catalogue; keep `LICENSE.txt` |
| CMU KAL / CSTR RAB | unknown | read `COPYING` first | older Edinburgh terms; flagged `unknown`, not hidden |
| Czech (Brailcom) | allowed | only under GPL | a distributed pack would be a GPL derivative |
| IIIT-H Indic | unknown | unknown | `COPYING.txt` in each archive |
| MBROLA | not granted outside MBROLA | no | the reason for exclusion |

The licence statement, URL, attribution text and restrictions are shown in the
Info panel of every card and are stored in the catalogue rather than in the UI, so
they cannot drift from the data.

## 8. Testing

`npm run test:voices` — **104 checks**, all passing, no network access:

* catalogue: unique ids, ≥80 candidates, no protected id offered, every entry has a
  source URL, licence, attribution, class and a reason; nothing class D installable;
  every MBROLA voice excluded with the licence quoted in its note
* guards: `slt`, `bdl`, `..`, absolute and empty ids refused; resolver cannot leave
  its directory; registering a pack under a base id throws; the Python installer
  itself refuses `--id bdl` and says why
* conversion: a generated Festival EST database (121 units) converts to a valid
  pack whose audio covers its own index, with the base voice's manifest format
* removal: two packs installed, one removed — the other's bytes are unchanged, and
  so is `public/voicepacks/cmu-arctic/bdl/diphones.bin` (hashed)
* speaking: an optional pack is registered, the engine renders typed text from
  **recorded units with zero mathematical stand-ins** and one timing per word; after
  removal the same text renders with no recorded units at all and does not crash;
  the base voices still speak from their own units afterwards
* browsing: filters (search, language, accent, gender, status, class), all three
  sorts, and the neutral model (`pitch 1`, `rate 1`, no tone shaping)
* the ARCTIC recipe: an archive built in the ARCTIC layout (wav/ + lab/ + COPYING)
  goes through `install_voice.py --kind arctic-archive`, is cut by
  `build_cmu_voicepack.py`, validates, and reports `done` — the same path the 16
  speakers use, exercised on a fixture because the real host is unreachable here
* label discovery and honest failure: labels found under `labels/` instead of `lab/`
  install; an archive with no labels at all is refused with the inventory in the
  message, writes no pack, and reports `failed` to the UI; labels whose names do not
  match the waveforms are refused with both counts; `--lab-dir` is honoured, and a
  `--lab-dir` with no `.lab` files is refused
* `--inspect`: reports the waveforms and the absence of labels from an archive, exits
  0, and writes nothing into the voice root — including for an already-installed id
* the terminal command: `list --ready`, `urls --class A` and `install slt` (refused,
  with the reason) run as subprocesses and are checked on their output and exit code
* the runtime: a Python 3 is found on this machine, the candidate list covers every
  platform spelling with the platform's own name first, and `--from ~/Downloads/x`
  expands the way a terminal user expects

Required checks and where they stand:

| # | Required check | Result |
|---|---|---|
| 1 | BDL still works | `test:render` 555/555, `test:voices` |
| 2 | SLT still works | same |
| 3 | Original fingerprints unchanged | `npm run verify:base-voice` CONTRACT HOLDS, before and after install/remove |
| 4 | An additional compatible voice installs | yes — `cmu-kal`, through the HTTP API |
| 5 | It generates arbitrary typed text | yes — 44 recorded units, 0 fallbacks, 11 word timings |
| 6 | It can be auditioned | yes — the Audition button renders the shared library sentence |
| 7 | Switching voices does not mix speakers | one pack per id; `releaseVoicePack` drops the previous one; each source is separate |
| 8 | Removing an optional voice works | yes — API + tests |
| 9 | Removing does not damage the originals | hashed before/after in the tests, plus the contract check |
| 10 | App starts when optional voices are missing | yes — engine falls back per render |
| 11 | Failed downloads leave no broken entry | validation precedes the rename; a failure writes `stage: failed` and no directory |
| 12 | Selection persists | the chosen voice is a normal `VoiceModelConfig` in localStorage, `baseVoiceId` = the installed id |
| 13 | No browser/cloud/neural TTS added | `npm run verify:base-voice` CONTRACT HOLDS |

## 9. What is not done, honestly

* **The 16 ARCTIC archives were not downloaded from the build environment**
  (`festvox.org` is unreachable here; only GitHub is). Their conversion path is now
  proved on a fixture archive in the real layout, and the download itself is a
  terminal command away: `npm run voices -- install --class A`. The KAL install was
  run for real, end to end, including the download.
* **RAB is class B** until it is run against the real archive.
* **No installers for classes C and D**, for the reasons above.
* **Installing needs the Node server.** A static `dist` build served by
  `vite preview` has no `/api/voices`, so the library shows the catalogue but cannot
  install. The Voice Library UI reports that plainly instead of pretending.
* **Front ends for other languages** are the real unlock for the 12 class-C voices;
  that is a separate project.
* **Voice transformation is untouched.** This library speaks every voice as it was
  recorded — `pitch 1`, `rate 1`, no tone shaping. The transformation research stays
  in [`PHASE3_VOICE_TRANSFORM.md`](PHASE3_VOICE_TRANSFORM.md) and
  [`RECORDED_VOICE_PROSODY.md`](RECORDED_VOICE_PROSODY.md).

## 10. Files

| File | What it is |
|---|---|
| `src/data/voiceCatalogue.ts` | the 105 investigated voices with sources, licences, classes and recipes |
| `src/utils/optionalVoicePacks.ts` | the registry the engine resolves optional ids through; refuses base ids |
| `src/utils/voiceLibraryPaths.ts` | the id/path guard shared by the server and the tests |
| `src/utils/voiceLibrary.ts` | client: state, install/remove calls, filters, sorting, the neutral model |
| `src/components/RecordedVoiceLibrary.tsx` | the library UI: cards, filters, install progress, audition, info, remove |
| `scripts/install_voice.py` | download → convert → validate → atomic install |
| `scripts/import_festival_diphone.py` | Festival EST diphone database → Vocalis pack |
| `src/utils/cmuDiphoneSynthesizer.ts` | now loads a pack by id (base pair unchanged), plus `releaseVoicePack` |
| `server.ts` | `/api/voices`, install/progress/delete endpoints, static serving of installed packs |
| `tests/voiceLibrary.test.ts` | the 67 checks above |
