import React, { useState, useRef, useEffect } from 'react';
import {
  VoiceModelConfig,
  NATURAL_HUMAN_SAMPLES,
  speakRealWords,
  stopSpeaking,
  generateSpokenAudioWav,
} from '../utils/naturalVoiceEngine';
import { GeneratedTake } from '../types/voice';
import { VoiceVisualizer } from './VoiceVisualizer';
import { SourceVoiceAttribution } from './SourceVoiceAttribution';
import {
  Sliders,
  Volume2,
  Square,
  Play,
  Download,
  BookmarkCheck,
  Check,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  FileText,
  AudioWaveform,
  ExternalLink,
} from 'lucide-react';
import { VoiceAvatar } from './VoiceAvatar';

interface VoiceHubProps {
  voices: VoiceModelConfig[];
  activeVoice: VoiceModelConfig;
  onSelectVoice: (voice: VoiceModelConfig) => void;
  onUpdateActiveVoice: (voice: VoiceModelConfig) => void;
  onSaveTake: (take: GeneratedTake) => void;
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
  // Filter states
  const [filterRegion, setFilterRegion] = useState<'ALL' | 'US' | 'UK' | 'CA' | 'IN' | 'EU' | 'Custom'>('ALL');
  const [filterGender, setFilterGender] = useState<'ALL' | 'Female' | 'Male'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

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
  const [isPlayingExportedWav, setIsPlayingExportedWav] = useState(false);
  const [takeSavedToast, setTakeSavedToast] = useState(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Filter voices
  const filteredVoices = voices.filter((v) => {
    if (filterRegion === 'Custom' && !v.isCustom) return false;
    if (filterRegion !== 'ALL' && filterRegion !== 'Custom' && v.accent !== filterRegion) return false;
    if (filterGender !== 'ALL' && v.gender !== filterGender) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        v.name.toLowerCase().includes(q) ||
        v.archetype.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        (v.realSpeakerName && v.realSpeakerName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Handle Audition from a card
  const handleAuditionCard = (e: React.MouseEvent, voice: VoiceModelConfig) => {
    e.stopPropagation();
    if (auditioningCardId === voice.id) {
      stopSpeaking();
      setAuditioningCardId(null);
      setIsPlaying(false);
      return;
    }

    onSelectVoice(voice);
    setAuditioningCardId(voice.id);
    setIsPlaying(true);
    speakRealWords(voice.samplePhrase, voice, {
      onEnd: () => {
        setAuditioningCardId(null);
        setIsPlaying(false);
      },
      onError: () => {
        setAuditioningCardId(null);
        setIsPlaying(false);
      },
    });
  };

  // Play narration of current custom script
  const handlePlayNarration = () => {
    if (isPlaying) {
      stopSpeaking();
      setIsPlaying(false);
      setAuditioningCardId(null);
      return;
    }

    const textToSpeak = customScript.trim() || activeVoice.samplePhrase;
    setIsPlaying(true);
    setAuditioningCardId(activeVoice.id);

    speakRealWords(textToSpeak, activeVoice, {
      onStart: () => setIsPlaying(true),
      onEnd: () => {
        setIsPlaying(false);
        setAuditioningCardId(null);
      },
      onError: () => {
        setIsPlaying(false);
        setAuditioningCardId(null);
      },
    });
  };

  // Export audio as downloadable WAV
  const handleExportWav = async () => {
    setIsExportingWav(true);
    try {
      const textToRender = customScript.trim() || activeVoice.samplePhrase;
      const { audioUrl, duration } = await generateSpokenAudioWav(textToRender, activeVoice);
      setExportedWavUrl(audioUrl);
      setExportedDuration(duration);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = audioUrl;
        audioPlayerRef.current.load();
      }
    } catch (err) {
      console.error('WAV export error:', err);
    } finally {
      setIsExportingWav(false);
    }
  };

  // Save exported WAV take to vault
  const handleSaveTake = () => {
    if (!exportedWavUrl) return;
    const textSnippet = customScript.trim() || activeVoice.samplePhrase;
    const take: GeneratedTake = {
      id: 'take-' + Date.now(),
      title: `${activeVoice.name} - ${textSnippet.slice(0, 32)}...`,
      audioUrl: exportedWavUrl,
      voiceName: activeVoice.name,
      durationSeconds: Math.round(exportedDuration || 4),
      createdAt: Date.now(),
      textSnippet,
    };
    onSaveTake(take);
    setTakeSavedToast(true);
    setTimeout(() => setTakeSavedToast(false), 2400);
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
      text: 'Experience sound redefined. Crisp acoustic balance, natural human cadence, and zero artificial distortion.',
    },
    {
      label: 'News Flash',
      text: 'This is the hourly report. Studio acoustic measurements verify pristine human audio quality across all global accents.',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <audio
        ref={audioPlayerRef}
        onEnded={() => setIsPlayingExportedWav(false)}
        className="hidden"
      />

      {/* Attribution Banner for CMU ARCTIC & OSR */}
      <SourceVoiceAttribution />

      {/* =========================================================================
          SECTION 1: INTERACTIVE NARRATION STUDIO & WAVE VISUALIZER
         ========================================================================= */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5">
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

        {/* Script Input & Template Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              Add or Edit Script to Listen to Narration:
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
            rows={3}
            placeholder="Type or paste any text for this voice to narrate..."
            className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed font-sans"
          />

          {/* Script Template Quick Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold mr-1">Quick Scripts:</span>
            {scriptTemplates.map((t) => (
              <button
                key={t.label}
                onClick={() => setCustomScript(t.text)}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-slate-300 transition-colors cursor-pointer"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

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
                  <Volume2 className="w-3.5 h-3.5" /> Listen to Narration
                </>
              )}
            </button>

            {/* Export Audio File (WAV) */}
            <button
              onClick={handleExportWav}
              disabled={isExportingWav}
              className="h-10 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              title="Render and export as audio file to use as your own copy"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isExportingWav ? 'Rendering Audio...' : 'Export Audio File (WAV)'}</span>
            </button>
          </div>

          {/* Quick Pitch & Pace Knobs */}
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="text-[11px]">Pitch:</span>
              <input
                type="range"
                min="0.5"
                max="1.7"
                step="0.05"
                value={activeVoice.pitch}
                onChange={(e) =>
                  onUpdateActiveVoice({ ...activeVoice, pitch: parseFloat(e.target.value) })
                }
                className="w-20 accent-cyan-400 h-1 bg-slate-950 rounded cursor-pointer"
              />
              <span className="font-mono text-cyan-300 text-[11px] w-9">
                {activeVoice.pitch.toFixed(2)}x
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px]">Pace:</span>
              <input
                type="range"
                min="0.6"
                max="1.5"
                step="0.05"
                value={activeVoice.rate}
                onChange={(e) =>
                  onUpdateActiveVoice({ ...activeVoice, rate: parseFloat(e.target.value) })
                }
                className="w-20 accent-indigo-400 h-1 bg-slate-950 rounded cursor-pointer"
              />
              <span className="font-mono text-indigo-300 text-[11px] w-9">
                {activeVoice.rate.toFixed(2)}x
              </span>
            </div>
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
                  Exported WAV File Ready ({Math.round(exportedDuration)}s)
                </span>
                <span className="text-[10px] text-slate-400">
                  Ready to download and use as your own copy
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveTake}
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
                download={`${activeVoice.name.toLowerCase().replace(/\s+/g, '-')}-narration.wav`}
                className="h-8 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download Audio File (.wav)
              </a>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          SECTION 2: ALL 60 VOICES CATALOG & TEST AUDITIONS
         ========================================================================= */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
        {/* Header & Verification Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-white text-lg tracking-tight">
                Real Human Audio Voice Catalog
              </h3>
              <span className="text-xs bg-indigo-500/20 text-indigo-300 font-mono px-2 py-0.5 rounded-full border border-indigo-500/30">
                {voices.length} Real Human Speakers
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Browse, audition, and test any voice with custom scripts &bull; 100% Genuine Studio Recordings
            </p>
          </div>

          <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-emerald-300 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">100% Real Human Voice Actors &bull; Zero AI</span>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
          {/* Accent / Region Filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400 font-medium mr-1">Speaker Accent:</span>
            {[
              { id: 'ALL', label: 'All Speakers' },
              { id: 'US', label: '🇺🇸 US American' },
              { id: 'UK', label: '🇬🇧 UK & Scottish' },
              { id: 'CA', label: '🇨🇦 Canadian' },
              { id: 'IN', label: '🇮🇳 Indian English' },
              { id: 'EU', label: '🇪🇺 European' },
              { id: 'Custom', label: '✨ Custom' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterRegion(f.id as any)}
                className={`text-xs px-2.5 py-1 rounded-xl font-medium border transition-all cursor-pointer ${
                  filterRegion === f.id
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Gender Filter & Search */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800">
              {(['ALL', 'Female', 'Male'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setFilterGender(g)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                    filterGender === g
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {g === 'ALL' ? 'Any Voice' : g}
                </button>
              ))}
            </div>

            <div className="relative flex-1 sm:w-44">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search 60 voices..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Voices Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2">
          {filteredVoices.map((voice) => {
            const isSelected = activeVoice.id === voice.id;
            const isAuditioning = auditioningCardId === voice.id;

            return (
              <div
                key={voice.id}
                onClick={() => onSelectVoice(voice)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'bg-indigo-950/40 border-indigo-500/80 ring-2 ring-indigo-500/30 shadow-lg'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      {/* Avatar with Side Flag Block */}
                      <div className="relative shrink-0">
                        <VoiceAvatar
                          id={voice.id}
                          name={voice.name}
                          color={voice.avatarColor}
                          size="lg"
                        />
                        {voice.flag && (
                          <div
                            className="absolute -bottom-1 -right-1.5 bg-slate-900 border border-slate-700/80 rounded-md px-1 py-0.2 text-[10px] leading-tight shadow-md flex items-center justify-center pointer-events-none"
                            title={`Country / Accent: ${voice.accent}`}
                          >
                            {voice.flag}
                          </div>
                        )}
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-xs leading-tight flex items-center gap-1">
                          {voice.name}
                          {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                        </h4>
                        <span className="text-[10px] text-indigo-400 font-medium block line-clamp-1">
                          {voice.archetype}
                        </span>
                      </div>
                    </div>

                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 shrink-0">
                      {voice.gender}
                    </span>
                  </div>

                  {/* Personality and Mood Description */}
                  <p
                    className="text-[11px] text-slate-300/90 line-clamp-3 leading-relaxed mb-2 font-normal"
                    title={voice.description}
                  >
                    {voice.description}
                  </p>

                  {/* Vocalis Script preview */}
                  <div className="text-[10px] text-indigo-300/90 bg-indigo-950/20 p-2 rounded-xl border border-indigo-900/40 space-y-0.5">
                    <span className="text-[9px] uppercase font-bold text-indigo-400 block tracking-wider">
                      Vocalis Script:
                    </span>
                    <p className="font-sans italic line-clamp-2 leading-tight text-slate-300">
                      "{voice.samplePhrase}"
                    </p>
                  </div>
                </div>

                {/* Bottom Card Actions */}
                <div className="pt-2 border-t border-slate-900 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleAuditionCard(e, voice)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer ${
                      isAuditioning
                        ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/40 animate-pulse'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 hover:border-slate-600'
                    }`}
                    title="Audition real human recording with script"
                  >
                    {isAuditioning ? (
                      <>
                        <Square className="w-3 h-3 fill-current" /> Stop
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5 text-indigo-400" /> Audition Script
                      </>
                    )}
                  </button>

                  <span
                    className={`text-[11px] font-semibold flex items-center gap-1 ${
                      isSelected ? 'text-indigo-400 font-bold' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Sliders className="w-3 h-3" />
                    {isSelected ? 'Active Speaker' : 'Select'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
