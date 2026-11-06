import React, { useState } from 'react';
import { VoiceModelConfig, speakRealWords, stopSpeaking } from '../utils/naturalVoiceEngine';
import {
  Sliders,
  Play,
  Square,
  BookmarkPlus,
  RotateCcw,
  Volume2,
  Check,
  ChevronRight,
  Sparkles,
  Layers,
} from 'lucide-react';

interface VoiceShaperProps {
  model: VoiceModelConfig;
  onUpdateModel: (updated: VoiceModelConfig) => void;
  onSaveModel: (model: VoiceModelConfig) => void;
  onSelectForStudio: (model: VoiceModelConfig) => void;
}

export const VoiceShaper: React.FC<VoiceShaperProps> = ({
  model,
  onUpdateModel,
  onSaveModel,
  onSelectForStudio,
}) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeWordRange, setActiveWordRange] = useState<{ start: number; length: number } | null>(
    null
  );
  const [savedToast, setSavedToast] = useState(false);

  const handleAudition = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      setActiveWordRange(null);
      return;
    }

    setIsSpeaking(true);
    speakRealWords(model.samplePhrase, model, {
      onStart: () => setIsSpeaking(true),
      onWord: (timing) => {
        setActiveWordRange({ start: timing.charIndex, length: timing.charLength });
      },
      onEnd: () => {
        setIsSpeaking(false);
        setActiveWordRange(null);
      },
      onError: () => {
        setIsSpeaking(false);
        setActiveWordRange(null);
      },
    });
  };

  const handleSave = () => {
    onSaveModel(model);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-indigo-950/70 via-slate-900 to-indigo-950/70 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Sliders className="w-4 h-4" />
            Voice Creation & Acoustic Shaper
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Shape Local Synthetic Voice Profiles
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Shape pitch, pacing, pronunciation, and timbre in local speech synthesis. CMU ARCTIC human-recorded units are the default; mathematical formant synthesis is available as an experimental alternative. No AI or cloud TTS is used.
          </p>
        </div>
      </div>

      {/* Main Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Identity & Voice Engine Core */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-white shadow-md text-base"
                  style={{ backgroundColor: model.avatarColor }}
                >
                  {model.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">{model.name}</h3>
                  <span className="text-xs text-indigo-400 font-medium">{model.archetype}</span>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {model.gender}
              </span>
            </div>

            {/* Name & Archetype Edit */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                  Voice Name
                </label>
                <input
                  type="text"
                  value={model.name}
                  onChange={(e) => onUpdateModel({ ...model, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                  Vocal Character
                </label>
                <input
                  type="text"
                  value={model.archetype}
                  onChange={(e) => onUpdateModel({ ...model, archetype: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            {/* Gender Select */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                Vocal Register / Gender
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Female', 'Male', 'Neutral'] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => onUpdateModel({ ...model, gender: g })}
                    className={`py-2 rounded-xl text-xs font-semibold border text-center transition-colors ${
                      model.gender === g
                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Tone Style Mode */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                Acoustic Tone & Delivery Mode
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'natural', label: 'Natural & Clear' },
                  { id: 'deep', label: 'Deep Cinema' },
                  { id: 'energetic', label: 'High-Energy' },
                  { id: 'whisper', label: 'Soft Whisper' },
                  { id: 'radio', label: '1930s Radio' },
                  { id: 'robot', label: 'Cyber Droid' },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => onUpdateModel({ ...model, toneStyle: st.id as any })}
                    className={`py-2 px-2 text-xs font-medium rounded-xl border text-center transition-all ${
                      model.toneStyle === st.id
                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Pitch, Rate, Audition Stage */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-sm font-semibold text-white">Vocal Pitch & Pacing Knobs</span>
              <button
                onClick={() =>
                  onUpdateModel({
                    ...model,
                    pitch: 1.0,
                    rate: 1.0,
                    volume: 1.0,
                    toneStyle: 'natural',
                  })
                }
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>

            {/* Sliders */}
            <div className="space-y-5">
              {/* Pitch Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Vocal Pitch (Frequency Height)</span>
                  <span className="font-mono text-cyan-400 font-bold">
                    {model.pitch.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.7"
                  step="0.05"
                  value={model.pitch}
                  onChange={(e) => onUpdateModel({ ...model, pitch: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-500 h-1.5 bg-slate-950 rounded cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>0.5x (Deep Bass Baritone)</span>
                  <span>1.0x (Natural)</span>
                  <span>1.7x (High Soprano / Youth)</span>
                </div>
              </div>

              {/* Rate / Speed Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Speech Rate (Cadence Pacing)</span>
                  <span className="font-mono text-indigo-400 font-bold">
                    {model.rate.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="1.5"
                  step="0.05"
                  value={model.rate}
                  onChange={(e) => onUpdateModel({ ...model, rate: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-500 h-1.5 bg-slate-950 rounded cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>0.6x (Deliberate & Slow)</span>
                  <span>1.0x (Normal)</span>
                  <span>1.5x (Brisk Broadcast)</span>
                </div>
              </div>

              {/* Volume Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Audio Level</span>
                  <span className="font-mono text-amber-400 font-bold">
                    {Math.round(model.volume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="1.0"
                  step="0.05"
                  value={model.volume}
                  onChange={(e) => onUpdateModel({ ...model, volume: parseFloat(e.target.value) })}
                  className="w-full accent-amber-500 h-1.5 bg-slate-950 rounded cursor-pointer"
                />
              </div>
            </div>

            {/* Audition Stage */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Audition Synthesized Sentence</span>
                <span className="text-[10px] text-indigo-400 font-normal">
                  Click below to hear actual words spoken aloud
                </span>
              </label>

              {/* Text display with dynamic word highlight when speaking */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs leading-relaxed text-slate-200">
                {isSpeaking && activeWordRange ? (
                  <span>
                    {model.samplePhrase.slice(0, activeWordRange.start)}
                    <span className="bg-indigo-500 text-white font-bold px-1 rounded shadow">
                      {model.samplePhrase.slice(
                        activeWordRange.start,
                        activeWordRange.start + activeWordRange.length
                      )}
                    </span>
                    {model.samplePhrase.slice(activeWordRange.start + activeWordRange.length)}
                  </span>
                ) : (
                  <input
                    type="text"
                    value={model.samplePhrase}
                    onChange={(e) => onUpdateModel({ ...model, samplePhrase: e.target.value })}
                    className="w-full bg-transparent border-none text-xs text-white focus:outline-none"
                  />
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  onClick={handleAudition}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all ${
                    isSpeaking
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 animate-pulse'
                      : 'bg-gradient-to-r from-indigo-500 to-cyan-500 hover:brightness-110 text-white shadow-indigo-500/25'
                  }`}
                >
                  {isSpeaking ? (
                    <>
                      <Square className="w-3.5 h-3.5 fill-current" /> Stop Speaking
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" /> Hear Synthesized Voice
                    </>
                  )}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSave}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    {savedToast ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" /> Saved to Library!
                      </>
                    ) : (
                      <>
                        <BookmarkPlus className="w-4 h-4" /> Save Voice Model
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => onSelectForStudio(model)}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    Open in Speech Studio <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
