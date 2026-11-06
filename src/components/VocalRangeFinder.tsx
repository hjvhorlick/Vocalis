import React, { useState, useEffect, useRef } from 'react';
import { PitchDetectionResult, NoteInfo, VoiceClassification } from '../types/vocalis';
import { VOICE_CLASSIFICATIONS, determineVoiceClassification } from '../utils/scalesData';
import { synth } from '../utils/audioPitch';
import { Target, CheckCircle2, Volume2, RotateCcw, Trophy, ArrowDown, ArrowUp, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

interface VocalRangeFinderProps {
  isMicActive: boolean;
  onStartMic: () => void;
  pitchData: PitchDetectionResult;
}

export const VocalRangeFinder: React.FC<VocalRangeFinderProps> = ({
  isMicActive,
  onStartMic,
  pitchData,
}) => {
  type TestStage = 'intro' | 'testing_low' | 'testing_high' | 'completed';

  const [stage, setStage] = useState<TestStage>('intro');
  const [lowestNote, setLowestNote] = useState<NoteInfo | null>(null);
  const [highestNote, setHighestNote] = useState<NoteInfo | null>(null);
  const [classification, setClassification] = useState<VoiceClassification | null>(null);

  // Note sustain counter: user must sustain pitch for 1.2s to confirm
  const [sustainProgress, setSustainProgress] = useState(0); // 0 to 100
  const candidateNoteRef = useRef<NoteInfo | null>(null);
  const sustainStartRef = useRef<number | null>(null);

  // Evaluate live pitch during testing
  useEffect(() => {
    if (stage !== 'testing_low' && stage !== 'testing_high') {
      setSustainProgress(0);
      sustainStartRef.current = null;
      candidateNoteRef.current = null;
      return;
    }

    const currentNote = pitchData.note;
    if (pitchData.frequency > 0 && currentNote) {
      // Check if candidate matches
      if (
        !candidateNoteRef.current ||
        candidateNoteRef.current.fullName !== currentNote.fullName
      ) {
        candidateNoteRef.current = currentNote;
        sustainStartRef.current = Date.now();
        setSustainProgress(0);
      } else {
        // Sustaining same note
        const elapsed = Date.now() - (sustainStartRef.current || Date.now());
        const targetDuration = 1200; // 1.2 seconds
        const progress = Math.min(100, Math.round((elapsed / targetDuration) * 100));
        setSustainProgress(progress);

        if (progress >= 100) {
          // Locked in!
          if (stage === 'testing_low') {
            if (!lowestNote || currentNote.midi < lowestNote.midi) {
              setLowestNote(currentNote);
            }
          } else if (stage === 'testing_high') {
            if (!highestNote || currentNote.midi > highestNote.midi) {
              setHighestNote(currentNote);
            }
          }
        }
      }
    } else {
      setSustainProgress(0);
      sustainStartRef.current = null;
    }
  }, [pitchData, stage, lowestNote, highestNote]);

  const startTest = () => {
    if (!isMicActive) {
      onStartMic();
    }
    setLowestNote(null);
    setHighestNote(null);
    setClassification(null);
    setStage('testing_low');
  };

  const confirmLowestNote = () => {
    if (!lowestNote && pitchData.note) {
      setLowestNote(pitchData.note);
    }
    setStage('testing_high');
    setSustainProgress(0);
  };

  const finishTest = () => {
    const finalLow = lowestNote || { name: 'A', fullName: 'A2', octave: 2, midi: 45, frequency: 110 };
    const finalHigh = highestNote || (pitchData.note ? pitchData.note : { name: 'E', fullName: 'E4', octave: 4, midi: 64, frequency: 329.6 });

    setLowestNote(finalLow);
    setHighestNote(finalHigh);

    const result = determineVoiceClassification(finalLow.midi, finalHigh.midi);
    setClassification(result);
    setStage('completed');

    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // ignore
    }
  };

  const playPitch = (freq: number) => {
    synth.playTone(freq, 1.2, 'piano');
  };

  // Keyboard notes for reference diagram
  const allNotes = [
    'C2', 'D2', 'E2', 'F2', 'G2', 'A2', 'B2',
    'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3',
    'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4',
    'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5',
    'C6'
  ];

  const rangeSpanSemitones = lowestNote && highestNote ? highestNote.midi - lowestNote.midi : 0;
  const rangeOctaves = (rangeSpanSemitones / 12).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Intro Stage */}
      {stage === 'intro' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 text-center max-w-3xl mx-auto shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 text-indigo-400 mx-auto flex items-center justify-center mb-4">
            <Target className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white">Vocal Range & Voice Type Finder</h2>
          <p className="text-slate-400 text-sm mt-2 max-w-xl mx-auto">
            Discover whether you are a <span className="text-cyan-400 font-semibold">Bass</span>,{' '}
            <span className="text-indigo-400 font-semibold">Baritone</span>,{' '}
            <span className="text-emerald-400 font-semibold">Tenor</span>,{' '}
            <span className="text-purple-400 font-semibold">Contralto</span>,{' '}
            <span className="text-pink-400 font-semibold">Mezzo-Soprano</span>, or{' '}
            <span className="text-amber-400 font-semibold">Soprano</span>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 text-left">
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
                <ArrowDown className="w-4 h-4" />
                Step 1: Lowest Note
              </div>
              <p className="text-xs text-slate-400">
                Sing down comfortably on a relaxed &quot;Ah&quot; or &quot;Oh&quot; to test your deepest resonant chest voice.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
                <ArrowUp className="w-4 h-4" />
                Step 2: Highest Note
              </div>
              <p className="text-xs text-slate-400">
                Ascend on an &quot;Oo&quot; or &quot;Ee&quot; to identify your highest clear note without painful straining.
              </p>
            </div>
          </div>

          <button
            onClick={startTest}
            className="mt-8 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-semibold shadow-lg shadow-indigo-500/25 hover:brightness-110 active:scale-95 transition-all text-sm inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Start Vocal Range Test
          </button>
        </div>
      )}

      {/* Step 1: Testing Low Note */}
      {stage === 'testing_low' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 max-w-3xl mx-auto shadow-2xl space-y-6">
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              Step 1 of 2: Lowest Note
            </span>
            <button
              onClick={() => setStage('intro')}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </div>

          <div className="text-center py-4">
            <h3 className="text-xl font-bold text-white">Sing your lowest comfortable note</h3>
            <p className="text-slate-400 text-xs mt-1">
              Sing a steady low &quot;Ah&quot; or &quot;Oh&quot; and hold it for 1.2 seconds until locked in.
            </p>

            {/* Live Detected Note Box */}
            <div className="mt-6 p-6 rounded-2xl bg-slate-950 border border-slate-800 inline-block min-w-[260px]">
              <span className="text-xs uppercase tracking-wider text-slate-500 block mb-1">Currently Singing</span>
              {pitchData.note ? (
                <>
                  <div className="text-5xl font-mono font-extrabold text-cyan-400">
                    {pitchData.note.fullName}
                  </div>
                  <span className="text-xs font-mono text-slate-400 mt-1 block">
                    {pitchData.frequency.toFixed(1)} Hz
                  </span>
                </>
              ) : (
                <div className="text-2xl font-mono text-slate-600 py-3">Listening...</div>
              )}

              {/* Hold progress bar */}
              <div className="mt-4">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>Hold note steady</span>
                  <span>{sustainProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-400 transition-all duration-75"
                    style={{ width: `${sustainProgress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Registered Lowest Note */}
            {lowestNote && (
              <div className="mt-4 inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-slate-300">
                  Lowest registered:{' '}
                  <strong className="text-white font-mono text-sm">{lowestNote.fullName}</strong> (
                  {lowestNote.frequency.toFixed(1)} Hz)
                </span>
                <button
                  onClick={() => playPitch(lowestNote.frequency)}
                  className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200"
                  title="Play Note"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              onClick={confirmLowestNote}
              disabled={!lowestNote && !pitchData.note}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium text-xs shadow-md transition-all"
            >
              Confirm Lowest & Proceed to Highest &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Testing High Note */}
      {stage === 'testing_high' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 max-w-3xl mx-auto shadow-2xl space-y-6">
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Step 2 of 2: Highest Note
            </span>
            <button
              onClick={() => setStage('intro')}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </div>

          <div className="text-center py-4">
            <h3 className="text-xl font-bold text-white">Sing your highest comfortable note</h3>
            <p className="text-slate-400 text-xs mt-1">
              Sing high with good breath support. Do not force or strain painful notes.
            </p>

            {/* Live Detected Note Box */}
            <div className="mt-6 p-6 rounded-2xl bg-slate-950 border border-slate-800 inline-block min-w-[260px]">
              <span className="text-xs uppercase tracking-wider text-slate-500 block mb-1">Currently Singing</span>
              {pitchData.note ? (
                <>
                  <div className="text-5xl font-mono font-extrabold text-amber-400">
                    {pitchData.note.fullName}
                  </div>
                  <span className="text-xs font-mono text-slate-400 mt-1 block">
                    {pitchData.frequency.toFixed(1)} Hz
                  </span>
                </>
              ) : (
                <div className="text-2xl font-mono text-slate-600 py-3">Listening...</div>
              )}

              {/* Hold progress bar */}
              <div className="mt-4">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>Hold note steady</span>
                  <span>{sustainProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all duration-75"
                    style={{ width: `${sustainProgress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Registered Highest Note */}
            {highestNote && (
              <div className="mt-4 inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-slate-300">
                  Highest registered:{' '}
                  <strong className="text-white font-mono text-sm">{highestNote.fullName}</strong> (
                  {highestNote.frequency.toFixed(1)} Hz)
                </span>
                <button
                  onClick={() => playPitch(highestNote.frequency)}
                  className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200"
                  title="Play Note"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-slate-800">
            <button
              onClick={() => setStage('testing_low')}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              &larr; Back to Low Note
            </button>
            <button
              onClick={finishTest}
              disabled={!highestNote && !pitchData.note}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium text-xs shadow-md transition-all"
            >
              Calculate Voice Classification &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Completed Stage: Results */}
      {stage === 'completed' && classification && lowestNote && highestNote && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 max-w-4xl mx-auto shadow-2xl space-y-8 animate-in fade-in duration-300">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 mx-auto flex items-center justify-center mb-4">
              <Trophy className="w-8 h-8" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Vocal Profile Result
            </span>
            <h2 className="text-3xl font-extrabold text-white mt-1">
              You are a <span style={{ color: classification.color }}>{classification.type}</span>
            </h2>
            <p className="text-slate-400 text-sm max-w-lg mx-auto mt-2">
              {classification.description}
            </p>
          </div>

          {/* Range Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-xs text-slate-500 uppercase font-semibold">Lowest Note</span>
              <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
                {lowestNote.fullName}
              </div>
              <span className="text-xs font-mono text-slate-400">
                {lowestNote.frequency.toFixed(1)} Hz
              </span>
              <div className="mt-2">
                <button
                  onClick={() => playPitch(lowestNote.frequency)}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  <Volume2 className="w-3 h-3" /> Play Tone
                </button>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-xs text-slate-500 uppercase font-semibold">Total Range</span>
              <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                {rangeSpanSemitones} Semitones
              </div>
              <span className="text-xs font-mono text-slate-400">
                {rangeOctaves} Octaves
              </span>
              <div className="mt-2 text-[11px] text-slate-400">
                {lowestNote.fullName} &harr; {highestNote.fullName}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-xs text-slate-500 uppercase font-semibold">Highest Note</span>
              <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                {highestNote.fullName}
              </div>
              <span className="text-xs font-mono text-slate-400">
                {highestNote.frequency.toFixed(1)} Hz
              </span>
              <div className="mt-2">
                <button
                  onClick={() => playPitch(highestNote.frequency)}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  <Volume2 className="w-3 h-3" /> Play Tone
                </button>
              </div>
            </div>
          </div>

          {/* Voice Types Spectrum Comparison */}
          <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Vocal Spectrum Comparison
            </h4>
            <div className="space-y-2.5">
              {VOICE_CLASSIFICATIONS.map((vc) => {
                const isUserType = vc.type === classification.type;
                const minScaleMidi = 36; // C2
                const maxScaleMidi = 84; // C6
                const totalSemitones = maxScaleMidi - minScaleMidi;

                const leftPercent = ((vc.lowMidi - minScaleMidi) / totalSemitones) * 100;
                const widthPercent = ((vc.highMidi - vc.lowMidi) / totalSemitones) * 100;

                return (
                  <div key={vc.type} className="flex items-center gap-3 text-xs">
                    <span
                      className={`w-28 font-medium truncate ${
                        isUserType ? 'text-white font-bold' : 'text-slate-400'
                      }`}
                    >
                      {vc.type}
                    </span>
                    <div className="flex-1 h-5 bg-slate-900 rounded-lg relative overflow-hidden border border-slate-800">
                      <div
                        className="h-full rounded transition-all duration-300 opacity-80"
                        style={{
                          marginLeft: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                          backgroundColor: vc.color,
                        }}
                      />
                      {isUserType && (
                        <div
                          className="absolute inset-y-0 border-2 border-white rounded shadow"
                          style={{
                            marginLeft: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                          }}
                        />
                      )}
                    </div>
                    <span className="w-20 font-mono text-[11px] text-right text-slate-400">
                      {vc.lowNote}–{vc.highNote}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-center gap-4 pt-2">
            <button
              onClick={startTest}
              className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs flex items-center gap-2 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retest Vocal Range
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
