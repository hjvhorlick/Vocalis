import React, { useState, useRef } from 'react';
import {
  VoiceModelConfig,
  NATURAL_HUMAN_SAMPLES,
  speakVoiceText,
  stopSpokenVoice,
  generateSpokenAudioWav,
  setUserAudioBuffer,
  getUserAudioBuffer,
} from '../utils/naturalVoiceEngine';
import { decodeCustomAudioBlob } from '../utils/naturalHumanAudio';
import { GeneratedTake } from '../types/voice';
import { VoiceVisualizer } from './VoiceVisualizer';
import { SourceVoiceAttribution } from './SourceVoiceAttribution';
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
  Upload,
  Radio,
  StopCircle,
} from 'lucide-react';
import { VoiceAvatar } from './VoiceAvatar';
import { PersonaScriptPlayer } from './PersonaScriptPlayer';

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
  // Live transformed play state
  const [isPlayingLive, setIsPlayingLive] = useState(false);

  // WAV render state
  const [isRenderingWav, setIsRenderingWav] = useState(false);
  const [generatedWavUrl, setGeneratedWavUrl] = useState<string | null>(null);
  const [isPlayingWav, setIsPlayingWav] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [takeSaved, setTakeSaved] = useState(false);

  // Microphone recording state
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeSample =
    NATURAL_HUMAN_SAMPLES.find((s) => s.id === activeModel.baseSampleId) ||
    NATURAL_HUMAN_SAMPLES[0];

  // Play converted voice in real time through speakers
  const handlePlayLive = () => {
    if (isPlayingLive) {
      stopSpokenVoice();
      setIsPlayingLive(false);
      return;
    }

    setIsPlayingLive(true);
    speakVoiceText(activeModel.samplePhrase, activeModel, {
      onStart: () => setIsPlayingLive(true),
      onEnd: () => setIsPlayingLive(false),
      onError: () => setIsPlayingLive(false),
    });
  };

  // Render downloadable WAV audio
  const handleRenderWav = async () => {
    setIsRenderingWav(true);
    try {
      const { audioUrl, duration: renderedDuration } = await generateSpokenAudioWav(
        activeModel.samplePhrase,
        activeModel
      );
      setGeneratedWavUrl(audioUrl);
      setDuration(renderedDuration);
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
      title: `${activeModel.name} - ${activeSample.transcript.slice(0, 30)}...`,
      audioUrl: generatedWavUrl,
      voiceName: activeModel.name,
      durationSeconds: Math.round(duration || activeSample.duration),
      createdAt: Date.now(),
      textSnippet: activeSample.transcript,
    };
    onSaveTake(take);
    setTakeSaved(true);
    setTimeout(() => setTakeSaved(false), 2500);
  };

  // Start microphone recording
  const startMicRecording = async () => {
    setRecordError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        try {
          const decoded = await decodeCustomAudioBlob(audioBlob);
          setUserAudioBuffer(decoded);
          if (onUpdateActiveModel) {
            onUpdateActiveModel({
              ...activeModel,
              baseSampleId: 'custom-user',
              samplePhrase: 'Custom microphone voice recording',
            });
          }
        } catch (e: any) {
          setRecordError('Failed to decode mic recording: ' + e.message);
        }
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecordingMic(true);
    } catch (err: any) {
      setRecordError('Microphone access denied or unavailable: ' + err.message);
    }
  };

  const stopMicRecording = () => {
    if (mediaRecorderRef.current && isRecordingMic) {
      mediaRecorderRef.current.stop();
      setIsRecordingMic(false);
    }
  };

  // Custom audio file upload (.wav / .mp3)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const decoded = await decodeCustomAudioBlob(file);
      setUserAudioBuffer(decoded);
      if (onUpdateActiveModel) {
        onUpdateActiveModel({
          ...activeModel,
          baseSampleId: 'custom-user',
          samplePhrase: `Uploaded file: ${file.name}`,
        });
      }
    } catch (err: any) {
      setRecordError('Failed to load audio file: ' + err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlayingWav(false)}
        onLoadedMetadata={handleTimeUpdate}
      />

      {/* Attribution Banner for CMU ARCTIC */}
      <SourceVoiceAttribution />

      {/* Voice Selection & Acoustic Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <VoiceAvatar
                id={activeModel.id}
                name={activeModel.name}
                avatarImage={activeModel.avatarImage}
                color={activeModel.avatarColor}
                size="xl"
                speaking={isPlayingLive}
              />
              {activeModel.flag && (
                <div
                  className="absolute -bottom-1 -right-1 bg-slate-900 border border-slate-700/80 rounded-md px-1.5 py-0.5 text-xs shadow-md leading-none flex items-center justify-center pointer-events-none"
                  title={`Region / Accent: ${activeModel.accent}`}
                >
                  {activeModel.flag}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-bold tracking-wider text-slate-400">
                  Target Voice Character:
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
              className="bg-slate-950 border border-slate-800 text-xs text-white rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium cursor-pointer"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.flag ? `${m.flag} ` : ''}{m.name} ({m.archetype})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Source Natural Human Voice Selector */}
        <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-8 space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-indigo-400" />
                Select Natural Human Voice Sample to Convert:
              </label>
              <span className="text-[10px] text-emerald-400 font-mono">100% Non-AI Human</span>
            </div>

            <select
              value={activeModel.baseSampleId}
              onChange={(e) => {
                const newSampleId = e.target.value;
                const sample = NATURAL_HUMAN_SAMPLES.find((s) => s.id === newSampleId);
                if (onUpdateActiveModel && sample) {
                  onUpdateActiveModel({
                    ...activeModel,
                    baseSampleId: newSampleId,
                  });
                }
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white cursor-pointer font-medium"
            >
              <optgroup label="CMU ARCTIC Multi-Speaker Human Recordings (16kHz Studio)">
                {NATURAL_HUMAN_SAMPLES.filter(
                  (s) => s.category === 'CMU ARCTIC (Speech Science)'
                ).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.speaker}) &mdash; "{s.transcript.slice(0, 36)}..."
                  </option>
                ))}
              </optgroup>
              <optgroup label="Open Speech Repository (IEEE Harvard Sentences)">
                {NATURAL_HUMAN_SAMPLES.filter(
                  (s) => s.category === 'Open Speech Repository (Harvard Sentences)'
                ).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.speaker}) &mdash; "{s.transcript.slice(0, 36)}..."
                  </option>
                ))}
              </optgroup>
              {getUserAudioBuffer() && (
                <optgroup label="Custom Real Voice Input">
                  <option value="custom-user">Your Custom Recording / Uploaded Audio</option>
                </optgroup>
              )}
            </select>
          </div>

          {/* User Mic & File Upload Option */}
          <div className="md:col-span-4 flex items-center gap-2">
            {!isRecordingMic ? (
              <button
                onClick={startMicRecording}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="Record from microphone to convert your own voice"
              >
                <Mic2 className="w-3.5 h-3.5 text-rose-400" /> Record Mic
              </button>
            ) : (
              <button
                onClick={stopMicRecording}
                className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white flex items-center justify-center gap-1.5 animate-pulse cursor-pointer shadow-lg shadow-rose-600/30"
              >
                <StopCircle className="w-3.5 h-3.5" /> Stop Recording
              </button>
            )}

            <label className="flex-1 py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5 text-cyan-400" /> Upload WAV
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {recordError && (
          <p className="text-xs text-rose-400 bg-rose-950/40 p-2 rounded-xl border border-rose-800/40">
            {recordError}
          </p>
        )}

        {/* Quick Pitch & Speed Sliders */}
        <div className="w-full pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
              <span>Deep Bass</span>
              <span>High Soprano</span>
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
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 transition-colors cursor-pointer"
              title="Reset Pitch & Pace to 1.0x"
            >
              <RotateCcw className="w-3 h-3" /> Reset 1.0x
            </button>
            <span className="text-[10px] text-slate-500">Web Audio DSP</span>
          </div>
        </div>
      </div>

      {/* Main Studio Console */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AudioWaveform className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-white text-base">Acoustic Transformation Studio</h3>
          </div>
          <span className="text-xs text-indigo-400 font-mono">
            {activeModel.flag} {activeModel.name} &bull; {activeModel.gender}
          </span>
        </div>

        {/* Dedicated Audition & Test Script Card */}
        <div className="bg-slate-950 border border-indigo-900/50 rounded-2xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold tracking-wider text-indigo-400 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" />
              Audition & Test Script
            </span>
            <PersonaScriptPlayer
              voiceId={activeModel.id}
              name={activeModel.name}
              audioUrl={activeModel.auditionAudio}
              script={activeModel.samplePhrase}
              compact
            />
          </div>
          <p className="text-sm sm:text-base text-slate-100 font-medium leading-relaxed italic">
            "{activeModel.samplePhrase}"
          </p>
          <p className="text-xs text-slate-400 leading-normal">
            {activeModel.description}
          </p>
        </div>

        {/* Live Acoustic Visualizer */}
        <div className="space-y-1">
          <VoiceVisualizer isPlaying={isPlayingLive} avatarColor={activeModel.avatarColor} />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>Acoustic Frequency Domain</span>
            <span>{isPlayingLive ? 'Playing audition script...' : 'Ready to audition'}</span>
          </div>
        </div>

        {/* Studio Actions Bar */}
        <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Action 1: Play Live Converted Voice */}
            <button
              onClick={handlePlayLive}
              className={`px-6 py-3.5 rounded-2xl font-bold text-sm flex items-center gap-2.5 shadow-xl transition-all active:scale-[0.98] select-none cursor-pointer ${
                isPlayingLive
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/40 animate-pulse'
                  : 'bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 hover:brightness-110 text-white shadow-indigo-500/30'
              }`}
            >
              {isPlayingLive ? (
                <>
                  <Square className="w-4 h-4 fill-current" /> Stop Audition
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" /> Audition Test Script
                </>
              )}
            </button>

            {/* Action 2: Render Transformed WAV */}
            <button
              onClick={handleRenderWav}
              disabled={isRenderingWav}
              className="px-5 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 border border-slate-700 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              {isRenderingWav ? 'Rendering WAV...' : 'Export Converted WAV'}
            </button>
          </div>

          <span className="text-xs text-slate-400">
            Real human acoustic phonemes converted via pure Web Audio DSP
          </span>
        </div>
      </div>

      {/* Generated Audio Take Player & Downloader */}
      {generatedWavUrl && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AudioWaveform className="w-5 h-5 text-indigo-400" />
              <div>
                <h4 className="font-bold text-white text-sm">Converted Vocal Master (16-bit WAV)</h4>
                <span className="text-[10px] text-emerald-400 font-mono">
                  100% Vocalis DSP Engine &bull; Zero External AI Models
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveTake}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
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
                download={`${activeModel.name.toLowerCase().replace(/\s+/g, '-')}-transformed.wav`}
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
              className="w-12 h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 transition-all shrink-0 cursor-pointer"
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
                max={duration || 10}
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
