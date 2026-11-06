import React, { useState, useEffect } from 'react';
import {
  VoiceModelConfig,
  getAvailableSystemVoices,
  speakRealWords,
  stopSpeaking,
} from '../utils/naturalVoiceEngine';
import {
  Sliders,
  Volume2,
  Square,
  Play,
  RotateCcw,
  BookmarkPlus,
  Check,
  Sparkles,
  Layers,
  Wand2,
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
  const [isAuditioning, setIsAuditioning] = useState(false);
  const [activeWordChar, setActiveWordChar] = useState<{ start: number; length: number } | null>(null);
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [savedToast, setSavedToast] = useState(false);

  // Load browser voices
  useEffect(() => {
    const loadVoices = () => {
      const v = getAvailableSystemVoices();
      setSystemVoices(v);
    };

    loadVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const handleAudition = () => {
    if (isAuditioning) {
      stopSpeaking();
      setIsAuditioning(false);
      setActiveWordChar(null);
      return;
    }

    setIsAuditioning(true);
    speakRealWords(voice.samplePhrase, voice, {
      onStart: () => setIsAuditioning(true),
      onWord: (charIndex, charLength) => {
        setActiveWordChar({ start: charIndex, length: charLength });
      },
      onEnd: () => {
        setIsAuditioning(false);
        setActiveWordChar(null);
      },
      onError: () => {
        setIsAuditioning(false);
        setActiveWordChar(null);
      },
    });
  };

  const handleSave = () => {
    const customCopy: VoiceModelConfig = {
      ...voice,
      id: voice.isCustom ? voice.id : `custom-${Date.now()}`,
      name: voice.isCustom ? voice.name : `${voice.name} (Manipulated)`,
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
                Manipulating Voice:
              </span>
              <span className="text-base font-bold text-white">{voice.name}</span>
              {voice.isCustom && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Custom
                </span>
              )}
            </div>
            <p className="text-xs text-indigo-400 font-medium">
              {voice.archetype} &bull; {voice.accent} Accent &bull; {voice.gender}
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onResetToDefault}
            className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-1.5 transition-colors"
            title="Reset sliders to voice preset default"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Voice
          </button>

          <button
            onClick={handleSave}
            className="text-xs font-semibold px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow transition-colors"
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

      {/* Main Sliders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
            <span>0.50x (Deep Baritone)</span>
            <span>1.0x (Normal)</span>
            <span>1.75x (High Pitch)</span>
          </div>
        </div>

        {/* Speed / Rate Slider */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-300">Cadence & Speech Speed</span>
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

        {/* Volume & Delivery Mode */}
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
            <span>100% (Full Resonance)</span>
          </div>
        </div>
      </div>

      {/* Tone Style & Native Voice Selector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-1">
        {/* Tone Styles */}
        <div className="lg:col-span-7 space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
            Acoustic Character & Delivery Tone
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { id: 'natural', label: 'Natural' },
              { id: 'deep', label: 'Deep Cinema' },
              { id: 'energetic', label: 'High Energy' },
              { id: 'whisper', label: 'Whisper' },
              { id: 'radio', label: '1930s Radio' },
              { id: 'robot', label: 'Cyber Droid' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => onUpdateVoice({ ...voice, toneStyle: t.id as any })}
                className={`py-2 px-2 text-xs font-semibold rounded-xl border text-center transition-all ${
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

        {/* Native Vocal Engine Mapping */}
        <div className="lg:col-span-5 space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
            Underlying Device Voice
          </label>
          <select
            value={voice.systemVoiceURI || ''}
            onChange={(e) => onUpdateVoice({ ...voice, systemVoiceURI: e.target.value })}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Auto-Pair Authentic {voice.accent} Accent ({voice.gender})</option>
            {systemVoices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Audition Bar for the Manipulated Voice */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Audition Manipulated Voice (Real Spoken Words):</span>
          </div>
          {isAuditioning && activeWordChar ? (
            <p className="text-xs text-slate-200 leading-relaxed font-sans">
              <span>{voice.samplePhrase.slice(0, activeWordChar.start)}</span>
              <span className="bg-indigo-500 text-white font-bold px-1.5 py-0.5 rounded shadow inline-block">
                {voice.samplePhrase.slice(
                  activeWordChar.start,
                  activeWordChar.start + activeWordChar.length
                )}
              </span>
              <span>{voice.samplePhrase.slice(activeWordChar.start + activeWordChar.length)}</span>
            </p>
          ) : (
            <input
              type="text"
              value={voice.samplePhrase}
              onChange={(e) => onUpdateVoice({ ...voice, samplePhrase: e.target.value })}
              className="w-full bg-transparent border-none text-xs text-slate-200 focus:outline-none font-sans"
              placeholder="Type test sentence..."
            />
          )}
        </div>

        <button
          onClick={handleAudition}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all shrink-0 ${
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
              <Play className="w-3.5 h-3.5 fill-current" /> Test Manipulated Voice
            </>
          )}
        </button>
      </div>
    </div>
  );
};
