import React, { useState, useRef, useEffect } from 'react';
import {
  VoiceModelConfig,
  auditionSourceRecording,
  stopSpeaking,
} from '../utils/naturalVoiceEngine';
import {
  createVoiceRenderRequest,
  playRenderedVoice,
  renderResultToGeneratedTake,
  renderVoiceRequest,
  type VoiceRenderResult,
} from '../utils/voiceRenderContract';
import type { RoomEnvironmentId } from '../utils/roomEnvironment';
import { GeneratedTake } from '../types/voice';
import { VoiceVisualizer } from './VoiceVisualizer';
import { SourceVoiceAttribution } from './SourceVoiceAttribution';
import {
  Sliders,
  Volume2,
  Square,
  Download,
  BookmarkCheck,
  Check,
  Search,
  FileText,
  AudioWaveform,
  ChevronDown,
  ListFilter,
} from 'lucide-react';
import { VoiceAvatar } from './VoiceAvatar';
import { VoiceSourceNote } from './VoiceSourceNote';
import { VoiceRating } from './VoiceRating';
import { RoomEnvironmentStudio } from './RoomEnvironmentStudio';

interface VoiceHubProps {
  voices: VoiceModelConfig[];
  activeVoice: VoiceModelConfig;
  onSelectVoice: (voice: VoiceModelConfig) => void;
  onUpdateActiveVoice: (voice: VoiceModelConfig) => void;
  onSaveTake: (take: GeneratedTake) => Promise<void>;
  onOpenVoiceCreator: (baseVoice?: VoiceModelConfig) => void;
}

export const VoiceHub: React.FC<VoiceHubProps> = ({
  voices,
  activeVoice,
  onSelectVoice,
  onUpdateActiveVoice,
  onSaveTake,
  onOpenVoiceCreator,
}) => {
  // The Hub is a production screen, not a second full catalogue. The picker keeps
  // all profiles reachable without putting sixty expanded cards ahead of the script.
  const [voiceSearch, setVoiceSearch] = useState('');
  const [isVoicePickerOpen, setIsVoicePickerOpen] = useState(false);

  // Script text state (defaults to active voice's sample phrase)
  const [customScript, setCustomScript] = useState(activeVoice.samplePhrase);

  // Update script when active voice changes
  useEffect(() => {
    setCustomScript(activeVoice.samplePhrase);
  }, [activeVoice.id]);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [auditioningCardId, setAuditioningCardId] = useState<string | null>(null);

  // WAV render & export state
  const [isExportingWav, setIsExportingWav] = useState(false);
  const [exportedWavUrl, setExportedWavUrl] = useState<string | null>(null);
  const [exportedDuration, setExportedDuration] = useState(0);
  const [exportedInfo, setExportedInfo] = useState<{ voiceName: string; text: string } | null>(null);
  const [isPlayingExportedWav, setIsPlayingExportedWav] = useState(false);
  const [takeSavedToast, setTakeSavedToast] = useState(false);
  const [savingTake, setSavingTake] = useState(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const livePlayerRef = useRef<HTMLAudioElement | null>(null);
  const exportedRenderRef = useRef<VoiceRenderResult | null>(null);
  const [environmentId, setEnvironmentId] = useState<RoomEnvironmentId>('dry-reference');
  const [roomWet, setRoomWet] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const activeSourceOnly = activeVoice.renderMode === 'source-clip-only';

  const scriptRenderableVoices = voices.filter((voice) => voice.renderMode !== 'source-clip-only');
  const sourceReferenceVoices = voices.filter((voice) => voice.renderMode === 'source-clip-only');
  const normalizedVoiceSearch = voiceSearch.trim().toLowerCase();
  const filteredVoices = voices.filter((voice) => {
    if (!normalizedVoiceSearch) return true;
    return [voice.name, voice.archetype, voice.description, voice.realSpeakerName, voice.accent]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedVoiceSearch));
  });

  const stopContractPlayback = () => {
    if (livePlayerRef.current) {
      livePlayerRef.current.pause();
      livePlayerRef.current.currentTime = 0;
      livePlayerRef.current = null;
    }
    setIsPlaying(false);
    setAuditioningCardId(null);
  };

  /** Card audition, Listen, validation and export all construct the same request. */
  const renderAndPlay = async (voice: VoiceModelConfig, text: string, purpose: 'audition' | 'validation' = 'audition') => {
    stopContractPlayback();
    setIsPlaying(true);
    setAuditioningCardId(voice.id);
    try {
      const request = createVoiceRenderRequest(voice, text, { environmentId, roomWet, purpose });
      const result = await renderVoiceRequest(voice, request);
      let player: HTMLAudioElement;
      player = playRenderedVoice(result, {
        onEnd: () => {
          if (livePlayerRef.current === player) {
            livePlayerRef.current = null;
            setIsPlaying(false);
            setAuditioningCardId(null);
          }
        },
        onError: () => {
          if (livePlayerRef.current === player) {
            livePlayerRef.current = null;
            setIsPlaying(false);
            setAuditioningCardId(null);
          }
        },
      });
      livePlayerRef.current = player;
    } catch (err) {
      console.error('Contract audition error:', err);
      setRenderError(err instanceof Error ? err.message : 'The voice could not be rendered.');
      setIsPlaying(false);
      setAuditioningCardId(null);
    }
  };

  const playOriginalReference = (voice: VoiceModelConfig) => {
    stopContractPlayback(); stopSpeaking();
    setIsPlaying(true); setAuditioningCardId(voice.id);
    void auditionSourceRecording(voice, {
      onEnd: () => { setIsPlaying(false); setAuditioningCardId(null); },
      onError: error => { setRenderError(error.message); setIsPlaying(false); setAuditioningCardId(null); },
    });
  };

  const handleAuditionVoice = (voice: VoiceModelConfig) => {
    if (auditioningCardId === voice.id) {
      stopContractPlayback();
      stopSpeaking();
      return;
    }
    onSelectVoice(voice);
    if (voice.renderMode === 'source-clip-only') playOriginalReference(voice);
    else void renderAndPlay(voice, voice.samplePhrase);
  };

  const selectVoiceForScript = (voice: VoiceModelConfig) => {
    onSelectVoice(voice);
    setVoiceSearch('');
    setIsVoicePickerOpen(false);
  };

  const handlePlayNarration = () => {
    if (isPlaying) { stopContractPlayback(); stopSpeaking(); return; }
    if (activeSourceOnly) { playOriginalReference(activeVoice); return; }
    const textToSpeak = customScript.trim() || activeVoice.samplePhrase;
    void renderAndPlay(activeVoice, textToSpeak);
  };

  // Final output is rendered from a locked snapshot, so its recipe matches the
  // audition route and can be reviewed later in the saved manifest.
  const handleExportWav = async () => {
    if (activeSourceOnly) {
      setRenderError('This protected source is a reference clip without a matching voice bank. Download its verified original from the source note or create a finite DSP source-clip variant; arbitrary-text export is unavailable.');
      return;
    }
    setIsExportingWav(true);
    try {
      const textToRender = customScript.trim() || activeVoice.samplePhrase;
      const request = createVoiceRenderRequest(activeVoice, textToRender, { environmentId, roomWet, purpose: 'final' });
      const result = await renderVoiceRequest(activeVoice, request);
      if (exportedWavUrl) URL.revokeObjectURL(exportedWavUrl);
      exportedRenderRef.current = result;
      setExportedWavUrl(result.audioUrl);
      setExportedInfo({ voiceName: activeVoice.name, text: textToRender });
      setExportedDuration(result.duration);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = result.audioUrl;
        audioPlayerRef.current.load();
      }
    } catch (err) {
      console.error('WAV export error:', err);
      setRenderError(err instanceof Error ? err.message : 'The WAV could not be rendered.');
    } finally {
      setIsExportingWav(false);
    }
  };

  const handleSaveTake = async () => {
    if (!exportedWavUrl || !exportedRenderRef.current || savingTake) return;
    setSavingTake(true);
    try {
      await onSaveTake(renderResultToGeneratedTake(exportedRenderRef.current, `take-${Date.now()}`));
      setTakeSavedToast(true);
      setTimeout(() => setTakeSavedToast(false), 2400);
    } catch { /* The app displays the persistence error. */ }
    finally { setSavingTake(false); }
  };

  // Preset script templates
  const scriptTemplates = [
    { label: 'Voice Test', text: activeVoice.samplePhrase },
    {
      label: 'Audiobook',
      text: 'The evening mist settled quietly over the pine ridge as the traveler paused to listen to the distant bell.',
    },
    {
      label: 'Commercial',
      text: 'Welcome to our studio. Find a comfortable place, take a deep breath, and listen to the next story.',
    },
    {
      label: 'News Flash',
      text: 'This is the hourly report. The afternoon train will depart from platform two, with the next service arriving at half past three.',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {renderError && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-700/60 bg-rose-950/30 px-4 py-3 text-xs text-rose-200"><span>{renderError}</span><button type="button" onClick={() => setRenderError(null)} className="underline">Dismiss</button></div>}
      <audio
        ref={audioPlayerRef}
        onEnded={() => setIsPlayingExportedWav(false)}
        className="hidden"
      />

      {/* Attribution Banner for CMU ARCTIC & OSR */}
      <SourceVoiceAttribution />

      {/* =========================================================================
          SECTION 1: SCRIPT-FIRST NARRATION STUDIO
         ========================================================================= */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5">
        <section aria-label="Voice picker" className="rounded-2xl border border-indigo-500/25 bg-indigo-950/20 p-4 space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-300">Narration workflow</p>
              <h2 className="mt-0.5 text-base font-extrabold text-white">Choose a voice, paste a script, then test it</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">The full catalogue stays in Voice Library. This compact picker keeps the script and playback controls at the top of Voice Hub.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium">
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-200">{scriptRenderableVoices.length} script-ready</span>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-100">{sourceReferenceVoices.length} reference clips</span>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <label className="min-w-0">
              <span className="mb-1.5 block text-[11px] font-bold text-slate-300">Selected voice</span>
              <select
                aria-label="Selected voice"
                value={activeVoice.id}
                onChange={(event) => {
                  const voice = voices.find((item) => item.id === event.target.value);
                  if (voice) selectVoiceForScript(voice);
                }}
                className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-white outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
              >
                <optgroup label={`Script narration ready (${scriptRenderableVoices.length})`}>
                  {scriptRenderableVoices.map((voice) => <option key={voice.id} value={voice.id}>{voice.flag} {voice.name} — {voice.archetype}</option>)}
                </optgroup>
                <optgroup label={`Original reference clips (${sourceReferenceVoices.length})`}>
                  {sourceReferenceVoices.map((voice) => <option key={voice.id} value={voice.id}>{voice.flag} {voice.name} — reference clip only</option>)}
                </optgroup>
              </select>
            </label>
            <button
              type="button"
              onClick={() => setIsVoicePickerOpen((open) => !open)}
              aria-expanded={isVoicePickerOpen}
              className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs font-bold text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800"
            >
              <span className="inline-flex items-center gap-1.5"><ListFilter className="h-3.5 w-3.5 text-indigo-300" /> Find a voice <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isVoicePickerOpen ? 'rotate-180' : ''}`} /></span>
            </button>
          </div>

          {isVoicePickerOpen && <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                autoFocus
                type="search"
                value={voiceSearch}
                onChange={(event) => setVoiceSearch(event.target.value)}
                placeholder={`Search ${voices.length} voices by name, role, accent, or speaker`}
                className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
              />
            </label>
            <div className="mt-2 grid max-h-64 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
              {filteredVoices.map((voice) => {
                const selected = voice.id === activeVoice.id;
                const testLabel = voice.renderMode === 'source-clip-only' ? 'Original' : 'Test';
                return <div key={voice.id} className={`flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 ${selected ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-transparent hover:bg-slate-900'}`}>
                  <button type="button" onClick={() => selectVoiceForScript(voice)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-xs font-semibold text-slate-100">{voice.flag} {voice.name}{selected ? ' · selected' : ''}</span>
                    <span className="block truncate text-[10px] text-slate-400">{voice.renderMode === 'source-clip-only' ? 'Original recording — reference only' : voice.archetype}</span>
                  </button>
                  <button type="button" onClick={() => handleAuditionVoice(voice)} className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold ${auditioningCardId === voice.id ? 'border-rose-400 bg-rose-500 text-white' : 'border-slate-700 bg-slate-800 text-indigo-200 hover:bg-slate-700'}`}>
                    {auditioningCardId === voice.id ? 'Stop' : testLabel}
                  </button>
                </div>;
              })}
              {filteredVoices.length === 0 && <p className="col-span-full px-2 py-4 text-center text-xs text-slate-400">No voice matches that search.</p>}
            </div>
          </div>}
        </section>

        {/* Active Voice Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <VoiceAvatar
                id={activeVoice.id}
                name={activeVoice.name}
                color={activeVoice.avatarColor}
                size="xl"
              />
              {activeVoice.flag && (
                <div
                  className="absolute -bottom-1 -right-1 bg-slate-900 border border-slate-700/80 rounded-md px-1.5 py-0.5 text-xs shadow-md leading-none flex items-center justify-center pointer-events-none"
                  title={`Country / Accent: ${activeVoice.accent}`}
                >
                  {activeVoice.flag}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Active Selected Voice:
                </span>
                <span className="text-base font-bold text-white">{activeVoice.name}</span>
                <span className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full font-mono">
                  {activeVoice.gender} &bull; {activeVoice.accent}
                </span>
              </div>
              <p className="text-xs text-indigo-400 font-medium line-clamp-1 mt-0.5">
                {activeVoice.archetype} &bull; {activeVoice.realSpeakerName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenVoiceCreator(activeVoice)}
              className="h-9 px-3.5 rounded-xl border border-indigo-500/40 bg-indigo-950/40 hover:bg-indigo-900/40 text-indigo-300 font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              title="Open this voice in Voice Creator to sculpt a completely new sound"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>Shape in Voice Creator</span>
            </button>
          </div>
        </div>

        <VoiceRating key={activeVoice.id} voiceId={activeVoice.id} voiceName={activeVoice.name} />

        <VoiceSourceNote model={activeVoice} />

        {activeSourceOnly && <div className="flex flex-col gap-2 rounded-xl border border-amber-500/35 bg-amber-950/20 p-3 text-xs text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <span><strong>Script narration needs a voice bank.</strong> This selected item is an original reference recording, so it can only play its unprocessed source clip.</span>
          {scriptRenderableVoices[0] && <button type="button" onClick={() => selectVoiceForScript(scriptRenderableVoices[0])} className="shrink-0 rounded-lg border border-amber-300/40 bg-amber-400/10 px-3 py-1.5 text-[11px] font-bold text-amber-50 hover:bg-amber-400/20">Use {scriptRenderableVoices[0].name} for a script</button>}
        </div>}

        {/* Script Input & Template Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              {activeSourceOnly ? 'Original reference recording — script narration is unavailable:' : 'Paste or type a script:'}
            </label>
            <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
              <span>{customScript.length} chars</span>
              <span>&bull;</span>
              <span>{customScript.trim().split(/\s+/).filter(Boolean).length} words</span>
            </div>
          </div>

          <textarea
            value={customScript}
            onChange={(e) => setCustomScript(e.target.value)}
            disabled={activeSourceOnly}
            rows={3}
            placeholder={activeSourceOnly ? 'This protected source has no matching arbitrary-text voice bank.' : 'Type or paste any text for this voice to narrate...'}
            className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed font-sans disabled:cursor-not-allowed disabled:opacity-60"
          />

          {/* Script Template Quick Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold mr-1">Quick Scripts:</span>
            {scriptTemplates.map((t) => (
              <button
                key={t.label}
                onClick={() => setCustomScript(t.text)}
                disabled={activeSourceOnly}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-slate-300 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {!activeSourceOnly && <RoomEnvironmentStudio
          environmentId={environmentId}
          wet={roomWet}
          onEnvironmentChange={setEnvironmentId}
          onWetChange={setRoomWet}
        />}

        {/* Real-time Oscilloscope Wave Visualizer (In the same page) */}
        <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <AudioWaveform className="w-4 h-4 text-indigo-400" />
              Live Waveform &amp; Acoustic Oscilloscope
            </span>
            <span className="font-mono text-[10px]">
              {isPlaying ? 'Speaking live waveform' : 'Acoustic visualizer ready'}
            </span>
          </div>
          <VoiceVisualizer isPlaying={isPlaying} avatarColor={activeVoice.avatarColor} />
        </div>

        {/* Studio Action Buttons & Sliders */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Listen / Stop Narration Button */}
            <button
              onClick={handlePlayNarration}
              className={`h-10 px-5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer ${
                isPlaying
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 animate-pulse'
                  : 'bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 hover:brightness-110 text-white shadow-indigo-500/25'
              }`}
            >
              {isPlaying ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" /> Stop Narration
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5" /> {activeSourceOnly ? 'Listen to Original' : 'Test This Script'}
                </>
              )}
            </button>

            {/* Export Audio File (WAV) */}
            <button
              onClick={handleExportWav}
              disabled={isExportingWav || activeSourceOnly}
              className="h-10 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              title={activeSourceOnly ? 'This source has no matching arbitrary-text voice bank.' : 'Render and export as audio file to use as your own copy'}
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isExportingWav ? 'Rendering Audio...' : 'Export Audio File (WAV)'}</span>
            </button>
          </div>

          <div className="max-w-xs rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-[10px] leading-relaxed text-slate-400">
            <span className="font-semibold text-slate-300">Pinned voice recipe</span> · Pitch and pace are not adjusted here. Create a separate derived candidate in Voice Creator; changing a recipe requires a new validation take.
          </div>
        </div>

        {/* Exported Audio File Download Bar */}
        {exportedWavUrl && (
          <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">
                  Exported WAV: {exportedInfo?.voiceName} ({Math.round(exportedDuration)}s)
                </span>
                <span className="text-[10px] text-slate-400">
                  {exportedRenderRef.current?.manifest.environment.disclosure || 'Ready to download and use as your own copy'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveTake}
                disabled={savingTake}
                className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {takeSavedToast ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" /> Saved!
                  </>
                ) : (
                  <>
                    <BookmarkCheck className="w-3 h-3" /> Save to Vault
                  </>
                )}
              </button>

              <a
                href={exportedWavUrl}
                download={`${(exportedInfo?.voiceName || activeVoice.name).toLowerCase().replace(/\s+/g, '-')}-narration.wav`}
                className="h-8 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download Audio File (.wav)
              </a>
            </div>
          </div>
        )}
      </div>

      <aside className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-xs text-slate-400">
        <span className="font-semibold text-slate-200">Looking for source files, provenance, candidate review, or free-library exports?</span> Use <span className="font-semibold text-indigo-300">Voice Library</span>. Voice Hub is deliberately kept script-first so selecting from {voices.length} profiles never buries the narration controls.
      </aside>
    </div>
  );
};
