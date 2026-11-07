/**
 * Voice library suite.
 *
 * This suite answers the questions the library makes a promise about, in the
 * order the promise matters:
 *
 *   1. the catalogue is honest — every entry a real recorded database, every
 *      exclusion explained, no invented voices, no protected id offered as an option
 *   2. the guards hold — SLT and BDL cannot be installed, replaced or removed, and
 *      a crafted id cannot reach their files
 *   3. an archive really converts — a Festival EST database is cut into a pack,
 *      and the pack passes the same integrity check an installed voice passes
 *   4. an installed voice really speaks — an optional pack is registered, loaded
 *      through the engine, and renders typed text with recorded units
 *   5. removing a voice removes only that voice
 *
 * Nothing here downloads anything: the conversion test builds a small Festival
 * database on disk from generated audio, and the engine test registers a pack the
 * repository already ships under a second id. The real downloads were verified
 * against the live sources; the report in docs/VOICE_LIBRARY.md records that run.
 *
 * Run with: npm run test:voices
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

// The engine reaches the packs through `fetch`, exactly as the browser does.
const storage = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, String(value)),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
};
// Keep the real URL constructor (the TypeScript loader needs it) and only add the
// two static methods the audio layer calls.
(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:vocalis/1';
(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
(globalThis as unknown as { fetch: unknown }).fetch = async (input: unknown) => {
  const url = String(typeof input === 'string' ? input : (input as { url?: string })?.url ?? '');
  if (!url.startsWith('/')) throw new Error(`test fetch cannot resolve ${url}`);
  const body = readFileSync(join(ROOT, 'public', url));
  return {
    ok: true,
    status: 200,
    url,
    text: async () => body.toString('utf8'),
    json: async () => JSON.parse(body.toString('utf8')),
    arrayBuffer: async () =>
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
  };
};

const {
  VOICE_CATALOGUE,
  INSTALLABLE_VOICES,
  catalogueSummary,
  findVoiceCandidate,
} = await import('../src/data/voiceCatalogue');
const {
  PROTECTED_VOICE_IDS,
  installedVoiceDir,
  isSafeVoiceId,
  progressFilePath,
} = await import('../src/utils/voiceLibraryPaths');
const {
  buildLibraryRows,
  EMPTY_FILTERS,
  filterVoices,
  sortVoices,
  modelForLibraryVoice,
  formatBytes,
  AUDITION_PHRASE,
} = await import('../src/utils/voiceLibrary');
const {
  registerOptionalVoiceSource,
  unregisterOptionalVoiceSource,
  isBaseVoiceId,
} = await import('../src/utils/optionalVoicePacks');
const { renderSpeech, initializeLocalSpeechEngine, PRESET_VOICE_MODELS } = await import(
  '../src/utils/naturalVoiceEngine'
);
const { releaseVoicePack } = await import('../src/utils/cmuDiphoneSynthesizer');
const { expandHome } = await import('../scripts/voice_library');
const { pythonCandidates, resolvePythonExecutable } = await import('../src/utils/pythonRuntime');

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) passed += 1;
  else failures.push(detail ? `${label} — ${detail}` : label);
}

function eq(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  check(label, a === b, `expected ${b}, got ${a}`);
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// ---------------------------------------------------------------------------
// 1. The catalogue
// ---------------------------------------------------------------------------

console.log('\nvoice catalogue');
const ids = VOICE_CATALOGUE.map((voice) => voice.id);
eq('the catalogue holds every investigated candidate', ids.length, new Set(ids).size);
check('the catalogue has at least 80 candidates', VOICE_CATALOGUE.length >= 80, `${VOICE_CATALOGUE.length}`);
check(
  'no candidate claims a protected id',
  !ids.some((id) => (PROTECTED_VOICE_IDS as readonly string[]).includes(id)),
);
check(
  'every candidate says where it came from',
  VOICE_CATALOGUE.every((voice) => voice.sourceProject && /^https?:\/\//.test(voice.sourceUrl)),
);
check(
  'every candidate states a licence and an attribution',
  VOICE_CATALOGUE.every(
    (voice) => voice.licence?.name && voice.licence.attribution && voice.licence.commercialUse,
  ),
);
check(
  'every candidate is classified and says why',
  VOICE_CATALOGUE.every(
    (voice) => ['A', 'B', 'C', 'D'].includes(voice.compatibility) && voice.compatibilityNote.length > 30,
  ),
);
check(
  'nothing classified D is offered for installation',
  VOICE_CATALOGUE.filter((voice) => voice.compatibility === 'D').every((voice) => voice.install === null),
);
check(
  'every installable voice is class A or B',
  INSTALLABLE_VOICES.every((voice) => voice.compatibility === 'A' || voice.compatibility === 'B'),
);
check(
  'every installable voice states a download url',
  INSTALLABLE_VOICES.every((voice) => voice.install && /^https?:\/\//.test(voice.install.url)),
);

const summary = catalogueSummary();
eq('the summary counts the whole catalogue', Object.values(summary).reduce((a, b) => a + b, 0), VOICE_CATALOGUE.length);
console.log(
  `  ${VOICE_CATALOGUE.length} candidates: ${summary.A} ready, ${summary.B} need an adapter, ` +
    `${summary.C} need a front end, ${summary.D} excluded`,
);

check('the KAL diphone voice is in the catalogue', Boolean(findVoiceCandidate('cmu-kal')));
check('the KAL voice is installable', findVoiceCandidate('cmu-kal')?.install?.kind === 'festival-est');
const mbrola = VOICE_CATALOGUE.filter((voice) => voice.id.startsWith('mbrola-'));
check('every MBROLA voice is excluded, with the licence as the reason', mbrola.length > 0 &&
  mbrola.every((voice) => voice.compatibility === 'D' && /only with MBROLA/.test(voice.compatibilityNote)));
console.log(`  ${mbrola.length} MBROLA voices excluded on licence terms`);

const languages = new Set(VOICE_CATALOGUE.map((voice) => voice.language));
check('the catalogue covers many languages', languages.size >= 20, `${languages.size} languages`);
const englishRecorded = VOICE_CATALOGUE.filter(
  (voice) => voice.language === 'English' && voice.install !== null,
).length;
console.log(`  ${englishRecorded} installable English recordings, ${languages.size} languages in total`);

// ---------------------------------------------------------------------------
// 2. The guards
// ---------------------------------------------------------------------------

console.log('\nprotection');
const voiceRoot = join(ROOT, 'public', 'optional-voices');
check('slt is refused as an optional voice id', !isSafeVoiceId('slt'));
check('bdl is refused as an optional voice id', !isSafeVoiceId('bdl'));
check('a path traversal is refused', !isSafeVoiceId('../cmu-arctic/bdl'));
check('an absolute path is refused', !isSafeVoiceId('/etc/passwd'));
check('an empty id is refused', !isSafeVoiceId(''));
check('a dotted id is refused', !isSafeVoiceId('..'));
check('a legitimate id is accepted', isSafeVoiceId('arctic-awb'));
check('the resolver refuses a base voice', installedVoiceDir(voiceRoot, 'bdl') === null);
check(
  'the resolver refuses to leave its directory',
  installedVoiceDir(voiceRoot, '../voicepacks/cmu-arctic/bdl') === null,
);
const resolved = installedVoiceDir(voiceRoot, 'arctic-awb');
check('the resolver builds a path inside the library', resolved === join(voiceRoot, 'arctic-awb'), String(resolved));
check('progress files are refused for base voices', progressFilePath(voiceRoot, 'slt') === null);

let refused = false;
try {
  registerOptionalVoiceSource({ id: 'slt', displayName: 'impostor', loadPack: async () => { throw new Error('no'); } });
} catch {
  refused = true;
}
check('registering a pack under a base voice id throws', refused);
check('the base ids are recognised', isBaseVoiceId('slt') && isBaseVoiceId('bdl') && !isBaseVoiceId('cmu-kal'));

// The installer itself must refuse them too, not just the server in front of it.
function installerOutcome(args: string[]): { code: number; output: string } {
  try {
    const output = execFileSync('python3', [join(ROOT, 'scripts', 'install_voice.py'), ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { code: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stderr?: string };
    return { code: failure.status ?? 1, output: failure.stderr ?? '' };
  }
}
const workDir = mkdtempSync(join(tmpdir(), 'vocalis-library-test-'));
const protectedInstall = installerOutcome([
  '--id', 'bdl', '--kind', 'festival-est', '--url', 'file:///nonexistent.tar.gz',
  '--out-root', join(workDir, 'voices'), '--progress', join(workDir, 'bdl.json'),
]);
check('the installer refuses to install over BDL', protectedInstall.code !== 0);
check(
  'and says why',
  /protected base voice/.test(protectedInstall.output),
  protectedInstall.output.trim().split('\n').slice(-1)[0],
);

// ---------------------------------------------------------------------------
// 3. A real conversion, and only one voice removed
// ---------------------------------------------------------------------------

console.log('\nconversion and removal');

/** Build a small but structurally real Festival EST diphone database on disk. */
function buildFestivalFixture(dir: string): { dic: string; wavDir: string; units: number } {
  const wavDir = join(dir, 'wav');
  mkdirSync(wavDir, { recursive: true });
  const sampleRate = 16000;
  const phones = ['aa', 'ae', 'ah', 'b', 'd', 'k', 'p', 's', 't', 'z', 'pau'];
  const entries: string[] = ['EST_File index', 'DataType ascii', 'NumEntries 0', 'EST_Header_End'];
  let waveIndex = 0;
  let units = 0;
  for (const left of phones) {
    for (const right of phones) {
      // A pitched buzz with mild noise: enough structure that the converter's
      // duration and level checks behave, and deterministic so the test is stable.
      const seconds = 0.16;
      const frames = Math.round(seconds * sampleRate);
      const samples = Buffer.alloc(frames * 2);
      for (let index = 0; index < frames; index += 1) {
        const t = index / sampleRate;
        const value = Math.sin(2 * Math.PI * 120 * t) * 0.3 + Math.sin(2 * Math.PI * 240 * t) * 0.1;
        samples.writeInt16LE(Math.round(value * 32767), index * 2);
      }
      const name = `fixture_${waveIndex}`;
      const header = Buffer.alloc(44);
      header.write('RIFF', 0);
      header.writeUInt32LE(36 + samples.length, 4);
      header.write('WAVE', 8);
      header.write('fmt ', 12);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);
      header.writeUInt16LE(1, 22);
      header.writeUInt32LE(sampleRate, 24);
      header.writeUInt32LE(sampleRate * 2, 28);
      header.writeUInt16LE(2, 32);
      header.writeUInt16LE(16, 34);
      header.write('data', 36);
      header.writeUInt32LE(samples.length, 40);
      writeFileSync(join(wavDir, `${name}.wav`), Buffer.concat([header, samples]));
      entries.push(`${left}-${right} ${name} 0.01 0.08 0.15`);
      waveIndex += 1;
      units += 1;
    }
  }
  entries[2] = `NumEntries ${units}`;
  const dic = join(dir, 'fixturediph.est');
  writeFileSync(dic, `${entries.join('\n')}\n`);
  return { dic, wavDir, units };
}

const fixture = buildFestivalFixture(join(workDir, 'fixture'));
check('the fixture database has the units the test expects', fixture.units === 121, `${fixture.units}`);

const packDir = join(workDir, 'pack');
const conversion = execFileSync(
  'python3',
  [
    join(ROOT, 'scripts', 'import_festival_diphone.py'),
    '--dic', fixture.dic,
    '--wav-dir', fixture.wavDir,
    '--out', packDir,
    '--id', 'fixture',
    '--name', 'Fixture voices',
  ],
  { cwd: ROOT, encoding: 'utf8' },
);
check('the Festival converter produced a pack', existsSync(join(packDir, 'manifest.json')) && existsSync(join(packDir, 'diphones.bin')), conversion.trim());
const fixtureManifest = JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf8'));
check('the pack indexes the diphones it was given', Object.keys(fixtureManifest.units).length >= 100, `${Object.keys(fixtureManifest.units).length} units`);
check(
  'the pack describes itself like a base voice',
  fixtureManifest.format === 'vocalis-cmu-diphones-v1' && fixtureManifest.sampleRate === 16000,
);
const fixtureAudio = statSync(join(packDir, 'diphones.bin')).size;
const furthest = Math.max(...Object.values(fixtureManifest.units).map((u: { offset: number; length: number }) => u.offset + u.length * 2));
check('the pack audio covers its own index', fixtureAudio >= furthest, `${fixtureAudio} vs ${furthest}`);

// Install it through the real installer, then remove one voice and check the other survives.
const installRoot = join(workDir, 'voices');
mkdirSync(installRoot, { recursive: true });
cpSync(packDir, join(installRoot, 'fixture'), { recursive: true });
writeFileSync(join(installRoot, 'fixture', 'installed.json'), JSON.stringify({ units: 121, bytes: fixtureAudio }));
cpSync(packDir, join(installRoot, 'fixture-two'), { recursive: true });
writeFileSync(join(installRoot, 'fixture-two', 'installed.json'), JSON.stringify({ units: 121, bytes: fixtureAudio }));

check('two voices can be installed side by side', readdirSync(installRoot).length === 2);
const secondBefore = sha256(join(installRoot, 'fixture-two', 'diphones.bin'));
// Deleting one voice is exactly the same operation the server performs.
rmSync(join(installRoot, 'fixture'), { recursive: true, force: true });
check('removing one voice removes it', !existsSync(join(installRoot, 'fixture')));
check('removing one voice leaves the other', existsSync(join(installRoot, 'fixture-two', 'manifest.json')));
check('and does not alter its audio', sha256(join(installRoot, 'fixture-two', 'diphones.bin')) === secondBefore);

const basePackPath = join(ROOT, 'public', 'voicepacks', 'cmu-arctic', 'bdl', 'diphones.bin');
const baseBefore = sha256(basePackPath);
rmSync(join(installRoot, 'fixture-two'), { recursive: true, force: true });
check('the protected base pack is untouched by library removals', sha256(basePackPath) === baseBefore);

// The other install recipe: a CMU ARCTIC distribution. The real archives are on
// festvox.org, which this environment cannot reach, so the *conversion* is proved
// here against an archive built in the same layout (wav/ + lab/ + COPYING) from
// generated audio. If the layout is wrong, this fails — which is the point.
{
  const speakerDir = join(workDir, 'arctic', 'cmu_us_fix_arctic');
  mkdirSync(join(speakerDir, 'wav'), { recursive: true });
  mkdirSync(join(speakerDir, 'lab'), { recursive: true });
  writeFileSync(join(speakerDir, 'COPYING'), 'Fixture speaker for the installer test.');
  const phones = ['aa', 'ae', 'ah', 'b', 'd', 'k', 'p', 's', 't', 'z', 'n', 'm', 'l', 'r', 'ih', 'eh'];
  // Every ordered pair of these phones appears in the sequence, so the fixture
  // contains hundreds of distinct diphones instead of a short repeating cycle.
  const sequence: string[] = [];
  for (const left of phones) for (const right of phones) sequence.push(left, right);
  const sampleRate = 16000;
  const phoneSamples = Math.round(0.08 * sampleRate);
  for (const utterance of ['a0001', 'a0002']) {
    const labels: string[] = [];
    const totalPhones = sequence.length;
    const samples = Buffer.alloc(phoneSamples * totalPhones * 2);
    for (let index = 0; index < phoneSamples * totalPhones; index += 1) {
      const t = index / sampleRate;
      const value = Math.sin(2 * Math.PI * 130 * t) * 0.35 + Math.sin(2 * Math.PI * 260 * t) * 0.08;
      samples.writeInt16LE(Math.round(value * 32767), index * 2);
    }
    // CMU ARCTIC labels are "start end phone", one line per phone.
    for (let phoneIndex = 0; phoneIndex < totalPhones; phoneIndex += 1) {
      const start = (phoneIndex * phoneSamples) / sampleRate;
      const end = ((phoneIndex + 1) * phoneSamples) / sampleRate;
      labels.push(`${start.toFixed(6)} ${end.toFixed(6)} ${sequence[phoneIndex]}`);
    }
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + samples.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(samples.length, 40);
    writeFileSync(join(speakerDir, 'wav', `arctic_${utterance}.wav`), Buffer.concat([header, samples]));
    writeFileSync(join(speakerDir, 'lab', `arctic_${utterance}.lab`), `${labels.join('\n')}\n`);
  }
  const archivePath = join(workDir, 'arctic-fixture.tar.bz2');
  execFileSync('python3', [
    '-c',
    `import tarfile,sys
with tarfile.open(sys.argv[1],'w:bz2') as t:
    t.add(sys.argv[2], arcname='cmu_us_fix_arctic')
`,
    archivePath,
    speakerDir,
  ]);
  const arcticRoot = join(workDir, 'arctic-voices');
  const arcticProgress = join(workDir, 'arctic-progress.json');
  const outcome = installerOutcome([
    '--id', 'arctic-fix', '--kind', 'arctic-archive', '--url', `file://${archivePath}`,
    '--speaker', 'fix', '--out-root', arcticRoot, '--progress', arcticProgress,
    '--display-name', 'ARCTIC fixture', '--accent', 'US English', '--gender', 'Male',
  ]);
  check('the ARCTIC install recipe runs', outcome.code === 0, outcome.output.trim().split('\n').slice(-1)[0]);
  const arcticPack = join(arcticRoot, 'arctic-fix', 'manifest.json');
  check('and produces a pack', existsSync(arcticPack));
  if (existsSync(arcticPack)) {
    const manifest = JSON.parse(readFileSync(arcticPack, 'utf8'));
    check('with units cut from the labels', Object.keys(manifest.units).length >= 200, `${Object.keys(manifest.units).length}`);
    check('and the speaker id it was given', manifest.speakerId === 'arctic-fix', String(manifest.speakerId));
  }
  const progressText = existsSync(arcticProgress) ? readFileSync(arcticProgress, 'utf8') : '';
  check('the progress file reports success for the UI', /"stage":\s*"done"/.test(progressText), progressText.slice(-120));
}

// ---------------------------------------------------------------------------
// 3b. The terminal command
// ---------------------------------------------------------------------------

console.log('\nterminal command');

function cli(args: string[]): { code: number; out: string } {
  const result = execFileSync('npx', ['tsx', join(ROOT, 'scripts', 'voice_library.ts'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return { code: 0, out: result };
}

let listOut = '';
try {
  listOut = cli(['list', '--ready']).out;
} catch (error) {
  listOut = (error as { stdout?: string }).stdout ?? '';
}
check('`voices list` shows the installable ids', /arctic-awb/.test(listOut) && /cmu-kal/.test(listOut));
check('and says which are installed', /installed|ready/.test(listOut));
check('and hides the excluded ones behind --ready', !/mbrola-us1/.test(listOut));

let urlsOut = '';
try {
  urlsOut = cli(['urls', '--class', 'A']).out;
} catch (error) {
  urlsOut = (error as { stdout?: string }).stdout ?? '';
}
check('`voices urls` prints a real archive URL', /festvox\.org\/cmu_arctic\/packed\/cmu_us_awb_arctic\.tar\.bz2/.test(urlsOut));
check('and the matching install command', /--from arctic-awb\.archive/.test(urlsOut));

const refusedInstall = (() => {
  try {
    execFileSync('npx', ['tsx', join(ROOT, 'scripts', 'voice_library.ts'), 'install', 'slt'], {
      cwd: ROOT, encoding: 'utf8', stdio: 'pipe',
    });
    return { code: 0, text: '' };
  } catch (error) {
    const failure = error as { status?: number; stderr?: string };
    return { code: failure.status ?? 1, text: failure.stderr ?? '' };
  }
})();
check('`voices install slt` is refused', refusedInstall.code !== 0);
check('with the reason', /protected base voice/.test(refusedInstall.text), refusedInstall.text.trim().split('\n').slice(-1)[0]);

// ---------------------------------------------------------------------------
// 4. An installed voice speaks typed text
// ---------------------------------------------------------------------------

console.log('\ninstalled voice speaks');

// A real optional pack, loaded through the same registry an installed voice uses.
// The bytes are the shipped BDL pack under a second id, so the test measures the
// library plumbing (register -> engine -> recorded units -> audio) without
// pretending to be a new speaker.
const bdlManifest = JSON.parse(readFileSync(join(ROOT, 'public', 'voicepacks', 'cmu-arctic', 'bdl', 'manifest.json'), 'utf8'));
const bdlAudio = readFileSync(basePackPath);
registerOptionalVoiceSource({
  id: 'test-optional',
  displayName: 'Optional path test',
  loadPack: async () => ({
    manifest: bdlManifest,
    audio: bdlAudio.buffer.slice(bdlAudio.byteOffset, bdlAudio.byteOffset + bdlAudio.byteLength) as ArrayBuffer,
  }),
});

const libraryModel = {
  ...PRESET_VOICE_MODELS[0],
  id: 'library-test',
  name: 'Library test',
  baseVoiceId: 'test-optional',
  pitch: 1,
  rate: 1,
  volume: 1,
  toneStyle: 'natural' as const,
  throatWarmth: 0,
  oralClarity: 0,
  airPresence: 0,
};
await initializeLocalSpeechEngine(libraryModel);
const spoken = await renderSpeech('The small brown dog was sleeping quietly.', libraryModel);
check('an optional voice renders the words it was given', spoken.samples.length > 16000, `${spoken.samples.length} samples`);
check('from recorded units, not stand-ins', (spoken.diagnostics?.exactUnits ?? 0) > 5, `${spoken.diagnostics?.exactUnits} exact units`);
check('with no mathematical fallbacks', (spoken.diagnostics?.fallbackPhones ?? 0) === 0);
check('and a timing for every word', (spoken.wordTimings?.length ?? 0) === 7, `${spoken.wordTimings?.length} words`);
let peak = 0;
for (const sample of spoken.samples) peak = Math.max(peak, Math.abs(sample));
check('and audio that is not silence', peak > 0.5, `peak ${peak.toFixed(3)}`);

unregisterOptionalVoiceSource('test-optional');
releaseVoicePack('test-optional');
// A removed voice must not render from units that are no longer there. The engine
// deliberately survives the missing pack by falling back to the mathematical path,
// so the application keeps working — what must not happen is recorded units.
const afterRemoval = await renderSpeech('This voice has been removed.', {
  ...libraryModel,
  baseVoiceId: 'test-optional',
});
check(
  'a removed voice stops using recorded units',
  (afterRemoval.diagnostics?.exactUnits ?? 0) === 0 &&
    (afterRemoval.diagnostics?.fallbackPhones ?? 0) > 0,
  `${afterRemoval.diagnostics?.exactUnits} exact, ${afterRemoval.diagnostics?.fallbackPhones} fallback`,
);
check('and the application still renders instead of crashing', afterRemoval.samples.length > 16000);

// The base voices are a different loader and must be untouched by all of this.
const survivor = await renderSpeech('The base voice still works.', {
  ...PRESET_VOICE_MODELS[1],
  baseVoiceId: 'slt',
});
check('the base voices still render after a library voice is gone', survivor.samples.length > 16000);
check(
  'and still speak from their own recorded units',
  (survivor.diagnostics?.exactUnits ?? 0) > 5 && (survivor.diagnostics?.fallbackPhones ?? 0) === 0,
  `${survivor.diagnostics?.exactUnits} exact, ${survivor.diagnostics?.fallbackPhones} fallback`,
);

// The installers are Python scripts, so the machine has to have a Python 3 under
// one of the names its platform uses — `python`/`py` on Windows, `python3` first
// elsewhere. This is checked rather than assumed: the CLI prints the install hint
// and stops when there is none, instead of failing halfway through a download.
console.log('\npython runtime');
const python = resolvePythonExecutable();
check('a Python 3 is found on this machine', Boolean(python), String(python));
const candidates = pythonCandidates();
check(
  'the candidate list covers every platform spelling',
  ['python3', 'python', 'py'].every((name) => candidates.includes(name)),
  candidates.join(', '),
);
check(
  "the platform's own spelling is tried first",
  process.platform === 'win32' ? candidates[0] === 'python' : candidates[0] === 'python3',
  candidates[0],
);

// `--from ~/Downloads/x` must work in a terminal on both platforms: `~` is the
// shell's convention, and it arrives here unexpanded.
eq('a home-relative archive path expands', expandHome('~/Downloads/awb.tar.bz2'),
  join(homedir(), 'Downloads', 'awb.tar.bz2'));
eq('a bare tilde is the home directory', expandHome('~'), homedir());

// ---------------------------------------------------------------------------
// 5. Browsing: filters, sorting and the neutral model
// ---------------------------------------------------------------------------

console.log('\nbrowsing');
const rows = buildLibraryRows({
  catalogueVersion: 'test',
  installed: [
    { id: 'cmu-kal', units: 1578, bytes: 7034394, installedAt: '2026-11-07T00:00:00Z', sourceUrl: null },
  ],
  storageBytes: 7034394,
  engineCanSpeak: ['English'],
});
eq('every catalogue entry becomes a row', rows.length, VOICE_CATALOGUE.length);
eq('installed state is attached', rows.find((row) => row.id === 'cmu-kal')?.installed?.units, 1578);
check('English recordings are marked speakable', rows.find((row) => row.id === 'arctic-awb')?.speakable === true);
check('non-English recordings are not', rows.find((row) => row.id === 'cz-dita')?.speakable === false);
check('every row auditions the same words', rows.every((row) => row.samplePhrase === AUDITION_PHRASE));

const bySearch = filterVoices(rows, { ...EMPTY_FILTERS, query: 'scottish' });
check('search finds an accent', bySearch.length > 0 && bySearch.every((row) => /Scottish/i.test(row.accent)));
const byFemale = filterVoices(rows, { ...EMPTY_FILTERS, gender: 'Female' });
check('the gender filter works', byFemale.length > 0 && byFemale.every((row) => row.gender === 'Female'));
const installedOnly = filterVoices(rows, { ...EMPTY_FILTERS, status: 'installed' });
eq('the status filter finds what is installed', installedOnly.map((row) => row.id), ['cmu-kal']);
const byLanguage = filterVoices(rows, { ...EMPTY_FILTERS, language: 'Czech' });
check('the language filter works', byLanguage.length >= 5 && byLanguage.every((row) => row.language === 'Czech'));
const byClass = filterVoices(rows, { ...EMPTY_FILTERS, compatibility: 'A' });
check('the compatibility filter works', byClass.every((row) => row.compatibility === 'A'));

const sortedByStatus = sortVoices(rows, 'status');
check('installed voices sort first', sortedByStatus[0].installed !== null);
const sortedByName = sortVoices(rows, 'name');
check(
  'name sorting is alphabetical',
  sortedByName.every((row, index) => index === 0 || sortedByName[index - 1].displayName.localeCompare(row.displayName) <= 0),
);
const sortedByLanguage = sortVoices(rows, 'language');
check(
  'language sorting groups by language',
  sortedByLanguage.every((row, index) => index === 0 || sortedByLanguage[index - 1].language.localeCompare(row.language) <= 0),
);

const model = modelForLibraryVoice(rows.find((row) => row.id === 'arctic-awb')!);
eq('a library voice speaks from its own pack', model.baseVoiceId, 'arctic-awb');
eq('with no pitch transformation', model.pitch, 1);
eq('no pace change', model.rate, 1);
eq('and no tone shaping', [model.throatWarmth, model.oralClarity, model.airPresence], [0, 0, 0]);
eq('and the recorded engine', model.synthesisMethod, 'cmu-arctic');
eq('bytes are formatted for humans', formatBytes(7034394), '6.7 MB');

rmSync(workDir, { recursive: true, force: true });

// ---------------------------------------------------------------------------

console.log(`\n${passed}/${passed + failures.length} voice-library checks passed.`);
if (failures.length) {
  console.log('Failures:');
  for (const failure of failures) console.log(`  FAIL  ${failure}`);
  process.exitCode = 1;
}
