#!/usr/bin/env tsx
/**
 * The voice library, from a terminal.
 *
 *   npm run voices -- list
 *   npm run voices -- install arctic-awb
 *   npm run voices -- install --class A          # every ready voice, one at a time
 *   npm run voices -- install cmu-kal --from ~/Downloads/diphone_synthesizer.tar.gz
 *   npm run voices -- remove cmu-kal
 *   npm run voices -- urls --class A             # the curl commands, if you prefer
 *
 * Why this exists: the browser cannot download a voice archive — festvox.org and
 * GitHub send no CORS headers — and in some environments the server cannot reach
 * them either. A terminal can. This command uses the catalogue in
 * `src/data/voiceCatalogue.ts` as its only source of truth and runs the same
 * installer the server runs, so what it produces is byte-identical to what the
 * library installs.
 *
 * It is deliberately thin: resolve an id to a recipe, check the guard, spawn
 * `scripts/install_voice.py`, echo its progress. The safety rules (protected base
 * voices, atomic install, validation) live in one place and are not re-implemented
 * here.
 *
 * Original Vocalis code.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  INSTALLABLE_VOICES,
  VOICE_CATALOGUE,
  catalogueSummary,
  findVoiceCandidate,
  type VoiceCandidate,
} from '../src/data/voiceCatalogue';
import {
  PROTECTED_VOICE_IDS,
  installedVoiceDir,
  isProtectedVoiceId,
} from '../src/utils/voiceLibraryPaths';
import { pythonInstallHint, resolvePythonExecutable } from '../src/utils/pythonRuntime';
import {
  registerOptionalVoiceSource,
  unregisterOptionalVoiceSource,
} from '../src/utils/optionalVoicePacks';
import { AUDITION_PHRASE, modelForLibraryVoice } from '../src/utils/voiceLibrary';
import { initializeLocalSpeechEngine, renderSpeech, PRESET_VOICE_MODELS } from '../src/utils/naturalVoiceEngine';
import { releaseVoicePack } from '../src/utils/cmuDiphoneSynthesizer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VOICE_ROOT = resolve(ROOT, 'public', 'optional-voices');
const PROGRESS_ROOT = resolve(ROOT, 'var', 'voice-progress');

interface InstalledInfo {
  units?: number;
  bytes?: number;
  installedAt?: string;
}

function installedInfo(id: string): InstalledInfo | null {
  const dir = installedVoiceDir(VOICE_ROOT, id);
  if (!dir) return null;
  const file = resolve(dir, 'installed.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as InstalledInfo;
  } catch {
    return null;
  }
}

function humanBytes(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `~` is a shell convention, not a path: expand it before resolving. */
export function expandHome(candidate: string): string {
  if (candidate === '~') return homedir();
  if (candidate.startsWith('~/') || candidate.startsWith('~\\')) {
    return resolve(homedir(), candidate.slice(2));
  }
  return resolve(candidate);
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value + ' '.repeat(width - value.length);
}

function printUsage(): void {
  console.log(`Usage: npm run voices -- <command> [options]

  list [--class A|B|C|D] [--language English] [--ready] [--installed]
        Show the catalogue, what is installed, and why the rest is not.

  install <id...> [--from <archive>]
        Download, convert and install one or more voices. --from installs a
        voice from an archive — or, for ARCTIC voices, an already unpacked
        speaker directory — instead of downloading it.

  install --class A
        Install every voice in that compatibility class, one at a time.

  remove <id...>
        Delete installed voices. The protected base voices are refused.

  inspect <id> [--from <archive>]
        Download and unpack a voice's archive and report what it contains —
        waveforms, phone labels, text — without converting or installing anything.
        Use it first when an install fails.

  verify [<id...>] [--wav path.wav]
        Render a fixed sentence with every installed voice and print what came
        out: length, peak level, how many recorded units it used, how many
        stand-ins. This is the answer to "is it actually working?". With --wav
        the same samples are written to a file you can play, one file per voice
        when several are installed.

  urls [--class A|B]
        Print the curl commands for the archives, for people who would rather
        fetch by hand.

The protected base voices (${PROTECTED_VOICE_IDS.join(', ')}) can never be installed, replaced or removed.

Requirements: Node.js 18.18 or newer and Python 3 (the installer is a Python
script; it is found automatically as python3, python or py).
Run this from the repository root, and keep the \`--\` before the command:
  npm run voices -- list --ready
`);
}

function describe(voice: VoiceCandidate): string {
  const state = installedInfo(voice.id)
    ? `installed, ${humanBytes(installedInfo(voice.id)?.bytes)}`
    : voice.install
      ? 'ready'
      : 'no installer';
  return [
    pad(voice.id, 20),
    pad(`${voice.compatibility}`, 2),
    pad(voice.language, 14),
    pad(voice.accent, 30),
    pad(voice.gender, 7),
    pad(voice.downloadLabel, 8),
    state,
  ].join(' ');
}

function list(args: string[]): void {
  const classFilter = valueOf(args, '--class');
  const languageFilter = valueOf(args, '--language');
  const readyOnly = args.includes('--ready');
  const installedOnly = args.includes('--installed');

  const rows = VOICE_CATALOGUE.filter((voice) => {
    if (classFilter && voice.compatibility !== classFilter.toUpperCase()) return false;
    if (languageFilter && voice.language.toLowerCase() !== languageFilter.toLowerCase()) return false;
    if (readyOnly && !voice.install) return false;
    if (installedOnly && !installedInfo(voice.id)) return false;
    return true;
  });

  console.log(
    `${pad('id', 20)} ${pad('c', 2)} ${pad('language', 14)} ${pad('accent', 30)} ${pad('gender', 7)} ${pad('size', 8)} status`,
  );
  console.log('-'.repeat(110));
  for (const voice of rows) console.log(describe(voice));

  const summary = catalogueSummary();
  const installable = INSTALLABLE_VOICES.length;
  console.log(
    `\n${rows.length} shown of ${VOICE_CATALOGUE.length} investigated · ${summary.A} ready · ` +
      `${summary.B} need an adapter · ${summary.C} need labels or a language front end · ${summary.D} excluded ` +
      `· ${installable} installable · ${readdirSync(VOICE_ROOT, { withFileTypes: true }).filter((e) => e.isDirectory()).length} installed`,
  );
  if (rows.some((voice) => !voice.install)) {
    console.log('Run `npm run voices -- list --ready` to see only the ones that can be installed now.');
  }
}

function valueOf(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function positionals(args: string[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith('--')) {
      // Flags that carry a value: skip it so it is never mistaken for a voice id.
      if (['--from', '--class', '--language', '--wav', '--out', '--url', '--kind', '--speaker'].includes(arg)) {
        index += 1;
      }
      continue;
    }
    out.push(arg);
  }
  return out;
}

function installerArgs(voice: VoiceCandidate, archiveOverride?: string): string[] | null {
  const recipe = voice.install;
  if (!recipe) return null;
  const args = [
    resolve(ROOT, 'scripts', 'install_voice.py'),
    '--id', voice.id,
    '--kind', recipe.kind,
    '--url',
    archiveOverride
      ? pathToFileURL(expandHome(archiveOverride)).href
      : recipe.kind === 'arctic-tree'
        ? recipe.treeUrl
        : recipe.kind === 'festival-dir'
          ? ''
          : recipe.url,
    '--out-root', VOICE_ROOT,
    '--progress', resolve(PROGRESS_ROOT, `${voice.id}.json`),
    '--display-name', voice.displayName,
    '--accent', voice.accent,
    '--gender', voice.gender,
    '--language', voice.language,
    '--source', voice.sourceProject,
    '--source-url', voice.sourceUrl,
    '--attribution', voice.licence.attribution,
    '--licence', voice.licence.name,
  ];
  if (recipe.kind === 'arctic-archive') {
    args.push('--speaker', recipe.speaker);
  } else if (recipe.kind === 'arctic-tree') {
    args.push('--speaker', recipe.speaker, '--tree-url', recipe.treeUrl);
  } else if (recipe.kind === 'festival-est') {
    args.push('--dic', recipe.dicPath, '--wav', recipe.wavPath);
  }
  return args;
}

// The installer reports each stage through a progress file. Both `install` and
// `inspect` print it: a 45 MB download that prints nothing looks like a hang, and
// the first thing anyone does with a silent terminal is kill it.
function watchProgress(progressFile: string): { stop: () => void; lastLine: () => string } {
  let last = '';
  const timer = setInterval(() => {
    if (!existsSync(progressFile)) return;
    try {
      const progress = JSON.parse(readFileSync(progressFile, 'utf-8')) as {
        stage?: string;
        message?: string;
      };
      const line = `${progress.stage ?? ''}: ${progress.message ?? ''}`.trim();
      if (!line || line === last) return;
      last = line;
      for (const part of line.replace(/^:\s*/, '').split('\n')) {
        if (part.trim()) console.log(`  … ${part.trim()}`);
      }
    } catch {
      // The installer renames the file into place; the next tick will read it.
    }
  }, 400);
  timer.unref?.();
  return { stop: () => clearInterval(timer), lastLine: () => last };
}

function runInstaller(voice: VoiceCandidate, archiveOverride?: string): Promise<number> {
  const args = installerArgs(voice, archiveOverride);
  const recipe = voice.install;
  if (!args || !recipe) return Promise.resolve(1);
  if (recipe.kind === 'festival-dir' && !archiveOverride) {
    console.error(
      `\n▸ ${voice.displayName}  (${voice.id})\n` +
        '  This voice arrives with a distribution package, not a download.\n' +
        `  Install it first:  ${voice.install === recipe ? 'sudo apt install festvox-' : ''}` +
        `${voice.id === 'festival-don' ? 'don' : 'kdlpc16k'}\n` +
        `  Then:  npm run voices -- install ${voice.id} --from /usr/share/festival/voices/english\n`,
    );
    return Promise.resolve(1);
  }
  const python = resolvePythonExecutable();
  if (!python) {
    console.error(`  ✗ ${pythonInstallHint()}`);
    return Promise.resolve(1);
  }

  const progressFile = resolve(PROGRESS_ROOT, `${voice.id}.json`);
  mkdirSync(PROGRESS_ROOT, { recursive: true });
  rmSync(progressFile, { force: true });

  console.log(`\n▸ ${voice.displayName}  (${voice.id})`);
  console.log(`  ${archiveOverride ? expandHome(archiveOverride) : recipe.kind === 'arctic-tree' ? recipe.treeUrl : recipe.url}`);
  console.log(`  licence: ${voice.licence.name}`);

  return new Promise((resolvePromise) => {
    const child = spawn(python, args, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const progress = watchProgress(progressFile);
    const lastLine = progress.lastLine;

    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      progress.stop();
      if (code === 0) {
        const info = installedInfo(voice.id);
        console.log(`  ✓ installed: ${info?.units ?? '?'} recorded units, ${humanBytes(info?.bytes)}`);
      } else {
        // The installer explains itself; print its explanation, not just "failed".
        // The installer's last line is the explanation; never invent one.
        const lines = stderr
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        const explanation =
          (lines.length ? lines[lines.length - 1].replace(/^install failed:\s*/, '') : '') ||
          (lastLine().includes('failed:') ? lastLine().replace(/.*failed: /, '') : 'The installer failed without saying why.');
        console.error(`  ✗ ${explanation}`);
      }
      resolvePromise(code ?? 1);
    });
  });
}

/**
 * Speak a fixed sentence with every installed voice and report what came out.
 *
 * "It downloaded" is not evidence; neither is "the card says installed". This
 * renders the same sentence each voice auditions with and prints the numbers a
 * listener would otherwise have to guess at: how long the audio is, how loud, how
 * many of its units were recorded ones, and whether any stand-in was used.
 */
/**
 * Write rendered samples as a plain 16-bit PCM WAV, the same format the export
 * uses. Written here rather than through the browser encoder because `verify` runs
 * in a terminal, where there is no AudioBuffer to convert.
 */
function writeWav(target: string, samples: Float32Array, sampleRate: number): void {
  const data = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    data.writeInt16LE(Math.round(value * 32767), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
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
  header.writeUInt32LE(data.length, 40);
  mkdirSync(dirname(resolve(target)), { recursive: true });
  writeFileSync(target, Buffer.concat([header, data]));
}

async function verify(args: string[]): Promise<number> {
  const installed = VOICE_CATALOGUE.filter((voice) => installedInfo(voice.id));
  const wanted = positionals(args);
  const rows = wanted.length ? installed.filter((voice) => wanted.includes(voice.id)) : installed;
  if (!rows.length) {
    console.error(
      wanted.length
        ? `Nothing to verify: ${wanted.join(', ')} ${wanted.length === 1 ? 'is' : 'are'} not installed.`
        : 'Nothing is installed yet. Try `npm run voices -- install cmu-kal`.',
    );
    return 1;
  }

  // The engine fetches its dictionary from the page in a browser; in a terminal
  // there is no origin, so relative requests get a 404 instead of an exception.
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('/')) return Promise.resolve(new Response('', { status: 404 }));
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;

  // The engine reports a missing browser dictionary with console.warn; that is
  // expected in a terminal, so hold both channels and restore them at the end.
  const realConsoleError = console.error;
  const realConsoleWarn = console.warn;
  const collected: unknown[] = [];
  const collect = (...parts: unknown[]) => {
    collected.push(parts);
  };
  console.error = collect;
  console.warn = collect;

  let silent = 0;
  console.log(`${'id'.padEnd(20)} ${'seconds'.padStart(8)} ${'peak'.padStart(6)} ${'units used'.padStart(11)} ${'stand-ins'.padStart(10)}  verdict`);
  for (const voice of rows) {
    const dir = installedVoiceDir(VOICE_ROOT, voice.id);
    if (!dir) continue;
    registerOptionalVoiceSource({
      id: voice.id,
      displayName: voice.displayName,
      loadPack: async () => {
        const manifestPath = resolve(dir, 'manifest.json');
        const audioPath = resolve(dir, 'diphones.bin');
        if (!existsSync(manifestPath) || !existsSync(audioPath)) {
          throw new Error(`${voice.id} is missing its manifest or its audio.`);
        }
        const audio = readFileSync(audioPath);
        return {
          manifest: JSON.parse(readFileSync(manifestPath, 'utf-8')),
          audio: audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer,
        };
      },
    });

    const model = {
      ...PRESET_VOICE_MODELS[0],
      id: `${voice.id}-verify`,
      name: voice.displayName,
      baseVoiceId: voice.id,
      pitch: 1,
      rate: 1,
      volume: 1,
      toneStyle: 'natural' as const,
      throatWarmth: 0,
      oralClarity: 0,
      airPresence: 0,
    };

    try {
      // The dictionary is fetched by the browser; in a terminal it is skipped and the
      // render falls back to its built-in pronunciation rules.
      await initializeLocalSpeechEngine(model).catch(() => undefined);
      const spoken = await renderSpeech(AUDITION_PHRASE, model);
      let peak = 0;
      for (const sample of spoken.samples) peak = Math.max(peak, Math.abs(sample));
      const seconds = spoken.samples.length / (spoken.sampleRate || 16000);
      const exact = spoken.diagnostics?.exactUnits ?? 0;
      const standIns = spoken.diagnostics?.fallbackPhones ?? 0;
      const ok = peak > 0.05 && exact > 5;
      if (!ok) silent += 1;
      // An option to keep the sentence as a file: the quickest way to know a voice
      // is audible without opening a browser, and the same samples playback gets.
      const wavTarget = valueOf(args, '--wav');
      if (wavTarget) {
        const stem = wavTarget.replace(/\.wav$/i, '');
        const target = rows.length > 1 ? `${stem}-${voice.id}.wav` : wavTarget;
        writeWav(target, spoken.samples, spoken.sampleRate || 16000);
        console.log(`${''.padEnd(20)} ${''.padStart(8)} ${''.padStart(6)} ${''.padStart(11)} ${''.padStart(10)}  wrote ${target}`);
      }
      console.log(
        `${voice.id.padEnd(20)} ${seconds.toFixed(2).padStart(8)} ${peak.toFixed(3).padStart(6)} ` +
          `${String(exact).padStart(11)} ${String(standIns).padStart(10)}  ${ok ? 'speaks' : 'NO SOUND'}`,
      );
    } catch (error) {
      silent += 1;
      console.log(
        `${voice.id.padEnd(20)} ${'-'.padStart(8)} ${'-'.padStart(6)} ${'-'.padStart(11)} ${'-'.padStart(10)}  ` +
          `FAILED: ${error instanceof Error ? error.message : String(error)}`,
      );
      for (const entry of collected.slice(-2)) realConsoleWarn(...(entry as unknown[]));
    } finally {
      unregisterOptionalVoiceSource(voice.id);
      releaseVoicePack(voice.id);
    }
  }

  globalThis.fetch = realFetch;
  console.error = realConsoleError;
  console.warn = realConsoleWarn;
  console.log(
    silent
      ? `\n${rows.length - silent} of ${rows.length} installed voices speak; ${silent} did not.`
      : `\nAll ${rows.length} installed voices speak from their own recordings.`,
  );
  return silent ? 1 : 0;
}

async function inspect(args: string[]): Promise<number> {
  const [id] = positionals(args);
  const fromArchive = valueOf(args, '--from');
  if (!id) {
    console.error('Which voice? e.g. `npm run voices -- inspect arctic-ljm`');
    return 1;
  }
  const voice = findVoiceCandidate(id);
  if (!voice) {
    console.error(`✗ unknown voice "${id}". Run \`npm run voices -- list\` for the ids.`);
    return 1;
  }
  if (!voice.install) {
    console.error(`✗ ${voice.displayName} has no installer.`);
    return 1;
  }
  const python = resolvePythonExecutable();
  if (!python) {
    console.error(pythonInstallHint());
    return 1;
  }
  const args2 = installerArgs(voice, fromArchive);
  if (!args2) return 1;
  const source = fromArchive ? expandHome(fromArchive) : voice.install!.url;
  const progressFile = resolve(PROGRESS_ROOT, `${voice.id}.json`);
  mkdirSync(PROGRESS_ROOT, { recursive: true });
  rmSync(progressFile, { force: true });
  console.log(`\n▸ inspecting ${voice.displayName} (${id})`);
  console.log(`  ${source}`);
  if (!fromArchive) console.log('  downloading the archive; this can take a minute — Ctrl-C is safe');
  console.log('  nothing is installed by an inspection\n');
  return new Promise((resolvePromise) => {
    const progress = watchProgress(progressFile);
    const child = spawn(python, [...args2, '--inspect'], {
      cwd: ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
      windowsHide: true,
    });
    child.on('close', (code) => {
      progress.stop();
      resolvePromise(code ?? 1);
    });
  });
}

async function install(args: string[]): Promise<number> {
  const fromArchive = valueOf(args, '--from');
  const classFilter = valueOf(args, '--class');
  let ids = positionals(args);

  if (classFilter) {
    ids = VOICE_CATALOGUE.filter(
      (voice) => voice.compatibility === classFilter.toUpperCase() && voice.install,
    ).map((voice) => voice.id);
    if (!ids.length) {
      console.error(`No installable voices in class ${classFilter.toUpperCase()}.`);
      return 1;
    }
  }
  if (!ids.length) {
    console.error('Nothing to install. Give one or more voice ids, or --class A.');
    return 1;
  }

  let failures = 0;
  for (const id of ids) {
    if (isProtectedVoiceId(id)) {
      console.error(`✗ ${id} is a protected base voice: it is already the engine's own voice and cannot be installed, replaced or removed.`);
      failures += 1;
      continue;
    }
    const voice = findVoiceCandidate(id);
    if (!voice) {
      console.error(`✗ unknown voice "${id}". Run \`npm run voices -- list\` for the ids.`);
      failures += 1;
      continue;
    }
    if (!voice.install) {
      console.error(`✗ ${voice.displayName} has no installer: ${voice.compatibilityNote}`);
      failures += 1;
      continue;
    }
    if (installedInfo(id)) {
      console.log(`\n▸ ${voice.displayName} (${id}) is already installed — skipping. Remove it first to reinstall.`);
      continue;
    }
    if (fromArchive && !existsSync(expandHome(fromArchive))) {
      console.error(`✗ ${fromArchive} does not exist.`);
      failures += 1;
      continue;
    }
    const code = await runInstaller(voice, fromArchive);
    if (code !== 0) failures += 1;
  }
  return failures === 0 ? 0 : 1;
}

function remove(args: string[]): number {
  const ids = positionals(args);
  if (!ids.length) {
    console.error('Give at least one voice id to remove.');
    return 1;
  }
  let failures = 0;
  for (const id of ids) {
    if (isProtectedVoiceId(id)) {
      console.error(`✗ ${id} is a protected base voice and cannot be removed.`);
      failures += 1;
      continue;
    }
    const dir = installedVoiceDir(VOICE_ROOT, id);
    if (!dir || !existsSync(dir)) {
      console.error(`✗ ${id} is not installed.`);
      failures += 1;
      continue;
    }
    const bytes = installedInfo(id)?.bytes;
    rmSync(dir, { recursive: true, force: true });
    rmSync(resolve(PROGRESS_ROOT, `${id}.json`), { force: true });
    console.log(`✓ removed ${id}${bytes ? ` (freed ${humanBytes(bytes)})` : ''}`);
  }
  return failures === 0 ? 0 : 1;
}

function urls(args: string[]): number {
  const classFilter = valueOf(args, '--class')?.toUpperCase();
  const rows = VOICE_CATALOGUE.filter(
    (voice) => voice.install && (!classFilter || voice.compatibility === classFilter),
  );
  for (const voice of rows) {
    const recipe = voice.install!;
    console.log(`# ${voice.id} — ${voice.displayName} (${voice.language}, ${voice.accent}, ${voice.gender})`);
    console.log(`# licence: ${voice.licence.name}`);
    if (recipe.kind === 'arctic-tree') {
      // Nothing to curl: the labels live in a browsable tree, not a tarball.
      console.log(`# published tree: ${recipe.treeUrl}`);
      console.log(`npm run voices -- install ${voice.id}\n`);
      continue;
    }
    if (recipe.kind === 'festival-dir') {
      // The files arrive through the package manager, so there is nothing to curl.
      const pkg = voice.id === 'festival-don' ? 'festvox-don' : 'festvox-kdlpc16k';
      console.log(`sudo apt install ${pkg}`);
      console.log(`npm run voices -- install ${voice.id} --from /usr/share/festival/voices/english\n`);
      continue;
    }
    console.log(`curl -L -o ${voice.id}.archive "${recipe.url}"`);
    console.log(`npm run voices -- install ${voice.id} --from ${voice.id}.archive\n`);
  }
  // Not a package voice: that one needs apt first and a --from argument.
  const example = rows.find((voice) => voice.install?.kind !== 'festival-dir')?.id ?? 'cmu-kal';
  console.log(
    `${rows.length} sources. Prefer \`npm run voices -- install ${example}\` if npm and python3 are present: it unpacks, converts and validates too.`,
  );
  return 0;
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'list':
    case 'ls':
      list(args);
      return 0;
    case 'install':
      return install(args);
    case 'inspect':
      return inspect(args);
    case 'verify':
      return verify(args);
    case 'remove':
    case 'rm':
      return remove(args);
    case 'urls':
      return urls(args);
    case 'status': {
      const installed = VOICE_CATALOGUE.filter((voice) => installedInfo(voice.id));
      const total = installed.reduce((sum, voice) => sum + (installedInfo(voice.id)?.bytes ?? 0), 0);
      console.log(`${installed.length} installed, ${humanBytes(total)} on disk, in ${VOICE_ROOT}`);
      for (const voice of installed) {
        const info = installedInfo(voice.id);
        console.log(
          `  ${pad(voice.id, 20)} ${pad(`${info?.units ?? '?'} units`, 14)} ${pad(humanBytes(info?.bytes), 9)} ${info?.installedAt ?? ''}`,
        );
      }
      return 0;
    }
    default:
      printUsage();
      return command ? 1 : 0;
  }
}

void main().then((code) => {
  process.exitCode = code;
});
