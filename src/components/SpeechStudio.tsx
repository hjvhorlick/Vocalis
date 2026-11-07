import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  VoiceModelConfig,
  NATURAL_HUMAN_SAMPLES,
  speakText,
  playRender,
  renderSpeech,
  stopSpeaking,
  auditionSourceRecording,
  setUserAudioBuffer,
  getUserAudioBuffer,
  releaseSynthesis,
  type SynthesisResult,
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
  Type,
  Stethoscope,
  Headphones,
} from 'lucide-react';

interface SpeechStudioProps {
  models: VoiceModelConfig[];
  activeModel: VoiceModelConfig;
  onSelectModel: (m: VoiceModelConfig) => void;
  onUpdateActiveModel?: (m: VoiceModelConfig) => void;
  onSaveTake: (take: GeneratedTake) => void;
}

/**
 * Everything that changes the sound. Two renders with the same key are the same
 * audio, so a preview can be reused for export instead of being regenerated.
 */
function renderKey(script: string, model: VoiceModelConfig): string {
  return JSON.stringify([
    script,
    model.id,
    model.pitch,
    model.rate,
    model.volume,
    model.toneStyle,
    model.accent,
    model.synthesisMethod ?? 'cmu-arctic',
    model.baseVoiceId ?? 'neutral',
    model.throatWarmth ?? 0,
    model.oralClarity ?? 0,
    model.airPresence ?? 0,
  ]);
}

export const SpeechStudio: React.FC<SpeechStudioProps> = ({
  models,
  activeModel,
  onSelectModel,
  onUpdateActiveModel,
  onSaveTake,
}) => {
  // The words to speak. This is the studio's real input: what is typed here is
  // what gets generated.
  const [script, setScript] = useState<string>(activeModel.samplePhrase);

  // Generated-speech playback
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [lastResult, setLastResult] = useState<SynthesisResult | null>(null);
  const [lastKey, setLastKey] = useState<string>('');
  const [activeWord, setActiveWord] = useState<number>(-1);
  const [engineError, setEngineError] = useState<string | null>(null);

  // Audition of the original reference recording (a separate feature)
  const [isAuditioning, setIsAuditioning] = useState(false);

  // Take player / export
  const [generatedWavUrl, setGeneratedWavUrl] = useState<string | null>(null);
  const [exportText, setExportText] = useState<string>('');
  const [isPlayingWav, setIsPlayingWav] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [takeSaved, setTakeSaved] = useState(false);

  // Microphone recording (feeds the audition feature)
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentKey = renderKey(script, activeModel);
  const previewIsStale = Boolean(lastResult) && lastKey !== currentKey;

  const activeSample =
    NATURAL_HUMAN_SAMPLES.find((s) => s.id === activeModel.baseSampleId) ||
    NATURAL_HUMAN_SAMPLES[0];

  const wordCount = useMemo(() => script.trim().split(/\s+/).filter(Boolean).length, [script]);

  const applyResult = useCallback(
    (result: SynthesisResult, key: string) => {
      setLastResult((previous) => {
        if (previous && previous.audioUrl !== result.audioUrl) releaseSynthesis(previous);
        return result;
      });
      setLastKey(key);
      setGeneratedWavUrl(result.audioUrl);
      setExportText(script);
      setDuration(result.duration);
      setCurrentTime(0);
      if (audioRef.current) {
        audioRef.current.src = result.audioUrl;
        audioRef.current.load();
      }
    },
    [script],
  );

  // Stop cleanly if the studio unmounts mid-sentence.
  useEffect(
    () => () => {
      stopSpeaking();
    },
    [],
  );

  const speechCallbacks = {
    onStart: () => setIsSpeaking(true),
    onWord: (timing: { charIndex: number; charLength: number }, index: number) =>
      setActiveWord(index),
    onEnd: () => {
      setIsSpeaking(false);
      setActiveWord(-1);
    },
    onError: (error: Error) => {
      setIsSpeaking(false);
      setActiveWord(-1);
      setEngineError(error.message);
    },
  };

  /** Speak the script. Reuses the existing render when nothing has changed. */
  const handlePlayLive = async () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      setActiveWord(-1);
      return;
    }
    if (!script.trim()) {
      setEngineError('Type something to speak first.');
      return;
    }
    setEngineError(null);
    if (lastResult && lastKey === currentKey) {
      playRender(lastResult, speechCallbacks);
      return;
    }
    setIsRendering(true);
    const result = await speakText(script, activeModel, {
      ...speechCallbacks,
      onRendered: (rendered) => applyResult(rendered, currentKey),
    });
    setIsRendering(false);
    if (!result) setIsSpeaking(false);
  };

  /** Export the WAV. Same samples as the preview — never a second pipeline. */
  const handleRenderWav = async () => {
    if (!script.trim()) {
      setEngineError('Type something to speak first.');
      return;
    }
    if (lastResult && lastKey === currentKey) {
      // Already rendered and already in the take player: nothing to regenerate.
      applyResult(lastResult, currentKey);
      setEngineError(null);
      return;
    }
    setEngineError(null);
    setIsRendering(true);
    try {
      const result = await renderSpeech(script, activeModel);
      applyResult(result, currentKey);
    } catch (error) {
      setEngineError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRendering(false);
    }
  };

  /** A/B against the original human recording, with the same effects applied. */
  const handleAuditionSource = async () => {
    if (isAuditioning) {
      stopSpeaking();
      setIsAuditioning(false);
      return;
    }
    setIsAuditioning(true);
    await auditionSourceRecording(activeModel, {
      onEnd: () => setIsAuditioning(false),
      onError: (error) => {
        setIsAuditioning(false);
        setRecordError(error.message);
      },
    });
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
    if (!audioRef.current) return;
    const position = audioRef.current.currentTime;
    setCurrentTime(position);
    setDuration(audioRef.current.duration || 0);
    const word =
      lastResult?.wordTimings.findIndex((timing) => position >= timing.start && position < timing.end) ?? -1;
    setActiveWord(word);
  };

  const handleSeek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleSaveTake = () => {
    if (!generatedWavUrl) return;
    const snippet = exportText.trim();
    const take: GeneratedTake = {
      id: 'take-' + Date.now(),
      title: `${activeModel.name} - ${snippet.slice(0, 30)}${snippet.length > 30 ? '…' : ''}`,
      audioUrl: generatedWavUrl,
      voiceName: activeModel.name,
      durationSeconds: Math.round(duration || 1),
      createdAt: Date.now(),
      textSnippet: snippet,
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
        // MediaRecorder produces whatever the browser encodes (usually
        // webm/opus), so the blob keeps its real type instead of claiming WAV.
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || 'audio/webm',
        });
        try {
          const decoded = await decodeCustomAudioBlob(audioBlob);
          setUserAudioBuffer(decoded);
          if (onUpdateActiveModel) {
            onUpdateActiveModel({ ...activeModel, baseSampleId: 'custom-user' });
          }
          setRecordError(null);
        } catch (e: unknown) {
          setRecordError(
            'Failed to decode mic recording: ' + (e instanceof Error ? e.message : String(e)),
          );
        }
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecordingMic(true);
    } catch (err: unknown) {
      setRecordError(
        'Microphone access denied or unavailable: ' + (err instanceof Error ? err.message : String(err)),
      );
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
        onUpdateActiveModel({ ...activeModel, baseSampleId: 'custom-user' });
      }
      setRecordError(null);
    } catch (err: unknown) {
      setRecordError('Failed to load audio file: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const diagnostics = lastResult?.diagnostics ?? null;

  /**
   * The script as word spans, so the word being spoken can be highlighted.
   * Spans come from the render's measured timings, not from a guess about where
   * a word should land.
   */
  const scriptView = useMemo(() => {
    if (!lastResult || !lastResult.wordTimings.length) return null;
    const pieces: Array<{ text: string; index: number }> = [];
    let cursor = 0;
    lastResult.wordTimings.forEach((timing, index) => {
      if (timing.charIndex > cursor) {
        pieces.push({ text: script.slice(cursor, timing.charIndex), index: -1 });
      }
      pieces.push({
        text: script.slice(timing.charIndex, timing.charIndex + timing.charLength),
        index,
      });
      cursor = timing.charIndex + timing.charLength;
    });
    if (cursor < script.length) pieces.push({ text: script.slice(cursor), index: -1 });
    return pieces;
  }, [lastResult, script]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => {
          setIsPlayingWav(false);
          setActiveWord(-1);
        }}
        onLoadedMetadata={handleTimeUpdate}
      />

      {/* Attribution Banner for CMU ARCTIC */}
      <SourceVoiceAttribution />

      {/* Voice Selection & Acoustic Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg text-white shadow-md shrink-0"
              style={{ backgroundColor: activeModel.avatarColor }}
            >
              {activeModel.flag || activeModel.name.charAt(0)}
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
                  {m.name} ({m.archetype})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Recorded source voice selector */}
        <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-8 space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-indigo-400" />
                Recorded Source Voice (CMU ARCTIC units this voice is built from):
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
                    baseVoiceId: sample.voicePackId,
                  });
                }
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white cursor-pointer"
            >
              {NATURAL_HUMAN_SAMPLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.speaker}) &mdash; reference: "{s.transcript}"
                </option>
              ))}
              {getUserAudioBuffer() && (
                <option value="custom-user">Your Custom Recording / Uploaded Audio (audition only)</option>
              )}
            </select>
          </div>

          {/* User Mic & File Upload Option — audition source material */}
          <div className="md:col-span-4 flex items-center gap-2">
            {!isRecordingMic ? (
              <button
                onClick={startMicRecording}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="Record from microphone to use as the audition source"
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

        <p className="text-[10px] text-slate-500 leading-relaxed">
          A custom recording replaces the <em>reference sentence</em> used by "Audition source
          recording" below. Generated speech is always built from the licensed CMU ARCTIC unit
          recordings, so your own voice is never resynthesised.
        </p>

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
            <span className="text-[10px] text-slate-500">Vocalis Engine</span>
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
          <span className="text-xs text-slate-400 font-mono">
            {wordCount} word{wordCount === 1 ? '' : 's'} &bull;{' '}
            {activeModel.synthesisMethod === 'formant' ? 'experimental formant path' : 'recorded CMU ARCTIC units'}
          </span>
        </div>

        {/* Script input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="studio-script"
              className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5"
            >
              <Type className="w-3.5 h-3.5 text-indigo-400" />
              Text To Speak
            </label>
            <div className="flex items-center gap-2">
              {previewIsStale && (
                <span className="text-[10px] text-amber-400 font-mono">settings changed &mdash; will re-render</span>
              )}
              <button
                onClick={() => setScript(activeSample.transcript)}
                className="text-[10px] text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 transition-colors cursor-pointer"
                title="Put the source recording's sentence into the script"
              >
                Use reference sentence
              </button>
            </div>
          </div>

          {isSpeaking && scriptView ? (
            <div className="w-full min-h-[8.5rem] bg-slate-950 border border-indigo-700/40 rounded-2xl p-4 text-sm leading-7 text-slate-300 font-medium whitespace-pre-wrap">
              {scriptView.map((piece, index) =>
                piece.index >= 0 ? (
                  <span
                    key={index}
                    className={
                      piece.index === activeWord
                        ? 'text-white bg-indigo-500/40 rounded-md px-0.5 -mx-0.5'
                        : 'text-slate-400'
                    }
                  >
                    {piece.text}
                  </span>
                ) : (
                  <span key={index} className="text-slate-600">
                    {piece.text}
                  </span>
                ),
              )}
            </div>
          ) : (
            <textarea
              id="studio-script"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder="Type or paste the words you want this voice to speak. Numbers, punctuation and paragraph breaks are read aloud as a person would read them."
              className="w-full min-h-[8.5rem] bg-slate-950 border border-slate-800 focus:border-indigo-500/60 rounded-2xl p-4 text-sm leading-7 text-slate-200 font-medium resize-y focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
          )}
          <p className="text-[10px] text-slate-500">
            Pronunciation comes from the bundled CMU dictionary; anything missing is spelled out by
            Vocalis's own grapheme rules and reported in the render report below.
          </p>
        </div>

        {engineError && (
          <p className="text-xs text-rose-400 bg-rose-950/40 p-2 rounded-xl border border-rose-800/40">
            {engineError}
          </p>
        )}

        {/* Live Acoustic Visualizer */}
        <div className="space-y-1">
          <VoiceVisualizer isPlaying={isSpeaking || isAuditioning || isPlayingWav} avatarColor={activeModel.avatarColor} />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>Acoustic Frequency Domain</span>
            <span>
              {isRendering
                ? 'Generating speech…'
                : isSpeaking
                  ? 'Speaking your text'
                  : isAuditioning
                    ? 'Playing the original reference recording'
                    : 'Ready'}
            </span>
          </div>
        </div>

        {/* Studio Actions Bar */}
        <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Action 1: Speak the script */}
            <button
              onClick={handlePlayLive}
              disabled={isRendering}
              className={`px-6 py-3.5 rounded-2xl font-bold text-sm flex items-center gap-2.5 shadow-xl transition-all active:scale-[0.98] select-none cursor-pointer disabled:opacity-60 ${
                isSpeaking
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/40 animate-pulse'
                  : 'bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 hover:brightness-110 text-white shadow-indigo-500/30'
              }`}
            >
              {isSpeaking ? (
                <>
                  <Square className="w-4 h-4 fill-current" /> Stop Audio
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" /> {isRendering ? 'Generating…' : 'Speak This Text'}
                </>
              )}
            </button>

            {/* Action 2: Render Transformed WAV */}
            <button
              onClick={handleRenderWav}
              disabled={isRendering}
              className="px-5 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 border border-slate-700 transition-colors cursor-pointer disabled:opacity-60"
            >
              <Download className="w-3.5 h-3.5" />
              {isRendering ? 'Rendering WAV...' : 'Export WAV'}
            </button>

            {/* Action 3: A/B against the original human recording */}
            <button
              onClick={handleAuditionSource}
              className="px-4 py-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-300 font-semibold text-xs flex items-center gap-2 border border-slate-800 transition-colors cursor-pointer"
              title={`Play the original ${activeSample.name} with the same settings, for comparison`}
            >
              {isAuditioning ? (
                <StopCircle className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Headphones className="w-3.5 h-3.5 text-emerald-400" />
              )}
              Audition source recording
            </button>
          </div>

          <span className="text-xs text-slate-400 max-w-xs text-right">
            Preview and export are the same rendered samples
          </span>
        </div>

        {/* Render diagnostics */}
        {diagnostics && (
          <div className="pt-4 border-t border-slate-800/80 space-y-2">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Render report
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {diagnostics.method} &bull; {diagnostics.speaker ?? 'no speaker'} &bull;{' '}
                {diagnostics.durationSeconds.toFixed(2)}s
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                <div className="text-slate-500">Words / phones</div>
                <div className="font-mono text-slate-200">
                  {diagnostics.words} / {diagnostics.phones}
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                <div className="text-slate-500">Recorded units</div>
                <div className="font-mono text-emerald-400">
                  {diagnostics.exactUnits} exact &bull; {diagnostics.backoffUnits} adapted
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                <div className="text-slate-500">Synthesised stand-ins</div>
                <div className={`font-mono ${diagnostics.fallbackPhones ? 'text-amber-400' : 'text-slate-200'}`}>
                  {diagnostics.fallbackPhones}
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                <div className="text-slate-500">Recorded coverage</div>
                <div className="font-mono text-cyan-400">
                  {(diagnostics.recordedCoverage * 100).toFixed(1)}%
                </div>
              </div>
            </div>
            {(diagnostics.guessedWords.length > 0 ||
              diagnostics.rejectedTokens.length > 0 ||
              diagnostics.missingPairs.length > 0) && (
              <div className="text-[10px] text-slate-500 space-y-0.5">
                {diagnostics.guessedWords.length > 0 && (
                  <p>
                    <span className="text-amber-400/90 font-semibold">Pronunciation guessed for:</span>{' '}
                    {diagnostics.guessedWords.slice(0, 12).join(', ')}
                    {diagnostics.guessedWords.length > 12 && ` +${diagnostics.guessedWords.length - 12} more`}
                  </p>
                )}
                {diagnostics.rejectedTokens.length > 0 && (
                  <p>
                    <span className="text-rose-400/90 font-semibold">Not spoken:</span>{' '}
                    {diagnostics.rejectedTokens.slice(0, 12).join(', ')}
                  </p>
                )}
                {diagnostics.missingPairs.length > 0 && (
                  <p>
                    <span className="text-slate-400 font-semibold">Missing unit pairs:</span>{' '}
                    {diagnostics.missingPairs.slice(0, 10).join(' ')}
                    {diagnostics.missingPairs.length > 10 && ` +${diagnostics.missingPairs.length - 10} more`}
                  </p>
                )}
              </div>
            )}
            <p className="text-[10px] text-slate-600 font-mono">
              dictionary: {diagnostics.dictionary.source} • {diagnostics.dictionary.entries.toLocaleString()} entries
              {diagnostics.dictionary.hints > 0 ? ` • ${diagnostics.dictionary.hints} saved spellings` : ''}
              {diagnostics.dictionary.annotatedLines > 0 ? ` • ${diagnostics.dictionary.annotatedLines} annotated lines skipped` : ''}
              {diagnostics.dictionary.rejectedTokens > 0 ? ` • ${diagnostics.dictionary.rejectedTokens} rejected tokens` : ''}
            </p>
          </div>
        )}
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
                  100% Vocalis Engine &bull; Zero External AI Models
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
                download={`${activeModel.name.toLowerCase().replace(/\s+/g, '-')}-vocalis.wav`}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1.5 shadow transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download WAV
              </a>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 line-clamp-2">“{exportText}”</p>

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
