/**
 * Voice library client.
 *
 * The library is a catalogue of *recorded* voices plus whatever the user has
 * installed. Everything here is either a pure function over that data (so it can
 * be tested without a browser) or a thin call to the local server, which is the
 * only thing that downloads and converts a pack.
 *
 * The important rule: a voice is only usable when it is installed, and installing
 * it never touches the protected base voices. Nothing in this module can select a
 * voice that is not present on disk.
 *
 * Original Vocalis code.
 */
import type { VoiceCandidate, VoiceCompatibility } from '../data/voiceCatalogue';
import { VOICE_CATALOGUE } from '../data/voiceCatalogue';
import type { VoiceModelConfig } from './naturalVoiceEngine';
import {
  httpOptionalVoiceSource,
  registerOptionalVoiceSource,
  unregisterOptionalVoiceSource,
} from './optionalVoicePacks';
import { releaseVoicePack } from './cmuDiphoneSynthesizer';
import type { VocalisVoiceProfile } from './vocalisVoiceFile';

export interface InstalledVoiceInfo {
  id: string;
  units: number | null;
  bytes: number | null;
  installedAt: string | null;
  sourceUrl: string | null;
  /** The name a voice file was exported under, when it came from the creator. */
  name?: string | null;
  /** The switches and knob positions the file was sealed with. */
  profile?: VocalisVoiceProfile | null;
}

export interface LibraryState {
  catalogueVersion: string;
  installed: InstalledVoiceInfo[];
  storageBytes: number;
  engineCanSpeak: string[];
}

export interface InstallProgress {
  stage: 'idle' | 'starting' | 'download' | 'extract' | 'convert' | 'validate' | 'done' | 'failed';
  message?: string;
  percent?: number;
  received?: number;
  total?: number;
  /** The installer's own last lines, present only after a failure. */
  log?: string;
  at?: string;
}

/**
 * One sentence, spoken by every voice in the library. Auditioning on the same
 * words is the only way an A/B between two people's recordings means anything.
 */
export const AUDITION_PHRASE =
  'The small brown dog was sleeping quietly near the open window, and nobody in the house noticed the rain had stopped.';

export type LibraryRow = VoiceCandidate & {
  installed: InstalledVoiceInfo | null;
  /** The words this voice auditions with. */
  samplePhrase: string;
  /** True when the engine can speak this voice's language today. */
  speakable: boolean;
};

export type SortKey = 'name' | 'language' | 'status';

export interface LibraryFilters {
  query: string;
  language: string;
  accent: string;
  gender: 'any' | 'Male' | 'Female' | 'Unknown';
  status: 'any' | 'installed' | 'available';
  compatibility: 'any' | VoiceCompatibility;
}

export const EMPTY_FILTERS: LibraryFilters = {
  query: '',
  language: 'any',
  accent: 'any',
  gender: 'any',
  status: 'any',
  compatibility: 'any',
};

/** Languages the pronunciation front end in the app can actually read. */
const SPEAKABLE_LANGUAGES = ['English'];

export async function fetchLibraryState(): Promise<LibraryState> {
  const response = await fetch('/api/voices');
  if (!response.ok) throw new Error('The voice library is not available.');
  return (await response.json()) as LibraryState;
}

export async function requestInstall(id: string): Promise<void> {
  const response = await fetch(`/api/voices/${encodeURIComponent(id)}/install`, { method: 'POST' });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'The installer could not be started.');
  }
}

export async function fetchInstallProgress(id: string): Promise<InstallProgress> {
  const response = await fetch(`/api/voices/${encodeURIComponent(id)}/progress`);
  if (!response.ok) return { stage: 'idle' };
  return (await response.json()) as InstallProgress;
}

export async function removeInstalledVoice(id: string): Promise<void> {
  const response = await fetch(`/api/voices/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'The voice could not be removed.');
  }
  // Drop it from the engine as well: the audio and index leave memory with the
  // files, so nothing keeps pointing at a directory that is gone.
  unregisterOptionalVoiceSource(id);
  releaseVoicePack(id);
}

/** Make every installed pack loadable. Registration is metadata only — no audio is read. */
export function registerInstalledVoices(installed: InstalledVoiceInfo[]): void {
  for (const voice of installed) {
    const candidate = VOICE_CATALOGUE.find((entry) => entry.id === voice.id);
    if (!candidate) continue;
    registerOptionalVoiceSource(httpOptionalVoiceSource(candidate.id, candidate.displayName));
  }
}

export function buildLibraryRows(state: LibraryState): LibraryRow[] {
  const byId = new Map(state.installed.map((voice) => [voice.id, voice]));
  return VOICE_CATALOGUE.map((candidate) => ({
    ...candidate,
    samplePhrase: AUDITION_PHRASE,
    installed: byId.get(candidate.id) ?? null,
    speakable: SPEAKABLE_LANGUAGES.includes(candidate.language),
  }));
}

/**
 * One short sentence for the card: why this voice cannot be auditioned right now.
 * The full reason lives in Info; a notice that quotes a paragraph of catalogue
 * prose is a notice nobody reads.
 */
export function auditionBlocker(row: LibraryRow): string | null {
  if (row.installed) return null;
  if (row.install) {
    return `Not installed yet. Press Install (${row.downloadLabel}) — auditioning plays this speaker's own recordings, not a sample.`;
  }
  if (row.compatibility === 'C') {
    return row.language === 'English'
      ? 'Cannot be installed: the publisher never released this speaker\'s phone labels. Info has the detail.'
      : `Cannot be installed yet: Vocalis has no pronunciation front end for ${row.language}.`;
  }
  if (row.compatibility === 'D') {
    return 'Excluded by its licence or format — it is listed so you can see why. Info has the detail.';
  }
  return 'No installer for this voice yet. Info has the detail.';
}

export function filterVoices(rows: LibraryRow[], filters: LibraryFilters): LibraryRow[] {
  const needle = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.language !== 'any' && row.language !== filters.language) return false;
    if (filters.accent !== 'any' && row.accent !== filters.accent) return false;
    if (filters.gender !== 'any' && row.gender !== filters.gender) return false;
    if (filters.compatibility !== 'any' && row.compatibility !== filters.compatibility) return false;
    if (filters.status === 'installed' && !row.installed) return false;
    if (filters.status === 'available' && row.installed) return false;
    if (!needle) return true;
    return (
      row.displayName.toLowerCase().includes(needle) ||
      row.language.toLowerCase().includes(needle) ||
      row.accent.toLowerCase().includes(needle) ||
      row.sourceProject.toLowerCase().includes(needle) ||
      row.id.toLowerCase().includes(needle)
    );
  });
}

export function sortVoices(rows: LibraryRow[], key: SortKey): LibraryRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (key === 'language') {
      const byLanguage = a.language.localeCompare(b.language);
      return byLanguage !== 0 ? byLanguage : a.displayName.localeCompare(b.displayName);
    }
    if (key === 'status') {
      const rank = (row: LibraryRow) => (row.installed ? 0 : row.install ? 1 : 2);
      const byStatus = rank(a) - rank(b);
      return byStatus !== 0 ? byStatus : a.displayName.localeCompare(b.displayName);
    }
    return a.displayName.localeCompare(b.displayName);
  });
  return copy;
}

export function uniqueValues(rows: LibraryRow[], key: 'language' | 'accent'): string[] {
  return [...new Set(rows.map((row) => row[key]))].sort((a, b) => a.localeCompare(b));
}

/**
 * The profile used to speak an installed voice.
 *
 * Every shaping control is at its neutral value and the method is the recorded
 * path, so this is the voice exactly as it was recorded. Presets are where
 * transformation happens; the library is not.
 */
/**
 * Apply the switches a voice file was sealed with.
 *
 * A sealed file records which settings were on when it was made. Rebuilding the
 * model from that record means an exported voice sounds like the one that was
 * auditioned — and a switch that was off stays off instead of quietly returning to
 * its default.
 */
export function applyProfileToModel(
  model: VoiceModelConfig,
  profile: VocalisVoiceProfile | null | undefined,
): VoiceModelConfig {
  if (!profile?.enabled) return model;
  const on = (key: string) => profile.enabled[key] !== false;
  const value = (key: string, fallback: number) =>
    on(key) && Number.isFinite(profile.settings?.[key]) ? profile.settings[key] : fallback;
  return {
    ...model,
    pitch: value('pitch', 1),
    rate: value('rate', 1),
    volume: value('volume', 1),
    throatWarmth: value('throatWarmth', 0),
    oralClarity: value('oralClarity', 0),
    airPresence: value('airPresence', 0),
    toneStyle: on('tone') && profile.tone ? (profile.tone as VoiceModelConfig['toneStyle']) : 'natural',
    // The switches travel with the file, so a voice sealed without Clarity is
    // reopened without Clarity instead of quietly coming back with its default.
    bypass: {
      pitch: profile.enabled.pitch === false,
      rate: profile.enabled.rate === false,
      volume: profile.enabled.volume === false,
      tone: profile.enabled.tone === false,
      throatWarmth: profile.enabled.throatWarmth === false,
      oralClarity: profile.enabled.oralClarity === false,
      airPresence: profile.enabled.airPresence === false,
    },
  };
}

export function modelForLibraryVoice(row: LibraryRow): VoiceModelConfig {
  const accent: VoiceModelConfig['accent'] = row.accent.startsWith('British')
    ? 'UK'
    : row.accent.startsWith('Australian')
      ? 'AU'
      : row.language === 'English'
        ? 'US'
        : 'Global';
  return {
    id: `library-${row.id}`,
    name: row.displayName,
    archetype: 'Recorded voice',
    description: `${row.sourceProject} — installed from the voice library, spoken from its own recordings with no transformation.`,
    gender: row.gender === 'Female' ? 'Female' : row.gender === 'Male' ? 'Male' : 'Neutral',
    accent,
    flag: '🎙️',
    pitch: 1,
    rate: 1,
    volume: 1,
    toneStyle: 'natural',
    samplePhrase: row.samplePhrase,
    avatarColor: '#475569',
    baseSampleId: 'slt',
    baseVoiceId: row.id,
    synthesisMethod: 'cmu-arctic',
    throatWarmth: 0,
    oralClarity: 0,
    airPresence: 0,
  };
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
