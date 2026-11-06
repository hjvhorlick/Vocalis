import React, { useState, useEffect, useRef } from 'react';
import { PitchDetectionResult } from '../types/vocalis';
import { synth } from '../utils/audioPitch';
import { Play, Square, RotateCcw, Wind, Activity, HeartPulse, CheckCircle2, ShieldCheck } from 'lucide-react';

interface VocalGymProps {
  isMicActive: boolean;
  onStartMic: () => void;
  pitchData: PitchDetectionResult;
}

export const VocalGym: React.FC<VocalGymProps> = ({
  isMicActive,
  onStartMic,
  pitchData,
}) => {
  const [gymTab, setGymTab] = useState<'stability' | 'breath' | 'sovte'>('stability');

  // --- Stability Test State ---
  const [isStabilityTesting, setIsStabilityTesting] = useState(false);
  const [targetNoteMidi, setTargetNoteMidi] = useState(60); // C4
  const [stabilityDuration, setStabilityDuration] = useState(0);
  const [stabilityJitter, setStabilityJitter] = useState<number | null>(null);
  const [stabilityScore, setStabilityScore] = useState<number | null>(null);

  const stabilityHistoryRef = useRef<number[]>([]);
  const stabilityTimerRef = useRef<number | null>(null);

  const startStabilityTest = () => {
    if (!isMicActive) onStartMic();
    setIsStabilityTesting(true);
    setStabilityDuration(0);
    setStabilityJitter(null);
    setStabilityScore(null);
    stabilityHistoryRef.current = [];

    // Play prompt tone
    synth.playTone(440 * Math.pow(2, (targetNoteMidi - 69) / 12), 1.0, 'piano');

    stabilityTimerRef.current = window.setInterval(() => {
      setStabilityDuration((prev) => prev + 0.1);
    }, 100);
  };

  const stopStabilityTest = () => {
    setIsStabilityTesting(false);
    if (stabilityTimerRef.current) {
      clearInterval(stabilityTimerRef.current);
      stabilityTimerRef.current = null;
    }

    // Compute stability jitter (standard deviation of cents)
    const centsSamples = stabilityHistoryRef.current;
    if (centsSamples.length > 10) {
      const mean = centsSamples.reduce((a, b) => a + b, 0) / centsSamples.length;
      const variance =
        centsSamples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
        centsSamples.length;
      const stdDev = Math.sqrt(variance);
      setStabilityJitter(Math.round(stdDev * 10) / 10);

      // Score: 0 stdDev = 100%, 30 stdDev = 0%
      const score = Math.max(0, Math.min(100, Math.round(100 - (stdDev / 30) * 100)));
      setStabilityScore(score);
    }
  };

  // Record pitch stability sample during test
  useEffect(() => {
    if (!isStabilityTesting) return;
    if (pitchData.frequency > 0 && pitchData.note) {
      const targetFreq = 440 * Math.pow(2, (targetNoteMidi - 69) / 12);
      const centsOffset = 1200 * Math.log2(pitchData.frequency / targetFreq);
      stabilityHistoryRef.current.push(centsOffset);
    }
  }, [pitchData, isStabilityTesting, targetNoteMidi]);

  // --- Breath Trainer State ---
  type BreathPattern = 'box' | '478' | 'hiss';
  const [breathPattern, setBreathPattern] = useState<BreathPattern>('478');
  const [isBreathingActive, setIsBreathingActive] = useState(false);
  const [breathPhase, setBreathPhase] = useState<'Inhale' | 'Hold' | 'Exhale' | 'Rest'>('Inhale');
  const [phaseSecondsLeft, setPhaseSecondsLeft] = useState(4);
  const [cyclesCompleted, setCyclesCompleted] = useState(0);

  const breathTimerRef = useRef<number | null>(null);

  const patternConfig = {
    '478': [
      { phase: 'Inhale' as const, duration: 4 },
      { phase: 'Hold' as const, duration: 7 },
      { phase: 'Exhale' as const, duration: 8 },
    ],
    box: [
      { phase: 'Inhale' as const, duration: 4 },
      { phase: 'Hold' as const, duration: 4 },
      { phase: 'Exhale' as const, duration: 4 },
      { phase: 'Rest' as const, duration: 4 },
    ],
    hiss: [
      { phase: 'Inhale' as const, duration: 4 },
      { phase: 'Exhale' as const, duration: 16 }, // slow steady hiss
    ],
  };

  const startBreathing = () => {
    setIsBreathingActive(true);
    setCyclesCompleted(0);
    runBreathSequence(0, 0);
  };

  const stopBreathing = () => {
    setIsBreathingActive(false);
    if (breathTimerRef.current) {
      clearInterval(breathTimerRef.current);
      breathTimerRef.current = null;
    }
    setBreathPhase('Inhale');
    setPhaseSecondsLeft(4);
  };

  const runBreathSequence = (seqIndex: number, cycle: number) => {
    const steps = patternConfig[breathPattern];
    const currentStep = steps[seqIndex];
    setBreathPhase(currentStep.phase);
    setPhaseSecondsLeft(currentStep.duration);

    let secLeft = currentStep.duration;

    if (breathTimerRef.current) clearInterval(breathTimerRef.current);

    breathTimerRef.current = window.setInterval(() => {
      secLeft--;
      setPhaseSecondsLeft(secLeft);

      if (secLeft <= 0) {
        clearInterval(breathTimerRef.current!);
        const nextIndex = (seqIndex + 1) % steps.length;
        const nextCycle = nextIndex === 0 ? cycle + 1 : cycle;
        if (nextIndex === 0) setCyclesCompleted(nextCycle);
        runBreathSequence(nextIndex, nextCycle);
      }
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (stabilityTimerRef.current) clearInterval(stabilityTimerRef.current);
      if (breathTimerRef.current) clearInterval(breathTimerRef.current);
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setGymTab('stability')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
            gymTab === 'stability'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Activity className="w-4 h-4" />
          Sustained Pitch Stability
        </button>
        <button
          onClick={() => setGymTab('breath')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
            gymTab === 'breath'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Wind className="w-4 h-4" />
          Diaphragm Breath Gym
        </button>
        <button
          onClick={() => setGymTab('sovte')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
            gymTab === 'sovte'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          SOVTE & Vocal Health
        </button>
      </div>

      {/* Tab 1: Sustained Note Stability Test */}
      {gymTab === 'stability' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 max-w-3xl mx-auto shadow-2xl space-y-6 text-center">
          <div>
            <h3 className="text-xl font-bold text-white">Sustained Pitch Stability & Jitter Test</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-lg mx-auto">
              Sustain one steady pitch for as long as possible on one full breath. Vocalis measures
              micro-pitch jitter (steadiness), vital capacity duration, and vibrato.
            </p>
          </div>

          {/* Target Note Selector */}
          <div className="flex items-center justify-center gap-3">
            <span className="text-xs text-slate-400">Target Note:</span>
            {[
              { label: 'G3', midi: 55 },
              { label: 'A3', midi: 57 },
              { label: 'C4', midi: 60 },
              { label: 'E4', midi: 64 },
              { label: 'G4', midi: 67 },
              { label: 'C5', midi: 72 },
            ].map((n) => (
              <button
                key={n.midi}
                onClick={() => {
                  setTargetNoteMidi(n.midi);
                  synth.playTone(440 * Math.pow(2, (n.midi - 69) / 12), 0.8, 'piano');
                }}
                disabled={isStabilityTesting}
                className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all ${
                  targetNoteMidi === n.midi
                    ? 'bg-indigo-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {n.label}
              </button>
            ))}
          </div>

          {/* Central Target Circle & Timer */}
          <div className="py-8 flex flex-col items-center justify-center">
            <div className="relative w-48 h-48 rounded-full border-4 border-slate-800 flex items-center justify-center bg-slate-950">
              {/* Animated pulsating outer ring if testing */}
              {isStabilityTesting && (
                <div className="absolute inset-0 rounded-full border-2 border-indigo-500 animate-ping opacity-25" />
              )}

              <div className="text-center z-10">
                <span className="text-4xl font-extrabold font-mono text-white">
                  {stabilityDuration.toFixed(1)}s
                </span>
                <span className="text-[11px] uppercase tracking-wider text-slate-500 block mt-1">
                  Breath Duration
                </span>
                {pitchData.note && isStabilityTesting && (
                  <span className="text-xs font-mono font-bold text-emerald-400 mt-2 block">
                    Singing: {pitchData.note.fullName}
                  </span>
                )}
              </div>
            </div>

            {/* Test Toggle Button */}
            <div className="mt-6">
              {isStabilityTesting ? (
                <button
                  onClick={stopStabilityTest}
                  className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all"
                >
                  <Square className="w-4 h-4 fill-current" />
                  Stop & Calculate Jitter
                </button>
              ) : (
                <button
                  onClick={startStabilityTest}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Start Stability Test
                </button>
              )}
            </div>
          </div>

          {/* Results Summary */}
          {stabilityScore !== null && stabilityJitter !== null && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-800 text-center animate-in fade-in duration-300">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500">Stability Score</span>
                <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                  {stabilityScore}%
                </div>
                <span className="text-[11px] text-slate-400">
                  {stabilityScore > 80 ? 'Masterful steadiness' : 'Good steady foundation'}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500">Pitch Jitter (StdDev)</span>
                <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
                  &plusmn;{stabilityJitter}&cent;
                </div>
                <span className="text-[11px] text-slate-400">
                  {stabilityJitter < 15 ? 'Sub-semitone precision' : 'Target under ±15¢'}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500">Max Hold</span>
                <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                  {stabilityDuration.toFixed(1)}s
                </div>
                <span className="text-[11px] text-slate-400">
                  {stabilityDuration > 15 ? 'Great lung capacity' : 'Aim for 15+ seconds'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Diaphragm Breath Gym */}
      {gymTab === 'breath' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 max-w-3xl mx-auto shadow-2xl space-y-6 text-center">
          <div>
            <h3 className="text-xl font-bold text-white">Diaphragmatic Breath Training</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-lg mx-auto">
              Singing power comes from controlled diaphragmatic air pressure. Follow the visual breath guide.
            </p>
          </div>

          {/* Pattern Picker */}
          <div className="flex items-center justify-center gap-2">
            {[
              { id: '478' as const, label: '4-7-8 Relaxation' },
              { id: 'box' as const, label: '4-4-4-4 Box Breathing' },
              { id: 'hiss' as const, label: 'Sustained Sibilant Hiss' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  stopBreathing();
                  setBreathPattern(p.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  breathPattern === p.id
                    ? 'bg-indigo-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Animated Expanding/Contracting Circle */}
          <div className="py-8 flex flex-col items-center justify-center">
            <div
              className={`w-52 h-52 rounded-full border-4 flex items-center justify-center transition-all duration-1000 ${
                breathPhase === 'Inhale'
                  ? 'scale-110 border-cyan-400 bg-cyan-950/40 shadow-2xl shadow-cyan-500/20'
                  : breathPhase === 'Hold'
                  ? 'scale-110 border-indigo-400 bg-indigo-950/40 shadow-2xl shadow-indigo-500/20'
                  : 'scale-90 border-emerald-400 bg-emerald-950/30'
              }`}
            >
              <div className="text-center">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  {breathPhase}
                </span>
                <span className="text-5xl font-extrabold font-mono text-white">
                  {phaseSecondsLeft}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Cycles: {cyclesCompleted}
                </span>
              </div>
            </div>

            <div className="mt-6">
              {isBreathingActive ? (
                <button
                  onClick={stopBreathing}
                  className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md"
                >
                  Stop Breathing Exercise
                </button>
              ) : (
                <button
                  onClick={startBreathing}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md"
                >
                  Start Breath Sequence
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: SOVTE Vocal Health */}
      {gymTab === 'sovte' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 max-w-4xl mx-auto shadow-2xl space-y-6">
          <div className="text-center">
            <h3 className="text-xl font-bold text-white">SOVTE & Vocal Health Protocols</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xl mx-auto">
              Semi-Occluded Vocal Tract Exercises (SOVTE) create back-pressure at the lips, gently separating
              the vocal cords to promote healthy vibration with zero muscular strain.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-indigo-400 text-sm font-bold">
                <CheckCircle2 className="w-4 h-4" />
                Straw Phonation
              </div>
              <p className="text-xs text-slate-400">
                Place a drinking straw between your lips (or into a glass of water). Hum a steady middle pitch.
                The acoustic impedance balances the subglottic pressure and instantly relieves vocal fatigue.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-cyan-400 text-sm font-bold">
                <CheckCircle2 className="w-4 h-4" />
                Lip Trills (&quot;Brrr&quot;)
              </div>
              <p className="text-xs text-slate-400">
                Support the corners of your cheeks with your fingers and blow steady air so your lips bubble smoothly.
                Glide up and down 1 octave without pressing your throat.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
                <CheckCircle2 className="w-4 h-4" />
                Vocal Warm-Down (Post-Show)
              </div>
              <p className="text-xs text-slate-400">
                After a vigorous singing session, do gentle descending 5-tone sirens down into your lower register.
                This relaxes the cricothyroid and thyroarytenoid muscles back to their resting position.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 text-sm font-bold">
                <CheckCircle2 className="w-4 h-4" />
                Hydration & Mucosal Wave
              </div>
              <p className="text-xs text-slate-400">
                Vocal fold tissue requires systemic hydration. Drink ambient room-temperature water 2-3 hours
                before singing so water is absorbed into deep epithelial layers.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
