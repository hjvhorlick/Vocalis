/**
 * Where an installed voice lives, and which ids are allowed to exist at all.
 *
 * The server asks these questions before it writes, serves or deletes anything,
 * and the tests ask the same functions, so the guard that protects the base
 * voices is a single piece of code rather than a habit repeated in several
 * places.
 *
 * The two protected voices are refused *by name* and the resolved path is checked
 * to be inside the optional-voice directory, so neither a crafted id nor a path
 * traversal can reach `public/voicepacks/cmu-arctic`.
 *
 * Original Vocalis code.
 */
import { resolve, sep, join } from 'node:path';

/** The compiled-in voices. Never installable, never removable, never replaceable. */
export const PROTECTED_VOICE_IDS = ['slt', 'bdl'] as const;

/** Letters, digits, dot, dash, underscore; must start with a letter or digit. */
export const SAFE_VOICE_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export function isProtectedVoiceId(id: string): boolean {
  return (PROTECTED_VOICE_IDS as readonly string[]).includes(id);
}

export function isSafeVoiceId(id: string): boolean {
  if (typeof id !== 'string' || !SAFE_VOICE_ID.test(id)) return false;
  if (id.includes('..')) return false;
  if (isProtectedVoiceId(id)) return false;
  return true;
}

/**
 * Absolute path of an installed voice, or null when the id is not allowed.
 * `root` is the optional-voice directory, e.g. `public/optional-voices`.
 */
export function installedVoiceDir(root: string, id: string): string | null {
  if (!isSafeVoiceId(id)) return null;
  const base = resolve(root);
  const candidate = resolve(base, id);
  if (candidate !== join(base, id)) return null;
  if (!candidate.startsWith(base + sep)) return null;
  return candidate;
}

/** Where the installer writes its progress for one voice. */
export function progressFilePath(root: string, id: string): string | null {
  if (!isSafeVoiceId(id)) return null;
  return join(resolve(root), `${id}.json`);
}
