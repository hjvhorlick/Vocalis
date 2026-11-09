# Deploy and hand off Vocalis

## Runtime

Use Node.js 22 or newer and npm. No model server, AI API key, GPU, speech service
or Python audio dependency is needed. The audio engines, dictionary and banks
run in the browser. Python 3 is used **only** by development source-ZIP export.

```sh
npm ci
npm run lint
npm test
npm run build
npm start
```

`npm start` launches the production Express server on `0.0.0.0:3000` (or `PORT`).
It serves `dist/`, the status endpoint, and SPA fallback routes. Missing static
assets return 404 rather than index HTML. Set `PORT` if your host supplies one.
On Windows shells that do not accept POSIX environment assignments, set
`NODE_ENV=production` in the environment, then run `npx tsx server.ts`.

Alternatively deploy the contents of `dist/` to a static HTTPS host. The core
voice features do not require the Express API; `/api/voice/status` and development
source export are optional server conveniences. Build with all dependencies
installed; production startup uses `tsx`, which is a runtime dependency here.
After building, a production install may omit dev dependencies: Vite is loaded
only by the development server.

Do **not** omit `dist/cmudict.txt`, `dist/CMUDICT-LICENSE.txt`,
`dist/voicepacks/`, or the other copied public assets. Keep paths rooted at `/`,
or update Vite base and asset fetching deliberately for a subdirectory deployment.

## Microphone and browser requirements

- Serve on HTTPS (localhost is also a secure-context exception).
- Use a modern browser with MediaRecorder, Web Audio, IndexedDB and Web Crypto.
- A parent iframe must delegate microphone permission, for example with
  `allow="microphone"`, and its Permissions-Policy must allow the child origin.
  The app cannot override its parent's policy. Use a top-level tab if necessary.
- Playback needs a user gesture. Test real recording and output devices on the
  destination host; simulated audio tests do not establish listening quality.
- Uploading a short audio take is an alternative when a microphone is unavailable.
- Do not serve the Vite development server publicly as a production deployment.

## Moving to another coding environment or URL

1. Transfer the repository or use **Download Code (.zip)** in development.
   The safe source exporter includes `src`, `public`, `scripts`, `tests`, `docs`
   and explicitly allowed configuration files. It excludes local environment
   files, private voice packages, caches, common key-file patterns and generated builds.
   Review the archive before sharing: this is not a general secret scanner. Never
   put private audio or secrets under `public/`, which is intentionally deployed.
2. Export `.vproject` files to retain recordings and reviewed boundaries.
3. Export sound-bank `.vvoice` files to retain installable runtime voices.
4. Download important generated WAV takes individually. Ratings are local to the
   original browser origin and are not part of these voice files.
5. On the new site, open projects through **Record a Voice → Open file**. Open
   sound banks through **Build & test → Open sound bank**, confirm permission,
   and add them to the library.

The browser's old IndexedDB/localStorage does not follow the source code or URL.
All audio remains local unless the user explicitly transfers its exported files.

## Security changes

There is no browser GitHub-token form, server-side repository push command, or
arbitrary project-file listing API. Use authenticated git/gh tooling outside the
app to publish code. The production server returns 404 for `/api/project/*`.
Development ZIP export runs a fixed Python script with fixed arguments and an
allowlisted file set. Never expose a development environment containing secrets
as though it were a production service.

## Automated checks

`npm test` uses the built-in Node test runner and `tsx`. It covers ratings,
recording formats, PCM validation, quality checks, alignments, bank building,
coverage refusal, new-text rendering, dictionary validation and checksums.

Optional browser workflow (install testing tools locally; no runtime dependency):

```sh
npm install --no-save --no-package-lock playwright-core
# Start the application in another terminal, then point to your installed Chrome:
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
# To test a production server on another port:
TEST_URL=http://127.0.0.1:3001 CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

The test uploads a generated sine-wave fixture, reviews its test labels, builds
and installs a bank, exports/imports it, tests missing-sound refusal and verifies
that vault audio survives reloads. It uses an isolated browser context and stores
only ignored artifacts under `.cache/`. This checks functionality, **not** real
speech intelligibility, correctness of acoustic labels, or speaker similarity.

## Human acceptance test before release

- Record real sentences in a quiet room; listen for clipping/noise/missing words.
- Review every sound boundary. Do not approve evenly spaced suggestions unchanged
  unless they actually match the recording.
- Test previously unrecorded words and sentences; compare the generated voice with
  the source speaker. Track errors and join quality separately from preferences.
- Confirm missing-sound and unknown-word errors remain visible and never substitute
  a speaker in user banks.
- Check source clips separately from generated preset speech. Preset names do not
  represent sixty independent synthesis banks.
- Verify source/recording licenses, script rights and speaker permissions before
  commercial use. The application does not grant or certify those rights.

## Remaining research/quality work

The end-to-end workflow is implemented as a prototype. Automatic acoustic
alignment, stress-aware selection, robust pitch-synchronous joins, natural
prosody, broad language support, independent pitch/rate processing for custom
banks, bulk-corpus tools, formal perceptual evaluation, and a full rights audit
remain future work. None is silently simulated or represented as finished.
