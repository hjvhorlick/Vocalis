/**
 * The recorded voice library.
 *
 * This is a browser for the catalogue in `src/data/voiceCatalogue.ts` and a
 * control panel for the packs that are installed on this machine. It is
 * deliberately separate from the preset list: presets are *ways of speaking*
 * built on the two protected base voices, while everything here is a different
 * person's recordings, spoken as recorded.
 *
 * Nothing on this screen transforms a voice. That is the point — it is the
 * answer to "why do other apps have fifty voices": they ship fifty recordings.
 *
 * Original Vocalis code.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Download,
  HardDrive,
  Info,
  Play,
  Search,
  ShieldCheck,
  Square,
  Trash2,
  TriangleAlert,
  Volume2,
} from 'lucide-react';

import type { VoiceModelConfig } from '../utils/naturalVoiceEngine';
import { speakRealWords, stopSpeaking } from '../utils/naturalVoiceEngine';
import {
  EMPTY_FILTERS,
  buildLibraryRows,
  fetchInstallProgress,
  fetchLibraryState,
  filterVoices,
  formatBytes,
  modelForLibraryVoice,
  registerInstalledVoices,
  removeInstalledVoice,
  requestInstall,
  sortVoices,
  uniqueValues,
  type InstallProgress,
  type LibraryFilters,
  type LibraryRow,
  type LibraryState,
  type SortKey,
} from '../utils/voiceLibrary';

interface RecordedVoiceLibraryProps {
  onSelectVoice: (model: VoiceModelConfig) => void;
  /** The voice currently in use in the studio, if it came from this library. */
  activeVoiceId?: string;
}

const PROTECTED_VOICES = [
  {
    id: 'slt',
    name: 'CMU ARCTIC SLT',
    detail: 'US English, female · 1,324 recorded units · 16 kHz',
  },
  {
    id: 'bdl',
    name: 'CMU ARCTIC BDL',
    detail: 'US English, male · 1,337 recorded units · 16 kHz',
  },
];

const COMPATIBILITY_LABEL: Record<string, string> = {
  A: 'Ready to install',
  B: 'Needs an adapter',
  C: 'Needs labels or a language front end',
  D: 'Not compatible',
};

const COMPATIBILITY_STYLE: Record<string, string> = {
  A: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  B: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  C: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  D: 'bg-slate-700/40 text-slate-400 border-slate-700',
};

const STAGE_LABEL: Record<string, string> = {
  idle: 'Not installed',
  starting: 'Starting…',
  download: 'Downloading',
  extract: 'Unpacking',
  convert: 'Cutting recorded units',
  validate: 'Checking the pack',
  done: 'Installed',
  failed: 'Install failed',
};

export const RecordedVoiceLibrary: React.FC<RecordedVoiceLibraryProps> = ({
  onSelectVoice,
  activeVoiceId,
}) => {
  const [state, setState] = useState<LibraryState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [progress, setProgress] = useState<Record<string, InstallProgress>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [auditioningId, setAuditioningId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Record<string, string>>({});
  const [infoId, setInfoId] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchLibraryState();
      registerInstalledVoices(next.installed);
      setState(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The voice library is not available.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
      stopSpeaking();
    };
  }, [refresh]);

  const rows = useMemo(() => (state ? buildLibraryRows(state) : []), [state]);
  const visible = useMemo(() => sortVoices(filterVoices(rows, filters), sortKey), [rows, filters, sortKey]);
  const languages = useMemo(() => uniqueValues(rows, 'language'), [rows]);
  const accents = useMemo(() => uniqueValues(rows, 'accent'), [rows]);

  const poll = useCallback(
    async (id: string) => {
      const next = await fetchInstallProgress(id);
      setProgress((current) => ({ ...current, [id]: next }));
      if (next.stage === 'done') {
        setBusyId(null);
        await refresh();
        return;
      }
      if (next.stage === 'failed') {
        setBusyId(null);
        setError(next.message ?? 'The install failed.');
        return;
      }
      pollTimer.current = window.setTimeout(() => {
        void poll(id);
      }, 900);
    },
    [refresh],
  );

  const handleInstall = useCallback(
    async (row: LibraryRow) => {
      setError(null);
      setBusyId(row.id);
      setProgress((current) => ({ ...current, [row.id]: { stage: 'starting' } }));
      try {
        await requestInstall(row.id);
        await poll(row.id);
      } catch (cause) {
        setBusyId(null);
        setError(cause instanceof Error ? cause.message : 'The install could not be started.');
      }
    },
    [poll],
  );

  const handleRemove = useCallback(
    async (row: LibraryRow) => {
      const confirmed = window.confirm(
        `Remove ${row.displayName}?\n\nThis deletes its audio, its unit index and its metadata from this machine. ` +
          'The two protected base voices are not affected, and you can install it again later.',
      );
      if (!confirmed) return;
      setError(null);
      try {
        await removeInstalledVoice(row.id);
        setProgress((current) => ({ ...current, [row.id]: { stage: 'idle' } }));
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The voice could not be removed.');
      }
    },
    [refresh],
  );

  const say = useCallback((id: string, message: string | null) => {
    setNotice((current) => {
      if (message === null) {
        const next = { ...current };
        delete next[id];
        return next;
      }
      return { ...current, [id]: message };
    });
  }, []);

  const handleAudition = useCallback(
    (row: LibraryRow) => {
      if (auditioningId === row.id) {
        stopSpeaking();
        setAuditioningId(null);
        return;
      }
      // Auditioning plays the recordings on this machine. When they are not here
      // yet, say that plainly — a button that does nothing looks broken.
      if (!row.installed) {
        say(
          row.id,
          row.install
            ? 'Not on this machine yet. Install it first — auditioning plays its own recordings, not a sample.'
            : `This voice cannot be installed: ${row.compatibilityNote}`,
        );
        return;
      }
      say(row.id, null);
      setAuditioningId(row.id);
      void speakRealWords(row.samplePhrase, modelForLibraryVoice(row), {
        onEnd: () => setAuditioningId(null),
        onError: (error) => {
          setAuditioningId(null);
          say(row.id, `That voice could not be played: ${error instanceof Error ? error.message : String(error)}`);
        },
      });
    },
    [auditioningId, say],
  );

  const installedCount = state?.installed.length ?? 0;

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Recorded voice library</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">
              {rows.length} human-recorded, non-neural voices were investigated for Vocalis. Each
              one is installed, spoken and removed on its own, straight from the recordings — no
              transformation, no model, no browser speech. Only the voices marked{' '}
              <span className="text-emerald-300">ready</span> can speak typed English today.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <HardDrive className="h-4 w-4" />
              {formatBytes(state?.storageBytes ?? 0)} installed
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              {installedCount} of {rows.length} installed
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PROTECTED_VOICES.map((voice) => (
            <div
              key={voice.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-4 py-3"
            >
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <ShieldCheck className="h-4 w-4 text-indigo-300" />
                  {voice.name}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">{voice.detail}</p>
              </div>
              <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-200">
                Protected
              </span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
        <label className="relative flex-1 min-w-[190px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            placeholder="Search name, language, accent or project"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <select
          value={filters.language}
          onChange={(event) => setFilters((current) => ({ ...current, language: event.target.value }))}
          className="rounded-xl border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200"
        >
          <option value="any">All languages</option>
          {languages.map((language) => (
            <option key={language} value={language}>
              {language}
            </option>
          ))}
        </select>
        <select
          value={filters.accent}
          onChange={(event) => setFilters((current) => ({ ...current, accent: event.target.value }))}
          className="rounded-xl border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200"
        >
          <option value="any">All accents</option>
          {accents.map((accent) => (
            <option key={accent} value={accent}>
              {accent}
            </option>
          ))}
        </select>
        <select
          value={filters.gender}
          onChange={(event) =>
            setFilters((current) => ({ ...current, gender: event.target.value as LibraryFilters['gender'] }))
          }
          className="rounded-xl border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200"
        >
          <option value="any">Any gender</option>
          <option value="Female">Female</option>
          <option value="Male">Male</option>
          <option value="Unknown">Not documented</option>
        </select>
        <select
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({ ...current, status: event.target.value as LibraryFilters['status'] }))
          }
          className="rounded-xl border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200"
        >
          <option value="any">Any status</option>
          <option value="installed">Installed</option>
          <option value="available">Not installed</option>
        </select>
        <select
          value={filters.compatibility}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              compatibility: event.target.value as LibraryFilters['compatibility'],
            }))
          }
          className="rounded-xl border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200"
        >
          <option value="any">Any compatibility</option>
          <option value="A">A — ready</option>
          <option value="B">B — adapter</option>
          <option value="C">C — front end needed</option>
          <option value="D">D — not compatible</option>
        </select>
        <select
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200"
        >
          <option value="status">Sort: status</option>
          <option value="name">Sort: name</option>
          <option value="language">Sort: language</option>
        </select>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((row) => {
          const install = progress[row.id];
          const installing = busyId === row.id && install && install.stage !== 'done' && install.stage !== 'failed';
          const isActive = activeVoiceId === row.id;
          return (
            <article
              key={row.id}
              className={`rounded-2xl border bg-slate-900/60 p-4 transition-colors ${
                isActive ? 'border-indigo-500/60' : 'border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">{row.displayName}</h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {row.language} · {row.accent} · {row.gender === 'Unknown' ? 'gender not documented' : row.gender}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    COMPATIBILITY_STYLE[row.compatibility]
                  }`}
                >
                  {row.compatibility}
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-400">
                <dt className="text-slate-500">Source</dt>
                <dd className="truncate text-right text-slate-300" title={row.sourceProject}>
                  {row.sourceProject}
                </dd>
                <dt className="text-slate-500">Download</dt>
                <dd className="text-right text-slate-300">{row.downloadLabel}</dd>
                <dt className="text-slate-500">Licence</dt>
                <dd className="truncate text-right text-slate-300" title={row.licence.name}>
                  {row.licence.name.split('(')[0].trim()}
                </dd>
                <dt className="text-slate-500">Status</dt>
                <dd className="text-right">
                  {row.installed ? (
                    <span className="text-emerald-300">
                      Installed · {formatBytes(row.installed.bytes)}
                    </span>
                  ) : (
                    <span className={row.install ? 'text-slate-300' : 'text-slate-500'}>
                      {COMPATIBILITY_LABEL[row.compatibility]}
                    </span>
                  )}
                </dd>
              </dl>

              {installing && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>{STAGE_LABEL[install.stage] ?? install.stage}</span>
                    <span>{install.percent ?? 0}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${Math.max(4, install.percent ?? 4)}%` }}
                    />
                  </div>
                  {install.message && <p className="mt-1 text-[10px] text-slate-500">{install.message}</p>}
                </div>
              )}

              {install?.stage === 'failed' && (
                <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-[11px] leading-relaxed text-rose-200">
                  <p className="font-semibold">Install failed</p>
                  <p className="mt-0.5 break-words">{install.message ?? 'The installer stopped without saying why.'}</p>
                  {install.log && (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-rose-300/80">Installer output</summary>
                      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[10px] text-rose-200/80">
                        {install.log}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                {!row.installed && row.install && (
                  <button
                    onClick={() => void handleInstall(row)}
                    disabled={busyId !== null}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-indigo-500 hover:text-white disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {installing ? 'Installing…' : install?.stage === 'failed' ? 'Try again' : 'Install'}
                  </button>
                )}
                {/* Every card carries an Audition control that answers when
                    pressed. A missing button reads as a broken page; a dead one
                    reads as a broken app. */}
                {!row.installed && (
                  <button
                    type="button"
                    onClick={() => handleAudition(row)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:border-slate-500 hover:text-white"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Audition
                  </button>
                )}
                {row.installed && (
                  <>
                    <button
                      onClick={() => handleAudition(row)}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-indigo-500 hover:text-white"
                    >
                      {auditioningId === row.id ? (
                        <Square className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      {auditioningId === row.id ? 'Stop' : 'Audition'}
                    </button>
                    <button
                      onClick={() => onSelectVoice(modelForLibraryVoice(row))}
                      className="flex items-center gap-1.5 rounded-lg border border-indigo-500/50 bg-indigo-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-100 hover:bg-indigo-500/25"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                      {isActive ? 'In use' : 'Use voice'}
                    </button>
                    <button
                      onClick={() => void handleRemove(row)}
                      className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </>
                )}
                <button
                  onClick={() => setInfoId(infoId === row.id ? null : row.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-transparent px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:border-slate-500"
                >
                  <Info className="h-3.5 w-3.5" />
                  Info
                  <ChevronDown className={`h-3 w-3 transition-transform ${infoId === row.id ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {notice[row.id] && (
                <p className="mt-2 rounded-lg border border-slate-700/70 bg-slate-950/60 px-2.5 py-2 text-[11px] leading-relaxed text-slate-300">
                  {notice[row.id]}
                </p>
              )}

              {infoId === row.id && (
                <div className="mt-3 space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-[11px] leading-relaxed text-slate-400">
                  <p>{row.compatibilityNote}</p>
                  <p>
                    <span className="text-slate-500">Format: </span>
                    {row.originalFormat}
                  </p>
                  <p>
                    <span className="text-slate-500">Licence: </span>
                    {row.licence.name}
                    {row.licence.url && (
                      <>
                        {' — '}
                        <a
                          href={row.licence.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-300 underline decoration-dotted"
                        >
                          terms
                        </a>
                      </>
                    )}
                  </p>
                  <p>
                    <span className="text-slate-500">Commercial use: </span>
                    {row.licence.commercialUse}
                  </p>
                  <p>
                    <span className="text-slate-500">Redistribution: </span>
                    {row.licence.redistribution}
                  </p>
                  <p>
                    <span className="text-slate-500">Attribution: </span>
                    {row.licence.attribution}
                  </p>
                  {row.notes && <p>{row.notes}</p>}
                  {row.sourceUrl && (
                    <a
                      href={row.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-indigo-300 underline decoration-dotted"
                    >
                      Source project
                    </a>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {!visible.length && (
        <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center text-xs text-slate-400">
          No voices match those filters.
        </p>
      )}
    </section>
  );
};
