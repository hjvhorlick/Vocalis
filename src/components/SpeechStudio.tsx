import React, { useState, useRef } from 'react';
import {
  VoiceModelConfig,
  addLocalPronunciation,
  speakRealWords,
  stopSpeaking,
  generateSpokenAudioWav,
} from '../utils/naturalVoiceEngine';
import { GeneratedTake } from '../types/voice';
import {
  Mic2,
  Play,
  Square,
  Download,
  BookmarkCheck,
  AudioWaveform,
  Volume2,
  Check,
  RotateCcw,
  Sparkles,
  Copy,
  Trash2,
} from 'lucide-react';

interface SpeechStudioProps {
  models: VoiceModelConfig[];
  activeModel: VoiceModelConfig;
  onSelectModel: (m: VoiceModelConfig) => void;
  onUpdateActiveModel?: (m: VoiceModelConfig) => void;
  onSaveTake: (take: GeneratedTake) => void;
}

export const SpeechStudio: React.FC<SpeechStudioProps> = ({
  models,
  activeModel,
  onSelectModel,
  onUpdateActiveModel,
  onSaveTake,
}) => {
  const [scriptText, setScriptText] = useState<string>(
    'Welcome to Vocalis Voice Studio. Vocalis generates speech locally with mathematical formant synthesis.'
  );
  const [copied, setCopied] = useState(false);

  // Live spoken state
  const [isSpeakingAloud, setIsSpeakingAloud] = useState(false);
  const [activeWordChar, setActiveWordChar] = useState<{ start: number; length: number } | null>(
    null
  );

  // Generated WAV state
  const [isRenderingWav, setIsRenderingWav] = useState(false);
  const [generatedWavUrl, setGeneratedWavUrl] = useState<string | null>(null);
  const [isPlayingWav, setIsPlayingWav] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [takeSaved, setTakeSaved] = useState(false);
  const [pronunciationWord, setPronunciationWord] = useState('');
  const [pronunciationHint, setPronunciationHint] = useState('');
  const [pronunciationMessage, setPronunciationMessage] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const scriptPresets = [
    {
      title: 'Audiobook Fiction',
      text: 'The evening shadows stretched across the cobbled street. Inside the old clockmaker workshop, a single golden pendulum swung in perfect rhythm.',
    },
    {
      title: 'Mindfulness Meditation',
      text: 'Take a slow, deep breath in through your nose. Hold it for a gentle moment. Now exhale completely, and let all stress dissolve.',
    },
    {
      title: 'Podcast Intro',
      text: 'Welcome back to the podcast! Today we are discussing vocal acoustics, character design, and the future of human speech synthesis.',
    },
    {
      title: 'Cinema Movie Trailer',
      text: 'In a world where voices define destiny, one creator dared to speak when all others remained silent.',
    },
    {
      title: 'Radio Weather Report',
      text: 'Good morning listeners! High pressure brings clear blue skies across the coast with afternoon breezes reaching fifteen knots.',
    },
  ];

  // Speak aloud through speakers
  const handleSpeakAloud = () => {
    if (isSpeakingAloud) {
      stopSpeaking();
      setIsSpeakingAloud(false);
      setActiveWordChar(null);
      return;
    }

    setIsSpeakingAloud(true);
    speakRealWords(scriptText, activeModel, {
      onStart: () => setIsSpeakingAloud(true),
      onWord: (charIndex, charLength) => {
        setActiveWordChar({ start: charIndex, length: charLength });
      },
      onEnd: () => {
        setIsSpeakingAloud(false);
        setActiveWordChar(null);
      },
      onError: () => {
        setIsSpeakingAloud(false);
        setActiveWordChar(null);
      },
    });
  };

  // Render downloadable WAV audio
  const handleRenderWav = async () => {
    if (!scriptText.trim()) return;
    setIsRenderingWav(true);
    try {
      const { audioUrl } = await generateSpokenAudioWav(scriptText, activeModel);
      setGeneratedWavUrl(audioUrl);
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.load();
      }
    } catch (err) {
      console.error('WAV render failed:', err);
    } finally {
      setIsRenderingWav(false);
    }
  };

  const toggleWavPlay = () => {
    if (!audioRef.current || !generatedWavUrl) return;
    if (isPlayingWav) {
      audioRef.current.pause();
      setIsPlayingWav(false);
    } else {
      audioRef.current.play();
      setIsPlayingWav(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleSeek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleSaveTake = () => {
    if (!generatedWavUrl) return;
    const take: GeneratedTake = {
      id: 'take-' + Date.now(),
      title: `${activeModel.name} - ${scriptText.slice(0, 30)}...`,
      audioUrl: generatedWavUrl,
      voiceName: activeModel.name,
      durationSeconds: duration || Math.round(scriptText.split(/\s+/).length * 0.4),
      createdAt: Date.now(),
      textSnippet: scriptText,
    };
    onSaveTake(take);
    setTakeSaved(true);
    setTimeout(() => setTakeSaved(false), 2500);
  };

  const handleSavePronunciation = async () => {
    try {
      await addLocalPronunciation(pronunciationWord, pronunciationHint);
      setPronunciationMessage(`Saved a local pronunciation rule for “${pronunciationWord.trim()}”.`);
      setPronunciationWord('');
      setPronunciationHint('');
    } catch (error) {
      setPronunciationMessage(error instanceof Error ? error.message : 'Could not save this pronunciation.');
    }
  };

  const words = scriptText.split(/\s+/).filter(Boolean);
  const estimatedSeconds = Math.max(1, Math.round((words.length * 0.38) / activeModel.rate));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlayingWav(false)}
        onLoadedMetadata={handleTimeUpdate}
      />

      {/* Voice Selection Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg text-white shadow-md shrink-0"
            style={{ backgroundColor: activeModel.avatarColor }}
          >
            {activeModel.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-400">
                Active Speaking Voice:
              </span>
              <span className="text-sm font-bold text-white">{activeModel.name}</span>
            </div>
            <p className="text-xs text-indigo-400 font-medium">
              {activeModel.archetype} &bull; Pitch: {activeModel.pitch.toFixed(2)}x &bull; Rate: {activeModel.rate.toFixed(2)}x
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={activeModel.id}
            onChange={(e) => {
              const found = models.find((m) => m.id === e.target.value);
              if (found) onSelectModel(found);
            }}
            className="bg-slate-950 border border-slate-800 text-xs text-white rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.archetype})
              </option>
            ))}
          </select>
        </div>

        {/* In-Studio Quick Acoustic Pitch & Speed Tuning */}
        <div className="w-full pt-3 mt-1 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400 font-medium">Pitch Height</span>
              <span className="text-cyan-400 font-mono font-bold">{activeModel.pitch.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.7"
              step="0.05"
              value={activeModel.pitch}
              onChange={(e) => {
                const pitch = parseFloat(e.target.value);
                if (onUpdateActiveModel) {
                  onUpdateActiveModel({ ...activeModel, pitch });
                }
              }}
              className="w-full accent-cyan-500 h-1 bg-slate-950 rounded cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500">
              <span>Deeper Baritone</span>
              <span>Higher Pitch</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400 font-medium">Speaking Pace</span>
              <span className="text-indigo-400 font-mono font-bold">{activeModel.rate.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.6"
              max="1.5"
              step="0.05"
              value={activeModel.rate}
              onChange={(e) => {
                const rate = parseFloat(e.target.value);
                if (onUpdateActiveModel) {
                  onUpdateActiveModel({ ...activeModel, rate });
                }
              }}
              className="w-full accent-indigo-500 h-1 bg-slate-950 rounded cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500">
              <span>Deliberate</span>
              <span>Fast Pace</span>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0">
            <button
              onClick={() => {
                if (onUpdateActiveModel) {
                  onUpdateActiveModel({ ...activeModel, pitch: 1.0, rate: 1.0 });
                }
              }}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 transition-colors"
              title="Reset Pitch & Pace to 1.0x"
            >
              <RotateCcw className="w-3 h-3" /> Reset 1.0x
            </button>
            <span className="text-[10px] text-slate-500">Live vocal tuning</span>
          </div>
        </div>
      </div>

      {/* Script Text Box & Live Spoken Viewport */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Mic2 className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-white text-base">Spoken Word Studio</h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>{words.length} words</span>
            <span>&bull;</span>
            <span>~{estimatedSeconds}s duration</span>
            <span>&bull;</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(scriptText);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
              title="Copy script"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => setScriptText('')}
              className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
              title="Clear script text"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Script Editor & Highlight Viewer */}
        <div className="relative">
          {isSpeakingAloud && activeWordChar ? (
            <div className="w-full min-h-[140px] bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-slate-100 font-sans leading-relaxed">
              <span>{scriptText.slice(0, activeWordChar.start)}</span>
              <span className="bg-indigo-500 text-white font-bold px-1.5 py-0.5 rounded shadow inline-block">
                {scriptText.slice(
                  activeWordChar.start,
                  activeWordChar.start + activeWordChar.length
                )}
              </span>
              <span>{scriptText.slice(activeWordChar.start + activeWordChar.length)}</span>
            </div>
          ) : (
            <textarea
              rows={5}
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder="Enter text to synthesize with the selected local voice method..."
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans leading-relaxed resize-y"
            />
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
          <div>
            <h4 className="text-xs font-bold text-slate-200">Custom pronunciation hints</h4>
            <p className="mt-1 text-[11px] text-slate-500">Add a local spelling rule for names or tricky words. This adjusts the pronunciation dictionary; it does not train a voice model.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-2">
            <input
              value={pronunciationWord}
              onChange={(event) => setPronunciationWord(event.target.value)}
              placeholder="Word (e.g. Vocalis)"
              className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder:text-slate-600"
            />
            <input
              value={pronunciationHint}
              onChange={(event) => setPronunciationHint(event.target.value)}
              placeholder="Pronounce like (e.g. voh kal iss)"
              className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder:text-slate-600"
            />
            <button
              onClick={handleSavePronunciation}
              disabled={!pronunciationWord.trim() || !pronunciationHint.trim()}
              className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save rule
            </button>
          </div>
          {pronunciationMessage && <p role="status" className="text-[11px] text-emerald-400">{pronunciationMessage}</p>}
        </div>

        {/* Preset Sentences */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-slate-500">Preset Scripts:</span>
          {scriptPresets.map((pr, idx) => (
            <button
              key={idx}
              onClick={() => {
                if (isSpeakingAloud) stopSpeaking();
                setIsSpeakingAloud(false);
                setActiveWordChar(null);
                setScriptText(pr.text);
              }}
              className="text-xs bg-slate-950/70 hover:bg-slate-800 text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded-xl border border-slate-800 transition-colors"
            >
              {pr.title}
            </button>
          ))}
        </div>

        {/* Actions Bar */}
        <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Action 1: Speak Aloud */}
            <button
              onClick={handleSpeakAloud}
              disabled={!scriptText.trim()}
              className={`px-6 py-3.5 rounded-2xl font-bold text-sm flex items-center gap-2.5 shadow-xl transition-all active:scale-[0.98] select-none cursor-pointer ${
                isSpeakingAloud
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/40 animate-pulse'
                  : 'bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 hover:brightness-110 text-white shadow-indigo-500/30'
              }`}
            >
              {isSpeakingAloud ? (
                <>
                  <Square className="w-4 h-4 fill-current" /> Stop Speaking
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" /> Speak Words Aloud
                </>
              )}
            </button>

            {/* Action 2: Render WAV Take */}
            <button
              onClick={handleRenderWav}
              disabled={isRenderingWav || !scriptText.trim()}
              className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 border border-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {isRenderingWav ? 'Rendering Audio...' : 'Generate WAV File'}
            </button>
          </div>

          <span className="text-xs text-slate-500">
            {activeModel.synthesisMethod === 'cmu-arctic' ? 'Experimental CMU ARCTIC recorded units' : 'Mathematical formant voice'} · no AI or cloud TTS
          </span>
        </div>
      </div>

      {/* Generated Audio Take Player */}
      {generatedWavUrl && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AudioWaveform className="w-5 h-5 text-indigo-400" />
              <div>
                <h4 className="font-bold text-white text-sm">Locally Synthesized Speech (WAV)</h4>
                <span className="text-[10px] text-emerald-400 font-mono">
                  {activeModel.synthesisMethod === 'cmu-arctic' ? 'Experimental recorded units' : 'Mathematical formant synthesis'} &bull; no AI or cloud TTS
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveTake}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors"
              >
                {takeSaved ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> Saved to Library
                  </>
                ) : (
                  <>
                    <BookmarkCheck className="w-3.5 h-3.5" /> Save to Library
                  </>
                )}
              </button>

              <a
                href={generatedWavUrl}
                download={`${activeModel.name.toLowerCase().replace(/\s+/g, '-')}-speech.wav`}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1.5 shadow transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download WAV
              </a>
            </div>
          </div>

          {/* Interactive Player Controls */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center gap-4">
            <button
              onClick={toggleWavPlay}
              className="w-12 h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 transition-all shrink-0"
            >
              {isPlayingWav ? (
                <Square className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            <div className="flex-1 space-y-1">
              <input
                type="range"
                min="0"
                max={duration || 100}
                step="0.05"
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded cursor-pointer"
              />
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>{currentTime.toFixed(1)}s</span>
                <span>{duration.toFixed(1)}s</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
