# The recorded voice library

Vocalis speaks from recordings of people. This document is about adding *more*
people — not more transformations — and it records what was found, what was
verified, what is installable today, and what was excluded and why.

The short version: **105 recorded, non-neural voice databases were investigated.
7 of them have a working installer today** (five CMU ARCTIC speakers, the CMU KAL
diphone database and CSTR RAB). **23 are class C** — the audio and the format are
right but something else is missing: for eleven of the ARCTIC speakers FestVox
publishes waveforms and transcription but never the phone labels a diphone pack is
cut from, and the other twelve are databases in languages the pronunciation front
end cannot read. **75 are excluded** because their licence forbids using them outside
MBROLA. Every one of the 105 is in the catalogue on screen, with its licence and its
reason, so a user can see what exists rather than trusting a claim.

**What is proven, and what is not.** `cmu-kal` has been installed, spoken and removed
here on a real archive: 1,578 recorded units, a rendered sentence with zero
mathematical stand-ins. Nothing else is proved. The sixteen ARCTIC speakers were
originally rated class A on the strength of the database documentation, which says the
corpus ships with "automatic phone labels"; the first real download —
`cmu_us_ljm_arctic.tar.bz2` — unpacked to 593 waveforms, **0 label files** and one
Festival transcription file, because FestVox labels those speakers at build time with
CMU Sphinx rather than shipping the labels. The converter refused it instead of
writing an empty pack, and that refusal is why `npm run voices -- inspect` exists.
Five ARCTIC speakers do have published labels (see §3), and their release builds are
offered as class A with a "not yet proved" note until an archive passes `inspect` on a
real machine. This document does not claim a voice works because it downloaded.

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
| **A** | Directly compatible: the archive converts with a script Vocalis already runs, audio untouched. | 6 |
| **B** | Compatible after an adapter: right shape, but the details (index name, layout) are discovered at install time. | 1 |
| **C** | Needs something Vocalis does not have: phone labels that were never published (eleven ARCTIC speakers, which need forced alignment), or a pronunciation front end for a non-English language (twelve databases). | 23 |
| **D** | Not compatible: format or licence rules it out. Kept visible, never installable. | 75 |

`install: null` in the catalogue is the machine-readable form of "no installer
yet". It is not a quality claim about the voice.

## 3. The seven voices with an installer

### CMU ARCTIC — five speakers whose labels FestVox publishes, class A

The ARCTIC corpus has 18 speakers recorded the same way (16 kHz mono WAV per
utterance). What differs — and what decides installability — is *what FestVox
published for each of them*, and there are three different shapes on their server:

| What is published | Where | Contains |
|---|---|---|
| the packed build, all 18 speakers | `cmu_arctic/packed/cmu_us_<spk>_arctic.tar.bz2` (37–89M) | `wav/`, `etc/` and a transcription file — **no labels** |
| the release build, seven speakers | `cmu_arctic/cmu_arctic/packed/cmu_us_<spk>_arctic-0.95-release.tar.bz2` (87–124M) | the full 0.95 tree, cut with `scripts/build_cmu_voicepack.py` |
| the built tree, seven speakers | `cmu_arctic/cmu_arctic/cmu_us_<spk>_arctic/` | `wav/`, **`lab/`**, `etc/`, cepstra, f0 and the Festival voice |

The seven with a published `lab/` directory are **awb, bdl, clb, jmk, ksp, rms and
slt** — the four original speakers plus the three accent speakers. `bdl` and `slt` are
the protected base voices, so five of the seven are new to the library. Their labels
are the Festival format Vocalis already parses (`0.13200 125 pau`, one line per
phone, seconds from the start of the file), fetched from that published tree and
checked by hand. The other eleven speakers — aew, ahw, aup, axb, eey, fem, gka, ljm,
lnh, rxr, slp — exist only as packed builds.

| id | accent | gender | archive | label count |
|---|---|---|---|---|
| `arctic-awb` | Scottish English | Male | `cmu_us_awb_arctic-0.95-release.tar.bz2` (123M) | published |
| `arctic-clb` | US English | Female | `cmu_us_clb_arctic-0.95-release.tar.bz2` (124M) | published |
| `arctic-jmk` | Canadian English | Male | `cmu_us_jmk_arctic-0.95-release.tar.bz2` (87M) | published |
| `arctic-ksp` | Indian English | Male | `cmu_us_ksp_arctic-0.95-release.tar.bz2` (114M) | published |
| `arctic-rms` | US English | Male | `cmu_us_rms_arctic-0.95-release.tar.bz2` (111M) | published |

Those five are marked class A because the builder for that layout is the one that
produced the base packs, and their labels demonstrably exist. They are **not** called
proven: no archive has been through `install_voice.py` on a real machine yet. Check
one before trusting it:

```sh
npm run voices -- inspect arctic-clb
```

Two numbers decide it: a non-zero label count means the conversion has real work to
do and the install will proceed; `0 label files` means the refusal message is correct
and the voice needs forced alignment after all.

### CMU ARCTIC — eleven speakers with waveforms only, class C

For aew, ahw, aup, axb, eey, fem, gka, ljm, lnh, rxr and slp, the only thing FestVox
publishes is the packed build: 593 waveforms, a `txt.done.data` transcription, and no
phone boundaries. The evidence is the LJM archive itself — `inspect` reports 593
waveforms, 0 label files and a text sample of
`( arctic_a0001 "Author of the danger trail, Philip Steels, etc." )`. Their own
`do_arctic` script labels the corpus with CMU Sphinx (`build_cg_rfs_voice`) after
downloading it, which is a build step nothing in this repository reimplements.

Cutting recorded diphones needs the boundaries, and inventing them would be exactly
the "build the database yourself" work this project ruled out, so these eleven have
`install: null`, class C, and a note that says so. The catalogue keeps them visible —
a user can see that eleven more ARCTIC voices exist and exactly what stands between
them and a pack, instead of wondering why only five are offered.

Download URLs and sizes were read from the published index at
<http://festvox.org/cmu_arctic/packed/> and
<http://festvox.org/cmu_arctic/cmu_arctic/packed/> on 2026-11-07.

### Proved on real recordings, in this checkout

Two voices have now been installed from real, complete recordings and spoken, with
the render measured rather than assumed. Both go through the same HTTP path the
browser uses (`/optional-voices/<id>/manifest.json` + `diphones.bin`):

| voice | source | units | rendered sentence | peak | exact units | stand-ins |
|---|---|---|---|---|---|---|
| `cmu-kal` | CMU KAL diphone database | 1,578 | 6.03 s | 0.78 | 44 | 0 |
| `arctic-awb` | CMU ARCTIC 0.95, Scottish male, real `lab/` | 1,334 | 6.05 s | 0.78 | 43 | 0 |

The AWB figures come from 1,138 real utterances with phone labels; the labels were
checked against the audio (speech starts at 0.64 s where the second `pau` label
ends at 0.6245 s), and the render reports one missing diphone pair out of the
sentence, no half-unit backoffs and no mathematical stand-ins.

### Installing from a directory you already have

If `festvox.org` is slow, blocking, or you already have the data, `--from` accepts
an **unpacked speaker directory** and skips both the download and the extraction:

```sh
# A GitHub mirror of the ARCTIC corpus that carries wav/ and lab/ together
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/abearman/cs224s-accent-conversion ~/arctic-mirror
cd ~/arctic-mirror
git sparse-checkout set data/cmu_arctic/scottish-english-male-awb   # ~223 MB

cd ~/Vocalis
npm run voices -- install arctic-awb \
  --from ~/arctic-mirror/data/cmu_arctic/scottish-english-male-awb
```

The same repository carries `us-english-female-clb`, `us-english-male-rms`,
`canadian-english-male-jmk`, `indian-english-male-ksp`, `us-english-female-slt` and
`us-english-male-bdl`; the id mapping is `arctic-clb`, `arctic-rms`, `arctic-jmk`,
`arctic-ksp` (BDL and SLT are the protected base voices). The data is CMU ARCTIC
under the ARCTIC terms — the mirror is a convenience, the licence and the
attribution do not change.

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

## 4. Class C: the other twenty-three

* **Eleven CMU ARCTIC speakers** — see §3: right audio, right format, labels never
  published.
* **Festival Czech diphone databases** — `brailcom/voice-czech-{ph,dita,krb,machac}`.
  Complete, human-recorded, EST format, 16 kHz, with labels and waveforms. GPL-2.0 /
  GPL-3.0 (copyleft: a redistributed pack would carry the same licence). One female
  voice (DITA), three male.
* **IIIT-H Indic databases** — Bengali, Hindi, Kannada, Malayalam, Marathi, Tamil,
  Telugu. Studio recordings with Festvox unit-selection builds. Gender is not
  documented per speaker, so the catalogue says so instead of guessing.

The twelve non-English databases would work as packs tomorrow; what is missing is a
pronunciation front end for their language. Adding one is a language project, not a voice project, and it is
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
| `npm run voices -- install --class A` | all six class-A voices, one at a time |
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
safe to run on a voice you already have installed. While it runs it prints each
stage as the installer reports it — `download … 12.3 of 45.0 MB` — so a large
archive does not look like a hung terminal; Ctrl-C during the download is safe and
leaves nothing behind.

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

`npm run test:voices` — **134 checks**, all passing, no network access:

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
* the catalogue tells the truth about ARCTIC: the eleven speakers FestVox never
  published labels for offer no installer, are class C and say why; the five that do
  point at the labelled release build and are marked "not yet proved"; no ARCTIC entry
  claims labels its archive does not have
* label discovery and honest failure: labels found under `labels/` instead of `lab/`
  install; an archive with no labels at all is refused with the inventory in the
  message, writes no pack, and reports `failed` to the UI; labels whose names do not
  match the waveforms are refused with both counts; `--lab-dir` is honoured, and a
  `--lab-dir` with no `.lab` files is refused
* `--inspect`: reports the waveforms and the absence of labels from an archive, exits
  0, and writes nothing into the voice root — including for an already-installed id;
  at the CLI level it installs nothing, leaves the library directory unchanged, and
  fails promptly, naming the missing file instead of reporting a `urlopen` error
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

* **No ARCTIC archive has been converted end to end yet.** Their conversion path is
  proved on fixture archives in the real layout, and the label format is checked
  against the published `lab/` tree, but the first real download (LJM) had no labels
  at all and the eleven speakers it represents are now class C. The five with
  published labels are one `inspect` away from being confirmed or corrected — that is
  the next step, on a machine that can reach `festvox.org`.
* **Forced alignment is not implemented, on purpose.** It needs a trained acoustic
  model and a build toolchain, which the "no trained models, no AI" rule rules out.
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
