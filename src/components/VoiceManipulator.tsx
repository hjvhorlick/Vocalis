import React, { useState } from 'react';
import {
  VoiceModelConfig,
  NATURAL_HUMAN_SAMPLES,
  speakRealWords,
  stopSpeaking,
} from '../utils/naturalVoiceEngine';
import { VoiceVisualizer } from './VoiceVisualizer';
import {
  Sliders,
  Volume2,
  Square,
  Play,
  RotateCcw,
  BookmarkPlus,
  Check,
  Waves,
  User,
  Activity,
} from 'lucide-react';

interface VoiceManipulatorProps {
  voice: VoiceModelConfig;
  onUpdateVoice: (updated: VoiceModelConfig) => void;
  onSaveAsCustom: (saved: VoiceModelConfig) => void;
  onResetToDefault: () => void;
}

export const VoiceManipulator: React.FC<VoiceManipulatorProps> = ({
  voice,
  onUpdateVoice,
  onSaveAsCustom,
  onResetToDefault,
}) => {
  // The engine caps every resonance control at ±3 dB; showing the stored number
  // when it is larger would describe audio that is not being produced.
  const shownDb = (value: number | undefined) => {
    const clamped = Math.max(-3, Math.min(3, value ?? 0));
    return clamped > 0 ? `+${clamped}` : `${clamped}`;
  };
  const [isAuditioning, setIsAuditioning] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const handleAudition = () => {
    if (isAuditioning) {
      stopSpeaking();
      setIsAuditioning(false);
      return;
    }

    setIsAuditioning(true);
    speakRealWords(voice.samplePhrase, voice, {
      onStart: () => setIsAuditioning(true),
      onEnd: () => setIsAuditioning(false),
      onError: () => setIsAuditioning(false),
    });
  };

  const handleSave = () => {
    const customCopy: VoiceModelConfig = {
      ...voice,
      id: voice.isCustom ? voice.id : `custom-${Date.now()}`,
      name: voice.isCustom ? voice.name : `${voice.name} (Custom DSP)`,
      isCustom: true,
    };
    onSaveAsCustom(customCopy);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5">
      {/* Manipulator Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg text-white shadow-md shrink-0"
            style={{ backgroundColor: voice.avatarColor }}
          >
            {voice.flag || voice.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-400">
                Manipulating Acoustic Voice:
              </span>
              <span className="text-base font-bold text-white">{voice.name}</span>
              {voice.isCustom && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Custom
                </span>
              )}
            </div>
            <p className="text-xs text-indigo-400 font-medium">
              {voice.archetype} &bull; Web Audio DSP Shaper &bull; {voice.gender}
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onResetToDefault}
            className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Reset sliders to default"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Voice
          </button>

          <button
            onClick={handleSave}
            className="text-xs font-semibold px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow transition-colors cursor-pointer"
          >
            {savedToast ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Saved to Predefined!
              </>
            ) : (
              <>
                <BookmarkPlus className="w-3.5 h-3.5" /> Save as Custom Voice
              </>
            )}
          </button>
        </div>
      </div>

      {/* Source Natural Voice Selection */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-indigo-400" />
            Base Human Voice Source (Clean Studio Acoustic Recording)
          </label>
          <span className="text-[10px] text-emerald-400 font-mono">100% Non-AI Human</span>
        </div>

        <select
          value={voice.baseSampleId}
          onChange={(e) => onUpdateVoice({ ...voice, baseSampleId: e.target.value })}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-medium focus:ring-1 focus:ring-indigo-500"
        >
          {NATURAL_HUMAN_SAMPLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.speaker}) &bull; "{s.transcript}"
            </option>
          ))}
        </select>
        <p className="text-[10px] text-slate-500">
          Source: CMU ARCTIC Speech Corpus (Carnegie Mellon University). Free open scientific data.
        </p>
      </div>

      {/* Main Sliders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pitch Slider */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-300">Vocal Pitch Height</span>
            <span className="font-mono text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
              {voice.pitch.toFixed(2)}x
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="1.75"
            step="0.05"
            value={voice.pitch}
            onChange={(e) => onUpdateVoice({ ...voice, pitch: parseFloat(e.target.value) })}
            className="w-full accent-cyan-500 h-1.5 bg-slate-900 rounded cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-medium">
            <span>0.50x (Deep Bass)</span>
            <span>1.0x (Natural)</span>
            <span>1.75x (Soprano)</span>
          </div>
        </div>

        {/* Speed / Rate Slider */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-300">Speech Cadence Rate</span>
            <span className="font-mono text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
              {voice.rate.toFixed(2)}x
            </span>
          </div>
          <input
            type="range"
            min="0.6"
            max="1.5"
            step="0.05"
            value={voice.rate}
            onChange={(e) => onUpdateVoice({ ...voice, rate: parseFloat(e.target.value) })}
            className="w-full accent-indigo-500 h-1.5 bg-slate-900 rounded cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-medium">
            <span>0.60x (Deliberate)</span>
            <span>1.0x (Standard)</span>
            <span>1.50x (Brisk Pacing)</span>
          </div>
        </div>

        {/* Volume Output */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-300">Volume Output</span>
            <span className="font-mono text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              {Math.round(voice.volume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.2"
            max="1.0"
            step="0.05"
            value={voice.volume}
            onChange={(e) => onUpdateVoice({ ...voice, volume: parseFloat(e.target.value) })}
            className="w-full accent-amber-500 h-1.5 bg-slate-900 rounded cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-medium">
            <span>20% (Subtle)</span>
            <span>100% (Full Level)</span>
          </div>
        </div>
      </div>

      {/* Vocal Tract Formant Resonance Filters (F1, F2, F3) */}
      <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Waves className="w-3.5 h-3.5 text-cyan-400" />
            Vocal Tract Tilt (Resonance & Timbre)
          </label>
          <span className="text-[10px] text-slate-500 font-mono">Wide-band tilt, ±3 dB</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* F1 Throat Warmth */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Throat & Chest Warmth (F1 450 Hz)</span>
              <span className="font-mono text-cyan-300 font-bold">
                {shownDb(voice.throatWarmth)} dB
              </span>
            </div>
            <input
              type="range"
              min="-3"
              max="3"
              step="1"
              value={Math.max(-3, Math.min(3, voice.throatWarmth ?? 0))}
              onChange={(e) =>
                onUpdateVoice({ ...voice, throatWarmth: parseFloat(e.target.value) })
              }
              className="w-full accent-cyan-400 h-1 bg-slate-900 rounded cursor-pointer"
            />
          </div>

          {/* F2 Oral Clarity */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Oral Cavity Clarity (F2 1.8 kHz)</span>
              <span className="font-mono text-indigo-300 font-bold">
                {shownDb(voice.oralClarity)} dB
              </span>
            </div>
            <input
              type="range"
              min="-3"
              max="3"
              step="1"
              value={Math.max(-3, Math.min(3, voice.oralClarity ?? 0))}
              onChange={(e) =>
                onUpdateVoice({ ...voice, oralClarity: parseFloat(e.target.value) })
              }
              className="w-full accent-indigo-400 h-1 bg-slate-900 rounded cursor-pointer"
            />
          </div>

          {/* F3 Air Presence */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Air & Breath Presence (F3 4.2 kHz)</span>
              <span className="font-mono text-purple-300 font-bold">
                {shownDb(voice.airPresence)} dB
              </span>
            </div>
            <input
              type="range"
              min="-3"
              max="3"
              step="1"
              value={Math.max(-3, Math.min(3, voice.airPresence ?? 0))}
              onChange={(e) =>
                onUpdateVoice({ ...voice, airPresence: parseFloat(e.target.value) })
              }
              className="w-full accent-purple-400 h-1 bg-slate-900 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Tone Style Mode */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
          Acoustic Tone & Delivery Mode
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          {[
            { id: 'natural', label: 'Natural Clean' },
            { id: 'deep', label: 'Deep Cinema' },
            { id: 'energetic', label: 'High Energy' },
            { id: 'whisper', label: 'Soft Whisper' },
            { id: 'radio', label: '1930s Radio' },
            { id: 'robot', label: 'Cyber Droid' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => onUpdateVoice({ ...voice, toneStyle: t.id as any })}
              className={`py-2 px-2 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                voice.toneStyle === t.id
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Real-time Oscilloscope Waveform Visualizer */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            Live Acoustic Oscilloscope Output
          </span>
          <span className="font-mono text-[10px]">
            {isAuditioning ? 'Playing converted voice' : 'Idle'}
          </span>
        </div>
        <VoiceVisualizer isPlaying={isAuditioning} avatarColor={voice.avatarColor} />
      </div>

      {/* Audition Bar for the Manipulated Voice */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Spoken Sentence (Natural Human Voice):</span>
          </div>
          <p className="text-xs text-slate-200 font-medium">"{voice.samplePhrase}"</p>
        </div>

        <button
          onClick={handleAudition}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all shrink-0 cursor-pointer ${
            isAuditioning
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 animate-pulse'
              : 'bg-gradient-to-r from-indigo-500 to-cyan-500 hover:brightness-110 text-white shadow-indigo-500/25'
          }`}
        >
          {isAuditioning ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" /> Stop Audio
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" /> Hear Transformed Voice
            </>
          )}
        </button>
      </div>
    </div>
  );
};
