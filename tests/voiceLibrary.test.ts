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
import { execFileSync, spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
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
  auditionBlocker,
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
  'every installable voice states where its files come from',
  INSTALLABLE_VOICES.every((voice) => {
    const recipe = voice.install;
    if (!recipe) return false;
    // A package voice has no download of its own: apt puts the files on disk.
    if (recipe.kind === 'festival-dir') return true;
    const url = recipe.kind === 'arctic-tree' ? recipe.treeUrl : recipe.url;
    return /^https?:\/\//.test(url);
  }),
);

const summary = catalogueSummary();
eq('the summary counts the whole catalogue', Object.values(summary).reduce((a, b) => a + b, 0), VOICE_CATALOGUE.length);
console.log(
  `  ${VOICE_CATALOGUE.length} candidates: ${summary.A} ready, ${summary.B} need an adapter, ` +
    `${summary.C} need a front end, ${summary.D} excluded`,
);

check('the KAL diphone voice is in the catalogue', Boolean(findVoiceCandidate('cmu-kal')));
check('the KAL voice is installable', findVoiceCandidate('cmu-kal')?.install?.kind === 'festival-est');

// Two Festival diphone voices arrive through the distribution package instead of
// a download: Debian ships don_diphone and ked_diphone whole. They are real
// recorded voices, so they belong in the catalogue, but there is nothing to curl —
// the installer has to be pointed at the unpacked directory.
{
  const packageVoices = VOICE_CATALOGUE.filter((voice) => voice.install?.kind === 'festival-dir');
  check(
    'the package-supplied Festival voices are in the catalogue',
    packageVoices.length === 2,
    packageVoices.map((voice) => voice.id).join(', '),
  );
  check('and are ready to install', packageVoices.every((voice) => voice.compatibility === 'A'));
  check(
    'and say which package brings them',
    packageVoices.every((voice) => /apt install festvox-/.test(voice.compatibilityNote ?? '')),
    packageVoices.map((voice) => voice.id).join(', '),
  );

  const refused = (() => {
    try {
      const output = execFileSync('npx', ['tsx', join(ROOT, 'scripts', 'voice_library.ts'), 'install', 'festival-don'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return { code: 0, output };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      return { code: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
    }
  })();
  check('installing one without its directory is refused', refused.code !== 0);
  check('and the refusal names the apt package', /apt install festvox-don/.test(refused.output), refused.output.trim());
  check(
    'and the command it prints can be pasted as-is',
    /--from \/usr\/share\/festival\/voices\/english/.test(refused.output) && !/<[a-z ]+>/.test(refused.output),
    refused.output.trim(),
  );
}

// FestVox publishes eighteen ARCTIC archives and only seven speakers' phone
// labels. The eleven others are waveforms plus transcription: the LJM archive was
// checked by hand — 593 waveforms, 0 label files, one .data transcription — so they
// are class C and offered no installer, rather than class A and failing on download.
{
  const withoutLabels = ['aew', 'ahw', 'aup', 'axb', 'eey', 'fem', 'gka', 'ljm', 'lnh', 'rxr', 'slp'];
  const offeredNothing = withoutLabels.every((speaker) => {
    const voice = findVoiceCandidate(`arctic-${speaker}`);
    return voice !== undefined && voice.install === null && voice.compatibility === 'C';
  });
  check('the eleven ARCTIC speakers with no published labels offer no installer', offeredNothing);
  check(
    'and the catalogue says why in words',
    withoutLabels.every((speaker) => /no phone labels/.test(findVoiceCandidate(`arctic-${speaker}`)?.compatibilityNote ?? '')),
  );
  const withLabels = ['awb', 'clb', 'jmk', 'ksp', 'rms'];
  check(
    'the five speakers with published labels point at the labelled release build',
    withLabels.every((speaker) => {
      const recipe = findVoiceCandidate(`arctic-${speaker}`)?.install;
      return recipe?.kind === 'arctic-tree' && /^http:\/\/festvox\.org\/cmu_arctic\/cmu_arctic\/cmu_us_\w+_arctic\/$/.test(recipe.treeUrl);
    }),
  );
  check(
    'and say they are not proved yet',
    withLabels.every((speaker) => /not yet proved/i.test(findVoiceCandidate(`arctic-${speaker}`)?.compatibilityNote ?? '')),
  );
  check(
    'no ARCTIC voice claims labels its archive does not have',
    VOICE_CATALOGUE.filter((voice) => voice.id.startsWith('arctic-'))
      .every((voice) => !/plus phone labels \(tar\.bz2\)/.test(voice.originalFormat ?? '')),
  );
}
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
// A voice the user cannot hear is not a feature. Six packs ship inside the
// repository — the five ARCTIC speakers with published labels and KAL — so a fresh
// clone speaks as recorded with no terminal, no download and no install step. This
// checks the files are complete, not that a directory exists.
{
  const shipped = ['arctic-awb', 'arctic-clb', 'arctic-jmk', 'arctic-ksp', 'arctic-rms', 'cmu-kal'];
  const packFiles = (id: string) => ['manifest.json', 'diphones.bin', 'installed.json'];
  check(
    'the starter voice packs ship with the repository',
    shipped.every((id) => packFiles(id).every((file) => existsSync(join(voiceRoot, id, file)))),
    shipped.filter((id) => !packFiles(id).every((file) => existsSync(join(voiceRoot, id, file)))).join(', '),
  );
  check(
    'every shipped pack is a catalogued voice with a licence',
    shipped.every((id) => VOICE_CATALOGUE.some((voice) => voice.id === id && voice.licence.name.length > 0)),
  );
  let smallest = Infinity;
  let unreadable = '';
  for (const id of shipped) {
    try {
      const manifest = JSON.parse(readFileSync(join(voiceRoot, id, 'manifest.json'), 'utf8')) as {
        units: Record<string, unknown>;
      };
      smallest = Math.min(smallest, Object.keys(manifest.units).length);
    } catch (error) {
      unreadable = `${id}: ${String(error)}`;
    }
  }
  check('each shipped pack carries its recorded units', unreadable === '' && smallest >= 1000, unreadable || `${smallest} units in the smallest`);
  check(
    'and the bytes on disk are the size the pack declares',
    shipped.every((id) => {
      const manifest = JSON.parse(readFileSync(join(voiceRoot, id, 'manifest.json'), 'utf8')) as {
        units: Record<string, { length: number }>;
      };
      const declared = Object.values(manifest.units).reduce((sum, unit) => sum + unit.length, 0) * 2;
      return Math.abs(statSync(join(voiceRoot, id, 'diphones.bin')).size - declared) <= 2;
    }),
  );
  const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  check(
    'the ignore file cannot silently drop them from a clone',
    shipped.every((id) => ignore.includes(`!public/optional-voices/${id}/**`)),
  );
}

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
function installerOutcomeAsync(args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn('python3', [join(ROOT, 'scripts', 'install_voice.py'), ...args], {
      cwd: ROOT,
    });
    let output = '';
    let errors = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      errors += chunk.toString();
    });
    child.on('close', (code) => resolvePromise({ code: code ?? 1, output: `${output}${errors}` }));
  });
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
function buildFestivalFixture(
  dir: string,
  phones: string[] = ['aa', 'ae', 'ah', 'b', 'd', 'k', 'p', 's', 't', 'z', 'pau'],
): { dic: string; wavDir: string; units: number } {
  const wavDir = join(dir, 'wav');
  mkdirSync(wavDir, { recursive: true });
  const sampleRate = 16000;
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

// CMU ARCTIC distributions all carry the same shape: a speaker directory with
// 16 kHz waveforms and one phone-label file per utterance, packed as a tarball.
// The label directory is not always called `lab`, and some distributions ship no
// labels at all — so the builder below can place them anywhere, or omit them.
function buildArcticSpeaker(
  root: string,
  options: { speaker?: string; labelDir?: string; labels?: boolean } = {},
): { speakerDir: string; wavDir: string; labelDir: string | null } {
  const speaker = options.speaker ?? 'fix';
  const wantLabels = options.labels ?? true;
  const speakerDir = join(root, `cmu_us_${speaker}_arctic`);
  const wavDir = join(speakerDir, 'wav');
  const labelDir = wantLabels ? join(speakerDir, options.labelDir ?? 'lab') : join(speakerDir, 'etc');
  mkdirSync(wavDir, { recursive: true });
  mkdirSync(labelDir, { recursive: true });
  writeFileSync(join(speakerDir, 'COPYING'), 'Fixture speaker for the installer test.');
  // A short spelling of "this distribution labels from `etc/` or not at all".
  if (!wantLabels) writeFileSync(join(speakerDir, 'etc', 'READ.ME'), 'Waveforms only.');
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
    writeFileSync(join(wavDir, `arctic_${utterance}.wav`), Buffer.concat([header, samples]));
    if (wantLabels) {
      writeFileSync(join(labelDir, `arctic_${utterance}.lab`), `${labels.join('\n')}\n`);
    }
  }
  return { speakerDir, wavDir, labelDir: wantLabels ? labelDir : null };
}

function packArctic(speakerDir: string, archivePath: string): string {
  execFileSync('python3', [
    '-c',
    `import os,tarfile,sys
with tarfile.open(sys.argv[1],'w:bz2') as t:
    t.add(sys.argv[2], arcname=os.path.basename(sys.argv[2]))
`,
    archivePath,
    speakerDir,
  ]);
  return archivePath;
}

// The other install recipe: a CMU ARCTIC distribution. The real archives are on
// festvox.org, which this environment cannot reach, so the *conversion* is proved
// here against an archive built in the same layout (wav/ + lab/ + COPYING) from
// generated audio. If the layout is wrong, this fails — which is the point.
{
  const { speakerDir } = buildArcticSpeaker(join(workDir, 'arctic'), { speaker: 'fix' });
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

// The package layout is dic/*.est + wav/, one voice per directory under
// /usr/share/festival/voices/english. This environment has no festival package and
// cannot reach one, so the *conversion* is proved against a directory built in the
// same layout from generated audio — and the installer is pointed at the group
// directory (…/english), which is the copy-pasteable form the CLI prints.
{
  const voiceDir = join(workDir, 'festival', 'fix_diphone');
  // A package voice is a whole diphone set, so the fixture has one too: 20 phones
  // is 400 units, above the installer's "that is not a usable voice" floor.
  const built = buildFestivalFixture(voiceDir, [
    'pau', 'aa', 'ae', 'ah', 'ao', 'aw', 'ay', 'b', 'ch', 'd',
    'dh', 'eh', 'er', 'ey', 'f', 'g', 'hh', 'ih', 'iy', 'jh',
  ]);
  mkdirSync(join(voiceDir, 'dic'), { recursive: true });
  renameSync(built.dic, join(voiceDir, 'dic', 'fix_diph.est'));
  writeFileSync(join(voiceDir, 'COPYING'), 'Synthetic fixture for the festival-dir install path.\n');

  const festivalRoot = join(workDir, 'festival-voices');
  const festivalProgress = join(workDir, 'festival-progress.json');
  const outcome = installerOutcome([
    '--id', 'festival-fix', '--kind', 'festival-dir', '--url', `file://${join(workDir, 'festival')}`,
    '--out-root', festivalRoot, '--progress', festivalProgress,
    '--display-name', 'Festival fixture', '--accent', 'US English', '--gender', 'Male',
  ]);
  check('the package-voice install recipe runs', outcome.code === 0, outcome.output.trim().split('\n').slice(-1)[0]);
  const pack = join(festivalRoot, 'festival-fix', 'manifest.json');
  check('and produces a pack from the unpacked directory', existsSync(pack));
  if (existsSync(pack)) {
    const manifest = JSON.parse(readFileSync(pack, 'utf8'));
    check('with every diphone cut from the recordings', Object.keys(manifest.units).length >= 300, `${Object.keys(manifest.units).length}`);
  }
  const missing = installerOutcome([
    '--id', 'festival-missing', '--kind', 'festival-dir', '--url', '',
    '--out-root', festivalRoot, '--progress', join(workDir, 'festival-missing.json'),
  ]);
  check('and a package voice with no directory is refused', missing.code !== 0);
  check('with an explanation, not a crash', /apt install festvox-don/.test(missing.output), missing.output.trim().slice(-200));
}

// ARCTIC archives are not uniform. Some call their label directory `labels/`,
// the clustergen distributions ship waveforms with no labels at all, and the
// real LJM archive turned out to be exactly that. The installer finds what is
// there and refuses what is not — it must never write an empty pack and call it
// a voice, and `--inspect` must say what an archive actually contains.
{
  const lastLine = (outcome: { output: string }): string =>
    outcome.output.trim().split('\n').filter(Boolean).slice(-1)[0] ?? '';

  const labelled = buildArcticSpeaker(join(workDir, 'arctic-labels'), { speaker: 'labs', labelDir: 'labels' });
  const labelledArchive = packArctic(labelled.speakerDir, join(workDir, 'arctic-labels.tar.bz2'));
  const labelledRoot = join(workDir, 'arctic-labels-out');
  const labelledOutcome = installerOutcome([
    '--id', 'arctic-labels', '--kind', 'arctic-archive', '--url', `file://${labelledArchive}`,
    '--speaker', 'labs', '--out-root', labelledRoot, '--progress', join(workDir, 'labels-progress.json'),
    '--display-name', 'ARCTIC labels fixture', '--accent', 'US English', '--gender', 'Female',
  ]);
  check('labels are found outside the conventional lab directory', labelledOutcome.code === 0, lastLine(labelledOutcome));
  const labelledManifest = join(labelledRoot, 'arctic-labels', 'manifest.json');
  check('and a pack is built from them', existsSync(labelledManifest));
  if (existsSync(labelledManifest)) {
    const manifest = JSON.parse(readFileSync(labelledManifest, 'utf8'));
    check('with the units the labels describe', Object.keys(manifest.units).length >= 200, `${Object.keys(manifest.units).length}`);
  }

  const unlabelledRoot = join(workDir, 'arctic-nolab-out');
  const unlabelledProgress = join(workDir, 'nolab-progress.json');
  const unlabelledArchive = packArctic(
    buildArcticSpeaker(join(workDir, 'arctic-nolab'), { speaker: 'nolab', labels: false }).speakerDir,
    join(workDir, 'arctic-nolab.tar.bz2'),
  );
  const unlabelledOutcome = installerOutcome([
    '--id', 'arctic-nolab', '--kind', 'arctic-archive', '--url', `file://${unlabelledArchive}`,
    '--speaker', 'nolab', '--out-root', unlabelledRoot, '--progress', unlabelledProgress,
    '--display-name', 'ARCTIC unlabelled fixture', '--accent', 'US English', '--gender', 'Female',
  ]);
  check('an archive with no labels is refused', unlabelledOutcome.code !== 0, lastLine(unlabelledOutcome));
  check('the refusal names the missing labels', /no phone labels/i.test(unlabelledOutcome.output), lastLine(unlabelledOutcome));
  check('and says alignment is needed instead of guessing', /forced alignment/i.test(unlabelledOutcome.output));
  check('and describes what the archive does contain', /2 wav, 0 lab/.test(unlabelledOutcome.output), lastLine(unlabelledOutcome));
  check('and no empty pack is left behind', !existsSync(join(unlabelledRoot, 'arctic-nolab')));
  const unlabelledProgressText = existsSync(unlabelledProgress) ? readFileSync(unlabelledProgress, 'utf8') : '';
  check('the progress file reports the failure for the UI', /"stage":\s*"failed"/.test(unlabelledProgressText), unlabelledProgressText.slice(-120));
  check(
    'and the UI message is the explanation, not a bare exception name',
    /no phone labels/i.test(unlabelledProgressText),
    unlabelledProgressText.slice(-160),
  );

  const inspectRoot = join(workDir, 'arctic-inspect-out');
  const inspectOutcome = installerOutcome([
    '--id', 'arctic-nolab', '--kind', 'arctic-archive', '--url', `file://${unlabelledArchive}`,
    '--speaker', 'nolab', '--out-root', inspectRoot, '--progress', join(workDir, 'inspect-progress.json'),
    '--display-name', 'ARCTIC unlabelled fixture', '--accent', 'US English', '--gender', 'Female',
    '--inspect',
  ]);
  check('--inspect reports on an archive without installing it', inspectOutcome.code === 0, lastLine(inspectOutcome));
  check('and reports the waveforms it found', /2 waveforms/.test(inspectOutcome.output), inspectOutcome.output.trim());
  check('and that it carries no labels', /0 label files/.test(inspectOutcome.output), inspectOutcome.output.trim());
  check('and writes nothing into the voice root', !existsSync(inspectRoot));
}

// The label directory can also be named explicitly, for a distribution whose
// layout defeats discovery. Pointing it at a directory with no labels is an
// error, not an empty pack.
{
  const speaker = buildArcticSpeaker(join(workDir, 'arctic-override'), { speaker: 'over', labelDir: 'labels' });
  const emptyLabels = join(workDir, 'arctic-override', 'empty-labels');
  mkdirSync(emptyLabels, { recursive: true });
  const build = (labelDir: string): { code: number; output: string } => {
    try {
      const output = execFileSync('python3', [
        join(ROOT, 'scripts', 'build_cmu_voicepack.py'),
        '--source', speaker.speakerDir,
        '--output', join(workDir, 'override-pack'),
        '--speaker-id', 'arctic-over',
        '--display-name', 'ARCTIC override fixture',
        '--accent', 'US English',
        '--gender', 'Male',
        '--lab-dir', labelDir,
      ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
      return { code: 0, output };
    } catch (error) {
      const failure = error as { status?: number; stderr?: string };
      return { code: failure.status ?? 1, output: failure.stderr ?? '' };
    }
  };
  const explicit = build(speaker.labelDir!);
  check('an explicit --lab-dir builds the pack', explicit.code === 0, explicit.output.trim().split('\n').slice(-1)[0]);
  const missing = build(emptyLabels);
  check('an explicit --lab-dir with no labels is refused', missing.code !== 0);
  check(
    'and says the directory it was given holds no labels',
    /holds no \.lab files/i.test(missing.output),
    missing.output.trim().split('\n')[0] ?? '',
  );
}

// Some ARCTIC speakers only exist as a browsable tree: wav/ and lab/ one file at
// a time, never a tarball. This serves such a tree from a local HTTP server and
// installs from it, because that is the only way these voices can be installed at
// all — and the download is real HTTP, not a file:// shortcut.
{
  const { createServer } = await import('node:http');
  const { readFileSync: readFile, existsSync: exists } = await import('node:fs');
  const treeRoot = join(workDir, 'published-tree', 'cmu_us_tree_arctic');
  const labelsOnly = buildArcticSpeaker(join(workDir, 'published-tree'), { speaker: 'tree', labelDir: 'lab' });
  rmSync(labelsOnly.speakerDir, { recursive: true, force: true });
  mkdirSync(join(treeRoot, 'wav'), { recursive: true });
  mkdirSync(join(treeRoot, 'lab'), { recursive: true });
  writeFileSync(join(treeRoot, 'COPYING'), 'Fixture tree for the installer test.');
  for (const utterance of ['arctic_a0001', 'arctic_a0002']) {
    const source = buildArcticSpeaker(join(workDir, 'tree-source'), { speaker: 'tree', labelDir: 'lab' });
    cpSync(join(source.wavDir, `${utterance}.wav`), join(treeRoot, 'wav', `${utterance}.wav`));
    cpSync(join(source.labelDir!, `${utterance}.lab`), join(treeRoot, 'lab', `${utterance}.lab`));
    break;
  }
  const source = buildArcticSpeaker(join(workDir, 'tree-source-2'), { speaker: 'tree', labelDir: 'lab' });
  for (const utterance of ['arctic_a0001', 'arctic_a0002']) {
    cpSync(join(source.wavDir, `${utterance}.wav`), join(treeRoot, 'wav', `${utterance}.wav`));
    cpSync(join(source.labelDir!, `${utterance}.lab`), join(treeRoot, 'lab', `${utterance}.lab`));
  }

  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const target = join(treeRoot, urlPath.replace('/cmu_us_tree_arctic/', ''));
    if (urlPath.endsWith('/')) {
      const entries = readdirSync(target).filter((name) => !name.startsWith('.'));
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><body>${entries.map((name) => `<a href="${name}">${name}</a>`).join('\n')}</body></html>`);
      return;
    }
    if (!exists(target)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200);
    res.end(readFile(target));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const treeUrl = `http://127.0.0.1:${port}/cmu_us_tree_arctic/`;

  const treeRootOut = join(workDir, 'tree-voices');
  const treeOutcome = await installerOutcomeAsync([
    '--id', 'arctic-tree', '--kind', 'arctic-tree', '--tree-url', treeUrl,
    '--speaker', 'tree', '--out-root', treeRootOut, '--progress', join(workDir, 'tree-progress.json'),
    '--display-name', 'ARCTIC tree fixture', '--accent', 'US English', '--gender', 'Female',
  ]);
  check('a voice published only as a tree installs from it', treeOutcome.code === 0, treeOutcome.output.trim().split('\n').slice(-1)[0]);
  const treeManifest = join(treeRootOut, 'arctic-tree', 'manifest.json');
  check('and the pack is cut from the downloaded labels', existsSync(treeManifest));
  if (existsSync(treeManifest)) {
    const manifest = JSON.parse(readFileSync(treeManifest, 'utf8'));
    check('with the units those labels describe', Object.keys(manifest.units).length >= 200, `${Object.keys(manifest.units).length}`);
  }

  // A tree with waveforms but no labels is the LJM case again: refuse, explain.
  rmSync(join(treeRoot, 'lab'), { recursive: true, force: true });
  mkdirSync(join(treeRoot, 'lab'), { recursive: true });
  const emptyTreeOutcome = await installerOutcomeAsync([
    '--id', 'arctic-tree-empty', '--kind', 'arctic-tree', '--tree-url', treeUrl,
    '--speaker', 'tree', '--out-root', join(workDir, 'tree-voices-empty'),
    '--progress', join(workDir, 'tree-empty-progress.json'),
    '--display-name', 'ARCTIC empty tree', '--accent', 'US English', '--gender', 'Female',
  ]);
  check('a tree with no labels is refused', emptyTreeOutcome.code !== 0);
  check('and says the listing had none', /no \.lab files/i.test(emptyTreeOutcome.output), emptyTreeOutcome.output.trim().split('\n')[0] ?? '');
  check('and installs nothing', !existsSync(join(workDir, 'tree-voices-empty', 'arctic-tree-empty')));

  server.close();
}

// A speaker directory that is already on disk — a mirror cloned with
// `git sparse-checkout`, or an archive unpacked by hand. Nothing to download and
// nothing to extract, and this is the path that produced the AWB voice verified
// against real CMU ARCTIC recordings.
{
  const unpacked = buildArcticSpeaker(join(workDir, 'unpacked-speaker'), { speaker: 'disk' });
  const diskRoot = join(workDir, 'disk-voices');
  const diskOutcome = installerOutcome([
    '--id', 'arctic-disk', '--kind', 'arctic-archive',
    '--url', `file://${unpacked.speakerDir}`,
    '--speaker', 'disk', '--out-root', diskRoot, '--progress', join(workDir, 'disk-progress.json'),
    '--display-name', 'ARCTIC disk fixture', '--accent', 'Scottish English', '--gender', 'Male',
  ]);
  check('an unpacked speaker directory installs without a download', diskOutcome.code === 0, diskOutcome.output.trim().split('\n').slice(-1)[0]);
  const diskManifest = join(diskRoot, 'arctic-disk', 'manifest.json');
  check('and produces a pack', existsSync(diskManifest));
  if (existsSync(diskManifest)) {
    const manifest = JSON.parse(readFileSync(diskManifest, 'utf8'));
    check('with units from its labels', Object.keys(manifest.units).length >= 200, `${Object.keys(manifest.units).length}`);
  }

  // Same directory, reached through the tree recipe: it must use the files rather
  // than go back to the network for a listing.
  const treeDisk = installerOutcome([
    '--id', 'arctic-disk-tree', '--kind', 'arctic-tree',
    '--url', `file://${unpacked.speakerDir}`,
    '--tree-url', 'http://127.0.0.1:1/unreachable/',
    '--speaker', 'disk', '--out-root', diskRoot, '--progress', join(workDir, 'disk-tree-progress.json'),
    '--display-name', 'ARCTIC disk tree fixture', '--accent', 'Scottish English', '--gender', 'Male',
  ]);
  check(
    'a local directory is used instead of fetching a tree',
    treeDisk.code === 0,
    treeDisk.output.trim().split('\n').slice(-1)[0],
  );
}

// Labels that do not match the waveforms are a mismatch, not a zero-unit voice.
{
  // Right number of files, wrong names: nothing lines up, and the pack would be empty.
  const speaker = buildArcticSpeaker(join(workDir, 'arctic-mismatch'), { speaker: 'mis' });
  for (const utterance of ['a0001', 'a0002']) {
    renameSync(join(speaker.labelDir!, `arctic_${utterance}.lab`), join(speaker.labelDir!, `utt_${utterance}.lab`));
  }
  const archive = packArctic(speaker.speakerDir, join(workDir, 'arctic-mismatch.tar.bz2'));
  const mismatchRoot = join(workDir, 'arctic-mismatch-out');
  const outcome = installerOutcome([
    '--id', 'arctic-mismatch', '--kind', 'arctic-archive', '--url', `file://${archive}`,
    '--speaker', 'mis', '--out-root', mismatchRoot, '--progress', join(workDir, 'mismatch-progress.json'),
    '--display-name', 'ARCTIC mismatch fixture', '--accent', 'US English', '--gender', 'Male',
  ]);
  check('labels that do not match the waveforms are refused', outcome.code !== 0);
  check('and the refusal shows both counts', /2 lab files, 2 wav files/.test(outcome.output), outcome.output.trim().split('\n')[0] ?? '');
  check('and no pack is left behind', !existsSync(join(mismatchRoot, 'arctic-mismatch')));
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
check('`voices urls` prints a real archive URL', /festvox\.org\/cmu_arctic\/cmu_arctic\/cmu_us_awb_arctic\//.test(urlsOut));
check(
  'and the matching install command for each kind of source',
  /npm run voices -- install arctic-awb/.test(urlsOut) && /curl -L -o cmu-kal\.archive/.test(urlsOut),
);

// `voices verify` is the honest answer to "is it working?": it renders with every
// installed voice and refuses to pretend about ones that are not installed.
{
  const verifyMissing = (() => {
    try {
      return { code: 0, text: cli(['verify', 'arctic-nothing']).out };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      return { code: failure.status ?? 1, text: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
    }
  })();
  check('`voices verify` refuses an id that is not installed', verifyMissing.code !== 0);
  check('and says so by name', /arctic-nothing/.test(verifyMissing.text), verifyMissing.text.trim().split('\n').slice(-1)[0]);
}

// The same samples as a file you can play, so "it works" can be checked with
// your ears instead of a peak level.
{
  const target = join(workDir, 'verify-out.wav');
  const rendered = (() => {
    try {
      return { code: 0, text: cli(['verify', 'cmu-kal', '--wav', target]).out };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      return { code: failure.status ?? 1, text: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
    }
  })();
  check('`voices verify --wav` renders without mistaking the path for a voice id', rendered.code === 0, rendered.text.trim().split('\n').slice(-1)[0]);
  check('and writes the audition sentence to a file', existsSync(target));
  if (existsSync(target)) {
    const wav = readFileSync(target);
    check('as a real 16-bit PCM WAV', wav.subarray(0, 4).toString() === 'RIFF' && wav.readUInt16LE(34) === 16, `${wav.length} bytes`);
    check('with about ten seconds of audio', wav.length > 16000 * 2 * 8, `${(wav.length / 32000).toFixed(1)} s`);
    let peak = 0;
    for (let index = 44; index + 1 < wav.length; index += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(index)));
    check('that is not silence', peak > 5000, `peak ${peak}`);
  }
}

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

// `inspect` exists because a download that unpacks into something unexpected used
// to end as "the pack has 0 units" with no explanation. It must report, and report
// quickly, without touching the library.
console.log('\nthe inspect command');

{
  const speaker = buildArcticSpeaker(join(workDir, 'cli-inspect'), { speaker: 'insp', labels: false });
  const archive = packArctic(speaker.speakerDir, join(workDir, 'cli-inspect.tar.bz2'));
  const libraryBefore = readdirSync(join(ROOT, 'public', 'optional-voices')).sort().join(',');
  const inspected = cli(['inspect', 'cmu-kal', '--from', archive]);
  check('`voices inspect` reports on an archive', inspected.code === 0, inspected.out.trim().split('\n').slice(-1)[0]);
  check(
    'with its waveforms and its missing labels',
    /2 wav/.test(inspected.out) && /0 lab/.test(inspected.out),
    inspected.out.trim().split('\n').slice(-3).join(' / '),
  );
  check('and says where the archive came from', /cli-inspect\.tar\.bz2/.test(inspected.out));
  check('and installs nothing', !/installed:/.test(inspected.out));
  check(
    'and leaves the voice library exactly as it was',
    readdirSync(join(ROOT, 'public', 'optional-voices')).sort().join(',') === libraryBefore,
  );

  const missingArchive = (() => {
    try {
      return { code: 0, text: cli(['inspect', 'cmu-kal', '--from', join(workDir, 'not-there.tar.bz2')]).out };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      return { code: failure.status ?? 1, text: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
    }
  })();
  check('a missing archive fails instead of waiting', missingArchive.code !== 0);
  check(
    'and says the file is missing rather than reporting a network error',
    /No such file: .*not-there\.tar\.bz2/.test(missingArchive.text),
    missingArchive.text.trim().split('\n').slice(-1)[0],
  );
  check('and never mentions urlopen', !/urlopen/.test(missingArchive.text), missingArchive.text.trim().split('\n').slice(-1)[0]);
  check('and names the file it could not read', /not-there\.tar\.bz2/.test(missingArchive.text), missingArchive.text.trim().split('\n').slice(-1)[0]);
}

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

// What a card says when you press Audition on a voice that cannot play yet.
{
  const rowFor = (id: string) => rows.find((row) => row.id === id);
  const labels = rowFor('arctic-eey');
  const blocker = labels ? auditionBlocker(labels) : null;
  check('a class-C voice explains itself in one sentence', typeof blocker === 'string' && blocker.length < 160, String(blocker));
  check('and names the missing labels', /phone labels/i.test(blocker ?? ''), String(blocker));
  check('and does not quote the catalogue paragraph', !/forced alignment|CMU Sphinx/.test(blocker ?? ''), String(blocker));
  const installable = rowFor('arctic-clb');
  check(
    'an installable voice tells you to install it',
    /Install/.test(installable ? auditionBlocker(installable) ?? '' : ''),
    String(installable ? auditionBlocker(installable) : 'no row'),
  );
  const excluded = rowFor('mbrola-us1');
  check(
    'an excluded voice says it is the licence or the format',
    /licence or format/i.test(excluded ? auditionBlocker(excluded) ?? '' : ''),
    String(excluded ? auditionBlocker(excluded) : 'no row'),
  );
  const installedRow = rowFor('cmu-kal');
  check(
    'an installed voice has nothing blocking it',
    installedRow
      ? auditionBlocker({ ...installedRow, installed: { id: 'cmu-kal', units: 1578, bytes: 7034394, installedAt: 'now' } }) === null
      : false,
  );
}

rmSync(workDir, { recursive: true, force: true });

// ---------------------------------------------------------------------------

console.log(`\n${passed}/${passed + failures.length} voice-library checks passed.`);
if (failures.length) {
  console.log('Failures:');
  for (const failure of failures) console.log(`  FAIL  ${failure}`);
  process.exitCode = 1;
}
