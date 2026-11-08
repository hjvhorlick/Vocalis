import React, { useState } from 'react';
import { VoiceModelConfig, speakRealWords, stopSpeaking } from '../utils/naturalVoiceEngine';
import {
  Volume2,
  Square,
  Sliders,
  Check,
  Search,
  ShieldCheck,
} from 'lucide-react';

interface PredefinedVoiceListProps {
  voices: VoiceModelConfig[];
  activeVoice: VoiceModelConfig;
  onSelectVoice: (voice: VoiceModelConfig) => void;
  onNewVoice?: () => void;
}

export const PredefinedVoiceList: React.FC<PredefinedVoiceListProps> = ({
  voices,
  activeVoice,
  onSelectVoice,
}) => {
  const [filterRegion, setFilterRegion] = useState<'ALL' | 'US' | 'UK' | 'AU' | 'Global' | 'Custom'>('ALL');
  const [filterGender, setFilterGender] = useState<'ALL' | 'Female' | 'Male'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [auditioningId, setAuditioningId] = useState<string | null>(null);

  const handleAudition = (e: React.MouseEvent, voice: VoiceModelConfig) => {
    e.stopPropagation();
    if (auditioningId === voice.id) {
      stopSpeaking();
      setAuditioningId(null);
      return;
    }

    setAuditioningId(voice.id);
    speakRealWords(voice.samplePhrase, voice, {
      onEnd: () => setAuditioningId(null),
      onError: () => setAuditioningId(null),
    });
  };

  const filteredVoices = voices.filter((v) => {
    if (filterRegion === 'Custom' && !v.isCustom) return false;
    if (filterRegion !== 'ALL' && filterRegion !== 'Custom' && v.accent !== filterRegion) return false;
    if (filterGender !== 'ALL' && v.gender !== filterGender) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        v.name.toLowerCase().includes(q) ||
        v.archetype.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
      {/* Header & Verification Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-white text-lg tracking-tight">
              Acoustic Voice Character Transformations
            </h3>
            <span className="text-xs bg-indigo-500/20 text-indigo-300 font-mono px-2 py-0.5 rounded-full border border-indigo-500/30">
              {voices.length} Configured
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Crafted from real human speech recordings (CMU ARCTIC) & transformed via Web Audio DSP.
          </p>
        </div>

        {/* 100% Non-AI Human Voice Badge */}
        <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-emerald-300 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">100% Non-AI &bull; Real Human Studio Voice Foundation</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
        {/* Category Filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-400 font-medium mr-1">Filter:</span>
          {[
            { id: 'ALL', label: 'All Voices' },
            { id: 'US', label: '🇺🇸 North America' },
            { id: 'UK', label: '🇬🇧 British' },
            { id: 'Global', label: '🌐 Global / Sci-Fi' },
            { id: 'Custom', label: '✨ Custom Crafted' },
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
              placeholder="Search voices..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Voice Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[380px] overflow-y-auto pr-1">
        {filteredVoices.map((voice) => {
          const isSelected = activeVoice.id === voice.id;
          const isAuditioning = auditioningId === voice.id;

          return (
            <div
              key={voice.id}
              onClick={() => onSelectVoice(voice)}
              className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                isSelected
                  ? 'bg-indigo-950/40 border-indigo-500/80 ring-2 ring-indigo-500/30 shadow-lg'
                  : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-sm text-sm shrink-0"
                      style={{ backgroundColor: voice.avatarColor }}
                    >
                      {voice.flag || voice.name.charAt(0)}
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

                <p className="text-[11px] text-slate-300/90 line-clamp-2 leading-relaxed mb-2 font-normal">
                  {voice.description}
                </p>

                {/* Rate and character. No pitch: the voice keeps the one it was recorded at. */}
                <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                    Rate: {voice.rate.toFixed(2)}x
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 capitalize">
                    {voice.toneStyle}
                  </span>
                </div>
              </div>

              {/* Bottom Card Actions */}
              <div className="pt-2 border-t border-slate-900 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={(e) => handleAudition(e, voice)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer ${
                    isAuditioning
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/40 animate-pulse'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 hover:border-slate-600'
                  }`}
                  title="Audition transformed voice"
                >
                  {isAuditioning ? (
                    <>
                      <Square className="w-3 h-3 fill-current" /> Stop
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-indigo-400" /> Audition
                    </>
                  )}
                </button>

                <span
                  className={`text-[11px] font-semibold flex items-center gap-1 ${
                    isSelected ? 'text-indigo-400 font-bold' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Sliders className="w-3 h-3" />
                  {isSelected ? 'Editing' : 'Tune Knobs'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {filteredVoices.length === 0 && (
        <div className="text-center py-8 text-xs text-slate-500">
          No voices match your filters. Try clearing your search query.
        </div>
      )}
    </div>
  );
};
