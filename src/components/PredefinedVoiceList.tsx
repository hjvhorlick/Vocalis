import React, { useState } from 'react';
import { VoiceModelConfig, speakVoiceText, stopSpokenVoice } from '../utils/naturalVoiceEngine';
import {
  Sliders,
  Check,
  Search,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { PersonaScriptPlayer } from './PersonaScriptPlayer';

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
  const [filterRegion, setFilterRegion] = useState<'ALL' | 'US' | 'UK' | 'CA' | 'IN' | 'EU' | 'Custom'>('ALL');
  const [filterGender, setFilterGender] = useState<'ALL' | 'Female' | 'Male'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
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

  return (
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
            100% Genuine Human Studio Recordings &bull; No Synthetic Warping &bull; Tested & Attributed
          </p>
        </div>

        {/* 100% Non-AI Human Voice Badge */}
        <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-emerald-300 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">100% Real Human Voice Actors &bull; Zero AI</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
        {/* Category Filter */}
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
              placeholder="Search speakers..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Voice Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-3.5 max-h-[420px] overflow-y-auto pr-1">
        {filteredVoices.map((voice) => {
          const isSelected = activeVoice.id === voice.id;

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
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <VoiceAvatar
                        id={voice.id}
                        name={voice.name}
                        avatarImage={voice.avatarImage}
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

                {/* Real Human Speaker Tag */}
                {voice.realSpeakerName && (
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-400 bg-emerald-950/30 px-2 py-1 rounded-lg border border-emerald-800/40 mb-2">
                    <UserCheck className="w-3 h-3 shrink-0" />
                    <span className="line-clamp-1">{voice.realSpeakerName}</span>
                  </div>
                )}

                <p className="text-[11px] text-slate-300/90 line-clamp-3 leading-relaxed mb-2 font-normal" title={voice.description}>
                  {voice.description}
                </p>

                {/* Vocalis Sample Script preview */}
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
                <PersonaScriptPlayer
                  voiceId={voice.id}
                  name={voice.name}
                  audioUrl={voice.auditionAudio}
                  script={voice.samplePhrase}
                />

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

      {filteredVoices.length === 0 && (
        <div className="text-center py-8 text-xs text-slate-500">
          No voices match your filters. Try clearing your search query.
        </div>
      )}
    </div>
  );
};

import { VoiceAvatar } from './VoiceAvatar';