/**
 * Which Python, if any, is on this machine.
 *
 * The voice installers are Python scripts (unpacking archives and cutting WAV
 * spans is not a job to hand-roll twice), so the server and the terminal command
 * both have to spawn one. `python3` is the name on Linux and macOS; on Windows it
 * is usually `python` or the `py` launcher, and the Microsoft Store installs an
 * alias that opens the Store instead of running anything.
 *
 * So: try the known names, ask each one for its major version, and keep the first
 * that answers 3. Failures are cached too — nothing worse than probing five
 * binaries on every install request.
 *
 * Original Vocalis code.
 */
import { spawnSync } from 'node:child_process';

/** In the order a sensible machine has them; platform first, then the rest. */
export function pythonCandidates(): string[] {
  const shared = ['python3', 'python', 'py'];
  if (process.platform === 'win32') return ['python', 'py', 'python3'];
  return shared;
}

let resolved: string | null | undefined;

/**
 * The first Python 3 executable that actually runs, or null when there is none.
 * The result is cached, including the negative result.
 */
export function resolvePythonExecutable(): string | null {
  if (resolved !== undefined) return resolved;
  for (const candidate of pythonCandidates()) {
    try {
      const probe = spawnSync(
        candidate,
        ['-c', 'import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)'],
        { encoding: 'utf8', timeout: 8000, windowsHide: true },
      );
      // A Store alias exits 0 but prints nothing to stderr and never runs code;
      // requiring the probe to report success is what filters it out.
      if (probe.status === 0) {
        resolved = candidate;
        return resolved;
      }
    } catch {
      // Not present under that name; try the next one.
    }
  }
  resolved = null;
  return resolved;
}

/** For tests and for a server restart that picks up a newly installed Python. */
export function resetPythonExecutableCache(): void {
  resolved = undefined;
}

export function pythonInstallHint(): string {
  return process.platform === 'win32'
    ? 'Python 3 was not found. Install it from python.org (tick "Add python.exe to PATH"), then reopen the terminal.'
    : 'Python 3 was not found. Install it with your package manager (for example `sudo apt install python3`), then try again.';
}
