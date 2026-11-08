import React, { useState } from 'react';
import { VoiceModelConfig, speakVoiceText, stopSpokenVoice } from '../utils/naturalVoiceEngine';
import { GeneratedTake } from '../types/voice';
import {
  BookmarkCheck,
  Play,
  Square,
  Sliders,
  Mic2,
  Trash2,
  Download,
  AudioWaveform,
  Plus,
  Volume2,
} from 'lucide-react';
import { VoiceAvatar } from './VoiceAvatar';

interface VoiceLibraryProps {
  models: VoiceModelConfig[];
  savedTakes: GeneratedTake[];
  onSelectModelForShaper: (m: VoiceModelConfig) => void;
  onSelectModelForStudio: (m: VoiceModelConfig) => void;
  onDeleteCustomModel: (id: string) => void;
  onDeleteTake: (id: string) => void;
  onGoToNewModel: () => void;
}

export const VoiceLibrary: React.FC<VoiceLibraryProps> = ({
  models,
  savedTakes,
  onSelectModelForShaper,
  onSelectModelForStudio,
  onDeleteCustomModel,
  onDeleteTake,
  onGoToNewModel,
}) => {
  const [activeTab, setActiveTab] = useState<'models' | 'takes'>('models');
  const [auditioningId, setAuditioningId] = useState<string | null>(null);

  const handleAudition = (m: VoiceModelConfig) => {
    if (auditioningId === m.id) {
      stopSpokenVoice();
      setAuditioningId(null);
      return;
    }

    setAuditioningId(m.id);
    speakVoiceText(m.samplePhrase, m, {
      onEnd: () => setAuditioningId(null),
      onError: () => setAuditioningId(null),
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Vault Tabs Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveTab('models')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'models'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Voice Models ({models.length})
          </button>
          <button
            onClick={() => setActiveTab('takes')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'takes'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Saved Audio Takes ({savedTakes.length})
          </button>
        </div>

        {activeTab === 'models' && (
          <button
            onClick={onGoToNewModel}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-xs font-semibold shadow hover:brightness-110 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Shape New Voice
          </button>
        )}
      </div>

      {/* Models Grid */}
      {activeTab === 'models' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {models.map((model) => {
            const isAuditioning = auditioningId === model.id;
            return (
              <div
                key={model.id}
                className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col justify-between hover:border-slate-700 transition-all space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <VoiceAvatar
                          id={model.id}
                          name={model.name}
                          avatarImage={model.avatarImage}
                          color={model.avatarColor}
                          size="lg"
                        />
                        {model.flag && (
                          <div
                            className="absolute -bottom-1 -right-1.5 bg-slate-900 border border-slate-700/80 rounded-md px-1 py-0.2 text-[10px] leading-tight shadow-md flex items-center justify-center pointer-events-none"
                            title={`Origin / Accent: ${model.accent}`}
                          >
                            {model.flag}
                          </div>
                        )}
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">{model.name}</h4>
                        <span className="text-xs text-indigo-400 font-medium block">
                          {model.archetype}
                        </span>
                      </div>
                    </div>

                    {model.isCustom && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        Custom
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 mb-2">
                    {model.description}
                  </p>

                  {/* Vocalis Script preview */}
                  <div className="text-[10px] text-indigo-300/90 bg-indigo-950/20 p-2 rounded-xl border border-indigo-900/40 mb-3 space-y-0.5">
                    <span className="text-[9px] uppercase font-bold text-indigo-400 block tracking-wider">
                      Audition Script:
                    </span>
                    <p className="font-sans italic line-clamp-2 leading-tight text-slate-300">
                      "{model.samplePhrase}"
                    </p>
                  </div>

                  {/* Characteristic Badges */}
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-mono text-slate-400 mb-2">
                    <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                      Pitch: {model.pitch.toFixed(2)}x
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                      Speed: {model.rate.toFixed(2)}x
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 capitalize">
                      {model.toneStyle}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleAudition(model)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      isAuditioning
                        ? 'bg-rose-600 text-white animate-pulse'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                    }`}
                    title="Audition Spoken Script"
                  >
                    {isAuditioning ? (
                      <>
                        <Square className="w-3.5 h-3.5 fill-current" /> Stop
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" /> Audition Script
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onSelectModelForShaper(model)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center gap-1 transition-colors"
                      title="Tune in Voice Shaper"
                    >
                      <Sliders className="w-3.5 h-3.5" /> Tune
                    </button>

                    <button
                      onClick={() => onSelectModelForStudio(model)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1 shadow transition-colors"
                      title="Speak with this voice in Studio"
                    >
                      <Mic2 className="w-3.5 h-3.5" /> Speak
                    </button>

                    {model.isCustom && (
                      <button
                        onClick={() => onDeleteCustomModel(model.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition-colors"
                        title="Delete Custom Voice"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Audio Takes Archive */}
      {activeTab === 'takes' && (
        <div className="space-y-3">
          {savedTakes.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center max-w-lg mx-auto">
              <AudioWaveform className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <h4 className="font-bold text-white text-sm">No Saved Audio Takes</h4>
              <p className="text-xs text-slate-400 mt-1">
                Generate WAV speech in the Speech Studio and click &quot;Save to Library&quot; to archive takes here.
              </p>
            </div>
          ) : (
            savedTakes.map((take) => (
              <div
                key={take.id}
                className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 shrink-0">
                    <AudioWaveform className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="font-bold text-white text-sm">{take.title}</h5>
                    <p className="text-xs text-slate-400 italic mt-0.5 line-clamp-1">
                      &ldquo;{take.textSnippet}&rdquo;
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                      <span>Voiced by: {take.voiceName}</span>
                      <span>&bull;</span>
                      <span>Duration: {take.durationSeconds}s</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <audio src={take.audioUrl} controls className="h-8 max-w-[200px]" />
                  <a
                    href={take.audioUrl}
                    download={`${take.title.slice(0, 20)}.wav`}
                    className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white"
                    title="Download WAV"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => onDeleteTake(take.id)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Delete Take"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
