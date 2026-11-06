import React, { useState, useRef } from 'react';
import { VoiceModelConfig, speakRealWords, stopSpeaking } from '../utils/naturalVoiceEngine';
import { Users, Plus, Trash2, Play, Square, Volume2 } from 'lucide-react';

interface DialogueLine {
  id: string;
  speakerId: 'A' | 'B';
  text: string;
}

interface DialogueStudioProps {
  models: VoiceModelConfig[];
}

export const DialogueStudio: React.FC<DialogueStudioProps> = ({ models }) => {
  const [modelAId, setModelAId] = useState<string>(models[0]?.id || 'narrator-aria');
  const [modelBId, setModelBId] = useState<string>(models[1]?.id || 'titan-marcus');

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
      text: 'Loud and clear, Aria. The new profile has a different pitch and timbre.'
    },
    {
      id: '3',
      speakerId: 'A',
      text: 'The text is mapped to phonemes, then assembled from recorded CMU speech units.'
    },
    {
      id: '4',
      speakerId: 'B',
      text: 'Exactly. The pronunciation dictionary and local synthesis rules shape each spoken line.'
    },
  ]);

  const [isPlayingDialogue, setIsPlayingDialogue] = useState(false);
  const [activeLineIdx, setActiveLineIdx] = useState<number>(-1);
  const cancelRequestedRef = useRef(false);

  const addLine = () => {
    const lastLine = lines[lines.length - 1];
    const nextSpeaker = lastLine?.speakerId === 'A' ? 'B' : 'A';
    setLines([
      ...lines,
      {
        id: String(Date.now()),
        speakerId: nextSpeaker,
        text: '',
      },
    ]);
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

  // Play conversation aloud line by line
  const playDialogue = async () => {
    if (isPlayingDialogue) {
      cancelRequestedRef.current = true;
      stopSpeaking();
      setIsPlayingDialogue(false);
      setActiveLineIdx(-1);
      return;
    }

    setIsPlayingDialogue(true);
    cancelRequestedRef.current = false;

    for (let i = 0; i < lines.length; i++) {
      if (cancelRequestedRef.current) break;
      setActiveLineIdx(i);

      const line = lines[i];
      if (!line.text.trim()) continue;

      const voice = line.speakerId === 'A' ? modelA : modelB;

      await new Promise<void>((resolve) => {
        speakRealWords(line.text, voice, {
          onEnd: () => resolve(),
          onError: () => resolve(),
        });
      });

      // Natural pause between speakers
      await new Promise((r) => setTimeout(r, 350));
    }

    setIsPlayingDialogue(false);
    setActiveLineIdx(-1);
  };

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
            Compare two locally synthesized voice profiles in a back-and-forth conversation
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
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
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
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.archetype})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Screenplay Lines */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <span className="text-xs font-bold uppercase text-slate-400">Conversation Timeline</span>
          <button
            onClick={addLine}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Line
          </button>
        </div>

        {/* Lines */}
        <div className="space-y-3">
          {lines.map((line, idx) => {
            const isA = line.speakerId === 'A';
            const isActive = activeLineIdx === idx;

            return (
              <div
                key={line.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isA
                    ? 'bg-cyan-950/20 border-cyan-500/30 ml-0 mr-8'
                    : 'bg-indigo-950/20 border-indigo-500/30 ml-8 mr-0'
                } ${isActive ? 'ring-2 ring-indigo-400 shadow-lg scale-[1.01]' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <select
                    value={line.speakerId}
                    onChange={(e) => updateLineSpeaker(line.id, e.target.value as any)}
                    className={`text-xs font-bold rounded-lg px-2 py-1 bg-slate-950 border ${
                      isA ? 'text-cyan-400 border-cyan-500/40' : 'text-indigo-400 border-indigo-500/40'
                    }`}
                  >
                    <option value="A">{modelA.name}</option>
                    <option value="B">{modelB.name}</option>
                  </select>

                  <button
                    onClick={() => removeLine(line.id)}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <input
                  type="text"
                  value={line.text}
                  onChange={(e) => updateLineText(line.id, e.target.value)}
                  placeholder="Type spoken dialogue..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            );
          })}
        </div>

        {/* Play Dialogue Action */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={playDialogue}
            className={`px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 shadow-lg transition-all ${
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
                <Volume2 className="w-4 h-4" /> Play Full Conversation Aloud
              </>
            )}
          </button>

          <span className="text-xs text-slate-500 font-mono">
            {lines.length} lines &bull; local CMU diphone synthesis
          </span>
        </div>
      </div>
    </div>
  );
};
