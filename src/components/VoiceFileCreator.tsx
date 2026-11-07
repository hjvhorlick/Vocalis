import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, CircleAlert, Download, Loader2, Play, Square } from 'lucide-react';

import type { VoiceModelConfig } from '../utils/naturalVoiceEngine';
import { speakRealWords, stopSpeaking } from '../utils/naturalVoiceEngine';
import {
  AUDITION_PHRASE,
  buildLibraryRows,
  fetchLibraryState,
  formatBytes,
  modelForLibraryVoice,
  type LibraryRow,
  type LibraryState,
} from '../utils/voiceLibrary';
import { VOCALIS_EXTENSION, slugifyVoiceName, type VocalisVoiceProfile } from '../utils/vocalisVoiceFile';
import { VoiceSettingRow, VoiceToneRow } from './VoiceSettingRow';

/**
 * The .vls Voice Creator: the whole voice-file job on one page.
 *
 * Pick a recorded voice, set the knobs, switch off whatever is spoiling it, name the
 * result and export it — one `.vls` file. Every control here has its own switch
 * because the question a person actually asks is "which of these settings is making
 * my voice file sound wrong?", and a single master toggle cannot answer it. A switch
 * that is off is recorded as off in the file, not silently neutralised: the file can
 * then be rebuilt with that feature genuinely absent.
 */

/** One knob and its switch. `key` is both the model field and the profile field. */
interface SettingSpec {
  key: 'pitch' | 'rate' | 'volume' | 'throatWarmth' | 'oralClarity' | 'airPresence';
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  neutral: number;
  format: (value: number) => string;
}

const SETTINGS: SettingSpec[] = [
  {
    key: 'pitch',
    label: 'Pitch',
    hint: 'Raises or lowers the speaker. Off keeps the recording at its own pitch.',
    min: 0.75,
    max: 1.35,
    step: 0.01,
    neutral: 1,
    format: (value) => `${value.toFixed(2)}×`,
  },
  {
    key: 'rate',
    label: 'Pace',
    hint: 'Speaking speed. Off plays the units at their recorded length.',
    min: 0.7,
    max: 1.35,
    step: 0.01,
    neutral: 1,
    format: (value) => `${value.toFixed(2)}×`,
  },
  {
    key: 'volume',
    label: 'Volume',
    hint: 'Output level of the file. Off leaves the samples at their own level.',
    min: 0.2,
    max: 1,
    step: 0.05,
    neutral: 1,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'throatWarmth',
    label: 'Warmth',
    hint: 'Low-shelf lift on the chest of the voice.',
    min: 0,
    max: 1,
    step: 0.05,
    neutral: 0,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'oralClarity',
    label: 'Clarity',
    hint: 'Presence lift around the consonants. Usually the first thing to switch off if a voice sounds harsh.',
    min: 0,
    max: 1,
    step: 0.05,
    neutral: 0,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'airPresence',
    label: 'Air',
    hint: 'Adds top-end breath. The one most likely to hiss on a 16 kHz recording.',
    min: 0,
    max: 1,
    step: 0.05,
    neutral: 0,
    format: (value) => `${Math.round(value * 100)}%`,
  },
];

export type SwitchState = Record<SettingSpec['key'] | 'tone', boolean>;
export type KnobState = Record<SettingSpec['key'], number>;

/**
 * A new session starts with nothing applied.
 *
 * The page is a workbench, not a preset: the voice you pick arrives exactly as it
 * was recorded, with every stage switched off. Each switch you turn on is the only
 * thing that happens to it, which is what makes one setting at a time testable.
 */
export const ALL_OFF: SwitchState = {
  pitch: false,
  rate: false,
  volume: false,
  tone: false,
  throatWarmth: false,
  oralClarity: false,
  airPresence: false,
};

/** Every knob at the value that changes nothing, so switching one on is honest. */
export const NEUTRAL_KNOBS: KnobState = {
  pitch: 1,
  rate: 1,
  volume: 1,
  throatWarmth: 0,
  oralClarity: 0,
  airPresence: 0,
};

/** The model to speak or export with: a switch that is off contributes neutral. */
export function effectiveModel(
  base: VoiceModelConfig,
  switches: SwitchState,
  knobs: KnobState,
  tone: string,
): VoiceModelConfig {
  return {
    ...base,
    pitch: knobs.pitch,
    rate: knobs.rate,
    volume: knobs.volume,
    toneStyle: tone as VoiceModelConfig['toneStyle'],
    throatWarmth: knobs.throatWarmth,
    oralClarity: knobs.oralClarity,
    airPresence: knobs.airPresence,
    // The switch is the engine's bypass, not a neutral number: a switched-off
    // setting removes its stage, so the preview here sounds like the exported file.
    bypass: {
      pitch: !switches.pitch,
      rate: !switches.rate,
      volume: !switches.volume,
      tone: !switches.tone,
      throatWarmth: !switches.throatWarmth,
      oralClarity: !switches.oralClarity,
      airPresence: !switches.airPresence,
    },
  };
}

export function profileFrom(switches: SwitchState, knobs: KnobState, tone: string): VocalisVoiceProfile {
  return {
    enabled: { ...switches },
    settings: Object.fromEntries(
      SETTINGS.map((setting) => [setting.key, switches[setting.key] ? knobs[setting.key] : setting.neutral]),
    ),
    tone: switches.tone ? tone : 'natural',
  };
}

/** One sentence for the card. The catalogue's full note is behind the library's Info. */
function shortDescription(row: LibraryRow): string {
  const sentence = row.compatibilityNote.split(/(?<=\.)\s/)[0] ?? row.compatibilityNote;
  return sentence.length > 120 ? `${sentence.slice(0, 117).trimEnd()}…` : sentence;
}

/** The model with one setting bypassed, everything else as it stands. */
function bypassOne(model: VoiceModelConfig, key: SettingSpec['key']): VoiceModelConfig {
  if (key === 'pitch') return { ...model, pitch: 1 };
  if (key === 'rate') return { ...model, rate: 1 };
  if (key === 'throatWarmth') return { ...model, throatWarmth: 0 };
  if (key === 'oralClarity') return { ...model, oralClarity: 0 };
  return { ...model, airPresence: 0 };
}

const ORDER_KEY = 'vocalis_voice_file_order';

interface VoiceFileCreatorProps {
  onOpenLibrary: () => void;
}

export const VoiceFileCreator: React.FC<VoiceFileCreatorProps> = ({ onOpenLibrary }) => {
  const [state, setState] = useState<LibraryState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(ORDER_KEY);
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [switches, setSwitches] = useState<SwitchState>(ALL_OFF);
  const [knobs, setKnobs] = useState<KnobState>(NEUTRAL_KNOBS);
  const [tone, setTone] = useState<string>('natural');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState<'preview' | 'export' | null>(null);
  const [testingKey, setTestingKey] = useState<SettingSpec['key'] | 'tone' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchLibraryState();
        if (!cancelled) setState(next);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Only installed voices can become a file: there is nothing to seal otherwise.
  const rows = useMemo(() => {
    if (!state) return [] as LibraryRow[];
    const installed = buildLibraryRows(state).filter((row) => row.installed !== null);
    const position = (id: string) => {
      const index = order.indexOf(id);
      return index === -1 ? order.length + installed.findIndex((row) => row.id === id) : index;
    };
    return [...installed].sort((a, b) => position(a.id) - position(b.id));
  }, [state, order]);

  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;

  // The name follows the chosen voice until the user types their own. Tracking that
  // with a flag rather than by comparing text means a name they typed is never
  // silently replaced when they switch voices and come back.
  const [nameTouched, setNameTouched] = useState(false);
  const defaultName = selected ? `${selected.displayName} custom` : '';
  useEffect(() => {
    if (!nameTouched) setFileName(defaultName);
  }, [defaultName, nameTouched]);

  const resetSettings = useCallback(() => {
    setSwitches(ALL_OFF);
    setKnobs(NEUTRAL_KNOBS);
    setTone('natural');
    setTestingKey(null);
    setNotice(null);
  }, []);

  const chooseVoice = useCallback(
    (id: string) => {
      setSelectedId(id);
      // A different voice starts from nothing applied. Nothing from the previous
      // voice's settings can follow it, which is the whole point of a clean slate.
      resetSettings();
    },
    [resetSettings],
  );

  const move = useCallback(
    (id: string, direction: -1 | 1) => {
      const ids = rows.map((row) => row.id);
      const index = ids.indexOf(id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= ids.length) return;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      setOrder(ids);
      try {
        localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
      } catch {
        // A full quota is not a reason to break the page.
      }
    },
    [rows],
  );

  const model = useMemo(
    () => (selected ? effectiveModel(modelForLibraryVoice(selected), switches, knobs, tone) : null),
    [selected, switches, knobs, tone],
  );

  const handlePreview = useCallback(() => {
    if (!model) return;
    if (busy === 'preview') {
      stopSpeaking();
      setBusy(null);
      return;
    }
    setBusy('preview');
    setNotice(null);
    void speakRealWords(AUDITION_PHRASE, model, {
      onEnd: () => setBusy(null),
      onError: (error) => {
        setBusy(null);
        setNotice({ tone: 'error', text: `That preview could not be played: ${error.message}` });
      },
    });
  }, [model, busy]);

  /**
   * Play the sentence twice: once with the settings as they stand, once with this
   * one feature bypassed. "Which setting is spoiling it?" is answerable by ear in
   * two listens, instead of by switching things off and re-exporting blind.
   */
  const handleTestSetting = useCallback(
    async (key: SettingSpec['key'] | 'tone') => {
      if (!model) return;
      if (testingKey === key) {
        stopSpeaking();
        setTestingKey(null);
        return;
      }
      const speak = (candidate: VoiceModelConfig) =>
        new Promise<void>((resolve, reject) => {
          void speakRealWords(AUDITION_PHRASE, candidate, {
            onEnd: () => resolve(),
            onError: (error) => reject(error),
          });
        });
      setTestingKey(key);
      setNotice(null);
      try {
        await speak(model);
        await speak(key === 'tone' ? { ...model, toneStyle: 'natural' } : bypassOne(model, key));
        const label = key === 'tone' ? 'Tone' : SETTINGS.find((setting) => setting.key === key)?.label ?? key;
        setNotice({ tone: 'ok', text: `${label}: first as set, then bypassed. Listen for what changed.` });
      } catch (error) {
        setNotice({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
      } finally {
        setTestingKey(null);
      }
    },
    [model, testingKey],
  );

  const slug = slugifyVoiceName(fileName);
  const activeSwitches = SETTINGS.filter((setting) => switches[setting.key]).length + (switches.tone ? 1 : 0);
  const totalSwitches = SETTINGS.length + 1;

  const handleExport = useCallback(async () => {
    if (!selected) return;
    if (!slug) {
      setNotice({ tone: 'error', text: 'Give the voice file a name first — letters or digits will do.' });
      return;
    }
    setBusy('export');
    setNotice(null);
    try {
      const response = await fetch(`/api/voices/${encodeURIComponent(selected.id)}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fileName.trim(), profile: profileFrom(switches, knobs, tone) }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `The export failed (${response.status}).`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${slug}.${VOCALIS_EXTENSION}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice({
        tone: 'ok',
        text: `${slug}.${VOCALIS_EXTENSION} saved — ${formatBytes(blob.size)}, ${activeSwitches} of ${totalSwitches} settings sealed in.`,
      });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }, [selected, slug, fileName, switches, knobs, tone, activeSwitches]);

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h1 className="text-lg font-bold text-slate-100">.vls Voice Creator</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
          One page for the whole job: choose a recorded voice, set it up, switch off whatever spoils it, name
          it, export it as a single <span className="text-slate-200">.{VOCALIS_EXTENSION}</span> file. Each
          switch belongs to one setting, so if a voice file sounds wrong you can turn that one feature off and
          export again — the file records which switches were on.
        </p>
      </header>

      {loadError && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
          The voice library is not reachable: {loadError}. This page needs the Node server, because an export
          is sealed on the server.
        </p>
      )}

      {!loadError && state && rows.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-xs text-slate-300">
          Nothing is installed yet, so there is nothing to seal.{' '}
          <button onClick={onOpenLibrary} className="font-semibold text-indigo-300 underline">
            Open the voice library
          </button>{' '}
          and install a voice first.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* The cards, in the user's own order. */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Source voice</h2>
            <span className="text-[11px] text-slate-500">{rows.length} installed · use the arrows to reorder</span>
          </div>
          <div className="space-y-2">
            {rows.map((row, index) => {
              const isSelected = selected?.id === row.id;
              return (
                <div
                  key={row.id}
                  className={`rounded-xl border px-3 py-2.5 transition-colors ${
                    isSelected
                      ? 'border-indigo-500/60 bg-indigo-500/10'
                      : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => chooseVoice(row.id)}
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        isSelected ? 'border-indigo-400 bg-indigo-500' : 'border-slate-600'
                      }`}
                      aria-label={`Use ${row.displayName}`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-100">
                        {row.displayName}
                        {row.installed?.name ? (
                          <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-normal text-emerald-300">
                            {row.installed.name}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-400">
                        {shortDescription(row)}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {row.accent} · {row.gender} · {row.installed?.units ?? '?'} units ·{' '}
                        {formatBytes(row.installed?.bytes ?? 0)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => move(row.id, -1)}
                        disabled={index === 0}
                        className="rounded border border-slate-700 p-1 text-slate-400 enabled:hover:border-indigo-500 enabled:hover:text-white disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => move(row.id, 1)}
                        disabled={index === rows.length - 1}
                        className="rounded border border-slate-700 p-1 text-slate-400 enabled:hover:border-indigo-500 enabled:hover:text-white disabled:opacity-30"
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Settings, each with its own switch, then the export. */}
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-200">Settings</h2>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                    activeSwitches === 0
                      ? 'bg-slate-700/40 text-slate-300'
                      : 'bg-emerald-500/15 text-emerald-300'
                  }`}
                >
                  {activeSwitches === 0
                    ? 'clean — nothing applied'
                    : `${activeSwitches} of ${totalSwitches} applied`}
                </span>
                <button
                  onClick={resetSettings}
                  className="rounded-lg border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:border-slate-500 hover:text-white"
                  title="Switch everything off and put every knob back to the value that changes nothing"
                >
                  Reset to clean
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {SETTINGS.map((setting) => (
                <VoiceSettingRow
                  key={setting.key}
                  label={setting.label}
                  hint={setting.hint}
                  on={switches[setting.key]}
                  value={knobs[setting.key]}
                  min={setting.min}
                  max={setting.max}
                  step={setting.step}
                  format={setting.format}
                  testing={testingKey === setting.key}
                  disabled={!selected}
                  onToggle={() =>
                    setSwitches((current) => ({ ...current, [setting.key]: !current[setting.key] }))
                  }
                  onChange={(value) => setKnobs((current) => ({ ...current, [setting.key]: value }))}
                  onTest={() => void handleTestSetting(setting.key)}
                />
              ))}
              <VoiceToneRow
                on={switches.tone}
                tone={tone}
                hint="The delivery character — natural, deep, whisper, radio. Off leaves the recording's own character."
                testing={testingKey === 'tone'}
                disabled={!selected}
                onToggle={() => setSwitches((current) => ({ ...current, tone: !current.tone }))}
                onSelect={setTone}
                onTest={() => void handleTestSetting('tone')}
              />
            </div>

            <button
              onClick={handlePreview}
              disabled={!selected}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 enabled:hover:border-indigo-500 disabled:opacity-40"
            >
              {busy === 'preview' ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {busy === 'preview'
                ? 'Stop'
                : activeSwitches === 0
                  ? 'Preview the recording, untouched'
                  : `Preview with ${activeSwitches} setting${activeSwitches === 1 ? '' : 's'} applied`}
            </button>
          </div>

          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
            <h2 className="text-sm font-semibold text-slate-100">Export the voice file</h2>
            <label className="mt-3 block text-[11px] font-medium text-slate-400" htmlFor="voice-file-name">
              Name for the new voice file
            </label>
            <input
              id="voice-file-name"
              value={fileName}
              onChange={(event) => {
                setNameTouched(true);
                setFileName(event.target.value);
              }}
              placeholder="My Radio Voice"
              maxLength={64}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-500"
            />
            <p className="mt-1.5 text-[11px] text-slate-500">
              Saves as{' '}
              <span className="text-slate-300">
                {slug ? `${slug}.${VOCALIS_EXTENSION}` : '—'}
              </span>{' '}
              · {activeSwitches} setting{activeSwitches === 1 ? '' : 's'} sealed · samples copied, never re-encoded
            </p>

            <button
              onClick={() => void handleExport()}
              disabled={!selected || busy !== null}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white enabled:hover:bg-emerald-500 disabled:opacity-40"
            >
              {busy === 'export' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {busy === 'export' ? 'Sealing…' : `Export .${VOCALIS_EXTENSION}`}
            </button>

            {notice && (
              <p
                className={`mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
                  notice.tone === 'ok'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                }`}
              >
                {notice.tone === 'ok' ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                ) : (
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
                {notice.text}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
