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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
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
        voice from an archive you already have, instead of downloading it.

  install --class A
        Install every voice in that compatibility class, one at a time.

  remove <id...>
        Delete installed voices. The protected base voices are refused.

  inspect <id> [--from <archive>]
        Download and unpack a voice's archive and report what it contains —
        waveforms, phone labels, text — without converting or installing anything.
        Use it first when an install fails.

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
      if (arg === '--from' || arg === '--class' || arg === '--language') index += 1;
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
    '--url', archiveOverride ? pathToFileURL(expandHome(archiveOverride)).href : recipe.url,
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
  } else {
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
  const python = resolvePythonExecutable();
  if (!python) {
    console.error(`  ✗ ${pythonInstallHint()}`);
    return Promise.resolve(1);
  }

  const progressFile = resolve(PROGRESS_ROOT, `${voice.id}.json`);
  mkdirSync(PROGRESS_ROOT, { recursive: true });
  rmSync(progressFile, { force: true });

  console.log(`\n▸ ${voice.displayName}  (${voice.id})`);
  console.log(`  ${archiveOverride ? expandHome(archiveOverride) : recipe.url}`);
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
        const explanation =
          stderr
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('install failed:'))
            .slice(-4)
            .join(' ') ||
          (lastLine().includes('failed:') ? lastLine().replace(/.*failed: /, '') : 'unknown error');
        console.error(`  ✗ ${explanation}`);
      }
      resolvePromise(code ?? 1);
    });
  });
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
    console.log(`curl -L -o ${voice.id}.archive "${recipe.url}"`);
    console.log(`npm run voices -- install ${voice.id} --from ${voice.id}.archive\n`);
  }
  console.log(`${rows.length} archives. Prefer \`npm run voices -- install ${classFilter ?? '<id>'}\` if npm and python3 are present: it unpacks, converts and validates too.`);
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
