import React, { useState, useEffect, useRef } from 'react';
import { PitchDetectionResult, ScaleExercise } from '../types/vocalis';
import { SCALE_EXERCISES } from '../utils/scalesData';
import { synth, midiToNote, midiToFrequency } from '../utils/audioPitch';
import { Play, Square, FastForward, Rewind, Volume2, VolumeX, Sparkles, Trophy, Flame } from 'lucide-react';

interface ScaleTrainerProps {
  isMicActive: boolean;
  onStartMic: () => void;
  pitchData: PitchDetectionResult;
}

export const ScaleTrainer: React.FC<ScaleTrainerProps> = ({
  isMicActive,
  onStartMic,
  pitchData,
}) => {
  const [selectedExercise, setSelectedExercise] = useState<ScaleExercise>(SCALE_EXERCISES[0]);
  const [rootMidi, setRootMidi] = useState<number>(60); // C4
  const [tempoBpm, setTempoBpm] = useState<number>(85);
  const [autoTranspose, setAutoTranspose] = useState<boolean>(true);
  const [playAccomp, setPlayAccomp] = useState<boolean>(true);

  // Playback execution state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [pitchScore, setPitchScore] = useState<number>(0);
  const [totalStepsEvaluated, setTotalStepsEvaluated] = useState<number>(0);
  const [comboStreak, setComboStreak] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);
  const [feedbackText, setFeedbackText] = useState<string>('Ready to start warm-up');

  const playbackTimerRef = useRef<number | null>(null);
  const currentStepRef = useRef<number>(-1);
  const stepScoreSamplesRef = useRef<{ hit: boolean }[]>([]);

  // Compute active sequence notes based on exercise and rootMidi
  const sequenceNotes = selectedExercise.intervals.map((interval, idx) => {
    const noteMidi = rootMidi + interval;
    const noteInfo = midiToNote(noteMidi);
    const durationMultiplier = selectedExercise.durations[idx] || 1;
    const syllable = selectedExercise.syllables[idx] || 'La';
    return {
      noteInfo,
      midi: noteMidi,
      frequency: noteInfo.frequency,
      durationMultiplier,
      syllable,
    };
  });

  // Real-time pitch scoring on the active step
  useEffect(() => {
    if (!isPlaying || currentStepIndex < 0 || currentStepIndex >= sequenceNotes.length) return;

    const target = sequenceNotes[currentStepIndex];
    if (pitchData.frequency > 0 && pitchData.note) {
      // Check difference in semitones/cents from target MIDI
      const userMidiExact = 69 + 12 * Math.log2(pitchData.frequency / 440);
      const diffCents = Math.abs((userMidiExact - target.midi) * 100);

      const isHit = diffCents <= 35; // within 35 cents
      stepScoreSamplesRef.current.push({ hit: isHit });

      if (isHit) {
        setFeedbackText('Spot on! In tune');
      } else if (diffCents <= 60) {
        setFeedbackText(userMidiExact < target.midi ? 'Slightly flat' : 'Slightly sharp');
      } else {
        setFeedbackText('Adjust pitch to target');
      }
    }
  }, [pitchData, isPlaying, currentStepIndex]);

  // Step sequencer runner
  const startExercise = () => {
    if (!isMicActive) {
      onStartMic();
    }

    setIsPlaying(true);
    setCurrentStepIndex(0);
    currentStepRef.current = 0;
    setPitchScore(0);
    setTotalStepsEvaluated(0);
    setComboStreak(0);
    setFeedbackText('Sing the target note!');

    runStep(0, rootMidi);
  };

  const stopExercise = () => {
    setIsPlaying(false);
    setCurrentStepIndex(-1);
    currentStepRef.current = -1;
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setFeedbackText('Exercise paused');
  };

  const runStep = (stepIdx: number, activeRoot: number) => {
    if (stepIdx >= selectedExercise.intervals.length) {
      // Completed one iteration of the scale!
      if (autoTranspose) {
        // Step up 1 semitone
        const nextRoot = activeRoot < 72 ? activeRoot + 1 : 48; // wrap if too high
        setRootMidi(nextRoot);
        setFeedbackText(`Transposing up to ${midiToNote(nextRoot).fullName}!`);
        playbackTimerRef.current = window.setTimeout(() => {
          currentStepRef.current = 0;
          setCurrentStepIndex(0);
          runStep(0, nextRoot);
        }, 1200);
      } else {
        stopExercise();
        setFeedbackText('Exercise complete! Great work.');
      }
      return;
    }

    currentStepRef.current = stepIdx;
    setCurrentStepIndex(stepIdx);

    const interval = selectedExercise.intervals[stepIdx];
    const targetMidi = activeRoot + interval;
    const freq = midiToFrequency(targetMidi);
    const durationMult = selectedExercise.durations[stepIdx] || 1;
    const baseBeatMs = (60 / tempoBpm) * 1000;
    const stepDurationMs = baseBeatMs * durationMult;

    // Play guide piano sound if enabled
    if (playAccomp) {
      synth.playTone(freq, (stepDurationMs / 1000) * 0.9, 'piano');
    }

    // Reset step score buffer
    stepScoreSamplesRef.current = [];

    // Schedule next step
    playbackTimerRef.current = window.setTimeout(() => {
      // Evaluate score for finished step
      const samples = stepScoreSamplesRef.current;
      const hitCount = samples.filter((s) => s.hit).length;
      const stepPassed = samples.length > 3 && hitCount / samples.length >= 0.4;

      setTotalStepsEvaluated((prev) => prev + 1);
      if (stepPassed) {
        setPitchScore((prev) => prev + 1);
        setComboStreak((prev) => {
          const next = prev + 1;
          setMaxCombo((m) => Math.max(m, next));
          return next;
        });
      } else if (samples.length > 2) {
        setComboStreak(0);
      }

      runStep(stepIdx + 1, activeRoot);
    }, stepDurationMs);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
      }
    };
  }, []);

  const rootNoteInfo = midiToNote(rootMidi);
  const accuracyPercentage =
    totalStepsEvaluated > 0 ? Math.round((pitchScore / totalStepsEvaluated) * 100) : 100;

  return (
    <div className="space-y-6">
      {/* Exercise Selection Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {SCALE_EXERCISES.map((ex) => {
          const isSelected = selectedExercise.id === ex.id;
          return (
            <button
              key={ex.id}
              onClick={() => {
                if (isPlaying) stopExercise();
                setSelectedExercise(ex);
              }}
              className={`p-4 rounded-2xl border text-left transition-all duration-150 ${
                isSelected
                  ? 'bg-indigo-950/70 border-indigo-500/80 shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/50 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-white text-sm">{ex.name}</span>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    ex.category === 'beginner'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : ex.category === 'intermediate'
                      ? 'bg-cyan-500/10 text-cyan-400'
                      : 'bg-amber-500/10 text-amber-400'
                  }`}
                >
                  {ex.category}
                </span>
              </div>
              <p className="text-xs text-slate-400 line-clamp-2">{ex.description}</p>
            </button>
          );
        })}
      </div>

      {/* Main Sing-Along Pitch Sequence Stage */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
        {/* Controls Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            {isPlaying ? (
              <button
                onClick={stopExercise}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all"
              >
                <Square className="w-4 h-4 fill-current" />
                Stop Scale
              </button>
            ) : (
              <button
                onClick={startExercise}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:brightness-110 text-white font-semibold text-sm flex items-center gap-2 shadow-lg shadow-indigo-500/25 transition-all"
              >
                <Play className="w-4 h-4 fill-current" />
                Start Scale Trainer
              </button>
            )}

            {/* Starting Root Key Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-400">Key:</span>
              <button
                onClick={() => !isPlaying && setRootMidi((m) => Math.max(36, m - 1))}
                disabled={isPlaying}
                className="p-1 text-slate-400 hover:text-white disabled:opacity-40"
              >
                <Rewind className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono font-bold text-white px-1">{rootNoteInfo.fullName}</span>
              <button
                onClick={() => !isPlaying && setRootMidi((m) => Math.min(84, m + 1))}
                disabled={isPlaying}
                className="p-1 text-slate-400 hover:text-white disabled:opacity-40"
              >
                <FastForward className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Tempo & Accomp Toggles */}
          <div className="flex items-center gap-4 text-xs">
            {/* Auto Transpose */}
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={autoTranspose}
                onChange={(e) => setAutoTranspose(e.target.checked)}
                className="rounded accent-indigo-500"
              />
              <span>Auto Step Up (+1)</span>
            </label>

            {/* Sound Accomp */}
            <button
              onClick={() => setPlayAccomp(!playAccomp)}
              className={`p-2 rounded-xl border flex items-center gap-1.5 transition-colors ${
                playAccomp
                  ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                  : 'bg-slate-950 text-slate-500 border-slate-800'
              }`}
              title="Toggle Piano Accomp Guide"
            >
              {playAccomp ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span className="hidden sm:inline">Piano Tone</span>
            </button>

            {/* Tempo Slider */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400">{tempoBpm} BPM</span>
              <input
                type="range"
                min="60"
                max="140"
                step="5"
                value={tempoBpm}
                onChange={(e) => setTempoBpm(parseInt(e.target.value))}
                className="w-20 accent-indigo-500 h-1.5 bg-slate-800 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Dynamic Scale Step Note Tiles */}
        <div className="py-6 overflow-x-auto">
          <div className="flex items-center justify-center gap-2 min-w-max px-2">
            {sequenceNotes.map((step, idx) => {
              const isActive = currentStepIndex === idx;
              const isPast = currentStepIndex > idx;

              return (
                <div
                  key={idx}
                  className={`flex flex-col items-center justify-between p-3.5 rounded-2xl w-20 sm:w-24 h-32 border transition-all duration-150 ${
                    isActive
                      ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl shadow-indigo-600/40 scale-105 ring-2 ring-indigo-300'
                      : isPast
                      ? 'bg-slate-950/80 border-slate-800 text-slate-400 opacity-70'
                      : 'bg-slate-950 border-slate-800/80 text-slate-300'
                  }`}
                >
                  <span className="text-[11px] font-mono text-slate-400">
                    Step {idx + 1}
                  </span>

                  <div className="text-center my-auto">
                    <span className="text-2xl sm:text-3xl font-extrabold font-mono block">
                      {step.noteInfo.fullName}
                    </span>
                    <span className="text-[11px] font-mono opacity-80 block">
                      {step.frequency.toFixed(0)} Hz
                    </span>
                  </div>

                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-800/80 text-slate-400'
                    }`}
                  >
                    &ldquo;{step.syllable}&rdquo;
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Real-Time Sing-Along Score & Accuracy Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-800">
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Pitch Accuracy</span>
              <div className="text-xl font-bold font-mono text-white">
                {accuracyPercentage}%
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold">In-Tune Streak</span>
              <div className="text-xl font-bold font-mono text-white">
                {comboStreak}x <span className="text-xs text-slate-500 font-normal">(Best: {maxCombo})</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Coach Feedback</span>
              <div className="text-sm font-semibold text-indigo-300">
                {feedbackText}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
