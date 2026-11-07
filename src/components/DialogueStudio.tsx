import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  VoiceModelConfig,
  speakText,
  stopSpeaking,
  renderDialogue,
  playDialogueRender,
  releaseDialogue,
  DEFAULT_DIALOGUE_TIMING,
  type DialogueRender,
} from '../utils/naturalVoiceEngine';
import {
  Users,
  Plus,
  Trash2,
  Play,
  Square,
  Volume2,
  Download,
  AudioWaveform,
  Timer,
  AlertTriangle,
  Stethoscope,
} from 'lucide-react';

interface DialogueLine {
  id: string;
  speakerId: 'A' | 'B';
  text: string;
}

interface DialogueStudioProps {
  models: VoiceModelConfig[];
}

/** Everything that changes the conversation audio. */
function dialogueKey(
  lines: DialogueLine[],
  modelA: VoiceModelConfig,
  modelB: VoiceModelConfig,
  turnGap: number,
) {
  const acoustic = (model: VoiceModelConfig) => [
    model.id,
    model.pitch,
    model.rate,
    model.volume,
    model.toneStyle,
    model.accent,
    model.referenceRaw === false,
    model.synthesisMethod ?? 'cmu-arctic',
    model.baseVoiceId ?? 'neutral',
  ];
  return JSON.stringify([lines.map((line) => [line.speakerId, line.text]), acoustic(modelA), acoustic(modelB), turnGap]);
}

export const DialogueStudio: React.FC<DialogueStudioProps> = ({ models }) => {
  // Speaker B defaults to the first identity built from a *different* recording,
  // so a fresh conversation has two voices a listener can tell apart instead of
  // the same speaker reading both parts.
  const defaultPartner =
    models.find(
      (m) => m.id !== models[0]?.id && (m.baseVoiceId ?? '') !== (models[0]?.baseVoiceId ?? ''),
    ) || models[1];
  const [modelAId, setModelAId] = useState<string>(models[0]?.id || 'studio-neutral');
  const [modelBId, setModelBId] = useState<string>(defaultPartner?.id || 'titan-marcus');

  const modelA = models.find((m) => m.id === modelAId) || models[0];
  const modelB = models.find((m) => m.id === modelBId) || models[1] || models[0];

  const [lines, setLines] = useState<DialogueLine[]>([
    {
      id: '1',
      speakerId: 'A',
      text: 'Hello Marcus! Can you hear me clearly through the audio monitors?',
    },
    {
      id: '2',
      speakerId: 'B',
      text: 'Loud and clear, Aria. The new profile has a different pitch and timbre.',
    },
    {
      id: '3',
      speakerId: 'A',
      text: 'The text is mapped to phonemes and assembled from recorded CMU ARCTIC speech units.',
    },
    {
      id: '4',
      speakerId: 'B',
      text: 'Exactly. The pronunciation dictionary and local synthesis rules shape each spoken line.',
    },
  ]);

  // Turn-taking rhythm: the air between one speaker and the next.
  const [turnGap, setTurnGap] = useState<number>(DEFAULT_DIALOGUE_TIMING.turnGap);

  const [isPlayingDialogue, setIsPlayingDialogue] = useState(false);
  const [activeLineIdx, setActiveLineIdx] = useState<number>(-1);
  const [isRenderingDialogue, setIsRenderingDialogue] = useState(false);
  const [dialogueError, setDialogueError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<DialogueRender | null>(null);
  const [conversationKey, setConversationKey] = useState<string>('');
  const [playingLineId, setPlayingLineId] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});

  const currentKey = useMemo(
    () => dialogueKey(lines, modelA, modelB, turnGap),
    [lines, modelA, modelB, turnGap],
  );
  const conversationIsStale = Boolean(conversation) && conversationKey !== currentKey;
  const spokenLines = useMemo(() => lines.filter((line) => line.text.trim().length > 0), [lines]);
  const sameVoice = modelA.id === modelB.id;

  const conversationRef = useRef<DialogueRender | null>(null);
  conversationRef.current = conversation;

  // Release every object URL this studio created when it goes away.
  useEffect(
    () => () => {
      stopSpeaking();
      releaseDialogue(conversationRef.current);
    },
    [],
  );

  const addLine = () => {
    const lastLine = lines[lines.length - 1];
    const nextSpeaker = lastLine?.speakerId === 'A' ? 'B' : 'A';
    setLines([...lines, { id: String(Date.now()), speakerId: nextSpeaker, text: '' }]);
  };

  const removeLine = (id: string) => {
    setLines(lines.filter((l) => l.id !== id));
  };

  const updateLineText = (id: string, text: string) => {
    setLines(lines.map((l) => (l.id === id ? { ...l, text } : l)));
  };

  const updateLineSpeaker = (id: string, speakerId: 'A' | 'B') => {
    setLines(lines.map((l) => (l.id === id ? { ...l, speakerId } : l)));
  };

  const voiceFor = useCallback(
    (speakerId: 'A' | 'B') => (speakerId === 'A' ? modelA : modelB),
    [modelA, modelB],
  );

  /** Pick a second identity that is audibly distinct from speaker A. */
  const suggestDistinctVoice = () => {
    const candidate =
      models.find((m) => m.id !== modelA.id && (m.baseVoiceId ?? '') !== (modelA.baseVoiceId ?? '')) ||
      models.find((m) => m.id !== modelA.id);
    if (candidate) setModelBId(candidate.id);
  };

  const buildConversation = useCallback(async (): Promise<DialogueRender | null> => {
    if (!spokenLines.length) {
      setDialogueError('Write at least one line of dialogue first.');
      return null;
    }
    setIsRenderingDialogue(true);
    setDialogueError(null);
    try {
      const render = await renderDialogue(
        spokenLines.map((line) => ({
          speakerId: line.speakerId,
          text: line.text,
          model: voiceFor(line.speakerId),
        })),
        { turnGap, sameSpeakerGap: turnGap * 0.44 },
      );
      setConversation((previous) => {
        if (previous) releaseDialogue(previous);
        return render;
      });
      setConversationKey(currentKey);
      return render;
    } catch (error) {
      setDialogueError(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setIsRenderingDialogue(false);
    }
  }, [spokenLines, voiceFor, turnGap, currentKey]);

  /** Play the whole conversation from one render. */
  const playConversation = async () => {
    if (isPlayingDialogue) {
      stopSpeaking();
      setIsPlayingDialogue(false);
      setActiveLineIdx(-1);
      return;
    }
    let render = conversation;
    if (!render || conversationKey !== currentKey) {
      render = await buildConversation();
    }
    if (!render) {
      setIsPlayingDialogue(false);
      return;
    }
    playDialogueRender(render, {
      onStart: () => setIsPlayingDialogue(true),
      onLine: (_line, index) => setActiveLineIdx(index),
      onEnd: () => {
        setIsPlayingDialogue(false);
        setActiveLineIdx(-1);
      },
      onError: (error) => {
        setIsPlayingDialogue(false);
        setActiveLineIdx(-1);
        setDialogueError(error.message);
      },
    });
  };

  /** Audition one line in its own speaker's voice. */
  const playSingleLine = async (line: DialogueLine) => {
    if (playingLineId === line.id) {
      stopSpeaking();
      setPlayingLineId(null);
      return;
    }
    if (!line.text.trim()) return;
    stopSpeaking();
    setPlayingLineId(line.id);
    setLineErrors((previous) => ({ ...previous, [line.id]: '' }));
    await speakText(line.text, voiceFor(line.speakerId), {
      onEnd: () => setPlayingLineId(null),
      onError: (error) => {
        setPlayingLineId(null);
        setLineErrors((previous) => ({ ...previous, [line.id]: error.message }));
      },
    });
  };

  /** Render the conversation so it can be exported. */
  const exportConversation = async () => {
    if (conversation && conversationKey === currentKey) return;
    await buildConversation();
  };

  const diagnostics = conversation?.diagnostics ?? null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Dialogue Cast Configuration */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            Dual-Voice Dialogue & Screenplay
          </h3>
          <p className="text-xs text-slate-400">
            Two voice identities in conversation. Every line is generated from its own text in its own
            speaker's voice, and the whole conversation is one render — so preview and export are the
            same audio.
          </p>
        </div>

        {/* Cast Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Character A */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-cyan-400">Speaker A (Lead)</span>
              <span className="text-[10px] text-slate-400">{modelA.gender}</span>
            </div>
            <select
              value={modelAId}
              onChange={(e) => setModelAId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white cursor-pointer"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.archetype})
                </option>
              ))}
            </select>
          </div>

          {/* Character B */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-indigo-400">Speaker B (Respondent)</span>
              <span className="text-[10px] text-slate-400">{modelB.gender}</span>
            </div>
            <select
              value={modelBId}
              onChange={(e) => setModelBId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white cursor-pointer"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.archetype})
                </option>
              ))}
            </select>
          </div>
        </div>

        {sameVoice && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-amber-950/30 border border-amber-700/40">
            <p className="text-[11px] text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Both speakers use <strong className="font-bold">{modelA.name}</strong>, so the two parts
              will sound identical. A dialogue needs two distinguishable identities.
            </p>
            <button
              onClick={suggestDistinctVoice}
              className="px-3 py-1.5 rounded-xl bg-amber-600/80 hover:bg-amber-500 text-[11px] font-bold text-white transition-colors cursor-pointer"
            >
              Suggest a distinct voice
            </button>
          </div>
        )}

        {/* Turn-taking rhythm */}
        <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400 font-medium flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5 text-indigo-400" /> Turn-taking gap
              </span>
              <span className="text-indigo-400 font-mono font-bold">{turnGap.toFixed(2)}s</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.9"
              step="0.01"
              value={turnGap}
              onChange={(e) => setTurnGap(parseFloat(e.target.value))}
              className="w-full accent-indigo-500 h-1 bg-slate-950 rounded cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500">
              <span>Overlapping, rapid fire</span>
              <span>Deliberate, measured</span>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Silence when the turn changes hands. The same voice continuing gets{' '}
            {(turnGap * 0.44).toFixed(2)}s instead, and a line that trails off without punctuation gets
            less still. Sentence-final pauses already come from the recorded units themselves.
          </p>
        </div>
      </div>

      {/* Screenplay Lines */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <span className="text-xs font-bold uppercase text-slate-400">Conversation Timeline</span>
          <button
            onClick={addLine}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add Line
          </button>
        </div>

        {/* Lines */}
        <div className="space-y-3">
          {lines.map((line) => {
            const isA = line.speakerId === 'A';
            const spokenIndex = spokenLines.findIndex((l) => l.id === line.id);
            const isActive = isPlayingDialogue && spokenIndex >= 0 && activeLineIdx === spokenIndex;
            const voice = voiceFor(line.speakerId);
            const lineError = lineErrors[line.id];

            return (
              <div
                key={line.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isA
                    ? 'bg-cyan-950/20 border-cyan-500/30 ml-0 mr-8'
                    : 'bg-indigo-950/20 border-indigo-500/30 ml-8 mr-0'
                } ${isActive ? 'ring-2 ring-indigo-400 shadow-lg scale-[1.01]' : ''}`}
              >
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={line.speakerId}
                      onChange={(e) => updateLineSpeaker(line.id, e.target.value as 'A' | 'B')}
                      className={`text-xs font-bold rounded-lg px-2 py-1 bg-slate-950 border cursor-pointer ${
                        isA ? 'text-cyan-400 border-cyan-500/40' : 'text-indigo-400 border-indigo-500/40'
                      }`}
                    >
                      <option value="A">{modelA.name}</option>
                      <option value="B">{modelB.name}</option>
                    </select>
                    <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                      {voice.baseVoiceId ? `units: ${voice.baseVoiceId.toUpperCase()}` : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => playSingleLine(line)}
                      disabled={!line.text.trim()}
                      title={`Speak this line as ${voice.name}`}
                      className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-cyan-300 hover:border-cyan-700/50 transition-colors cursor-pointer disabled:opacity-40"
                    >
                      {playingLineId === line.id ? (
                        <Square className="w-3.5 h-3.5 fill-current text-rose-400" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                    </button>
                    <button
                      onClick={() => removeLine(line.id)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Delete this line"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={line.text}
                  onChange={(e) => updateLineText(line.id, e.target.value)}
                  placeholder="Type spoken dialogue..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {lineError ? (
                  <p className="mt-1.5 text-[10px] text-rose-400">{lineError}</p>
                ) : (
                  !line.text.trim() && (
                    <p className="mt-1.5 text-[10px] text-slate-600">
                      Empty lines are skipped when the conversation is generated.
                    </p>
                  )
                )}
              </div>
            );
          })}
        </div>

        {dialogueError && (
          <p className="text-xs text-rose-400 bg-rose-950/40 p-2 rounded-xl border border-rose-800/40">
            {dialogueError}
          </p>
        )}

        {/* Play Dialogue Action */}
        <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={playConversation}
              disabled={isRenderingDialogue}
              className={`px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 shadow-lg transition-all cursor-pointer disabled:opacity-60 ${
                isPlayingDialogue
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 animate-pulse'
                  : 'bg-gradient-to-r from-indigo-500 to-cyan-500 hover:brightness-110 text-white shadow-indigo-500/30'
              }`}
            >
              {isPlayingDialogue ? (
                <>
                  <Square className="w-4 h-4 fill-current" /> Stop Conversation
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  {isRenderingDialogue ? 'Generating conversation…' : 'Play Full Conversation Aloud'}
                </>
              )}
            </button>

            {conversation && !conversationIsStale ? (
              <a
                href={conversation.audioUrl}
                download="vocalis-conversation.wav"
                className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 border border-slate-700 transition-colors"
                title="The exact samples you just heard, as a 16-bit WAV"
              >
                <Download className="w-3.5 h-3.5" /> Export conversation WAV
              </a>
            ) : (
              <button
                onClick={exportConversation}
                disabled={isRenderingDialogue}
                className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 border border-slate-700 transition-colors cursor-pointer disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5" />
                {isRenderingDialogue
                  ? 'Rendering…'
                  : conversationIsStale
                    ? 'Re-render conversation'
                    : 'Render conversation WAV'}
              </button>
            )}
          </div>

          <span className="text-xs text-slate-500 font-mono">
            {spokenLines.length} spoken line{spokenLines.length === 1 ? '' : 's'} &bull; local, non-AI
            speech synthesis
          </span>
        </div>

        {/* Conversation report */}
        {conversation && (
          <div className="pt-4 border-t border-slate-800/80 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <AudioWaveform className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Conversation render
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {conversation.duration.toFixed(2)}s &bull; {conversation.lines.length} lines
                {conversationIsStale ? ' • stale — will re-render' : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-slate-500">
              {conversation.lines.map((line) => (
                <span key={`${line.index}-${line.speakerId}`}>
                  <span className={line.speakerId === 'A' ? 'text-cyan-400' : 'text-indigo-400'}>
                    {line.speakerId}
                  </span>{' '}
                  {line.start.toFixed(2)}–{line.end.toFixed(2)}s {line.voiceName}
                </span>
              ))}
            </div>
            {diagnostics && (
              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono flex-wrap">
                <Stethoscope className="w-3 h-3 text-slate-600" />
                <span>
                  {diagnostics.words} words &bull; {diagnostics.phones} phones &bull;{' '}
                  {diagnostics.exactUnits} recorded units &bull; {diagnostics.backoffUnits} adapted
                  &bull; {diagnostics.fallbackPhones} synthesised &bull;{' '}
                  {(diagnostics.recordedCoverage * 100).toFixed(1)}% recorded
                </span>
                {diagnostics.guessedWords.length > 0 && (
                  <span className="text-amber-400/90">
                    guessed: {diagnostics.guessedWords.slice(0, 8).join(', ')}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
