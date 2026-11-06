import React, { useState, useEffect } from 'react';
import { synth, midiToFrequency } from '../utils/audioPitch';
import { Volume2, VolumeX, Sparkles, Disc } from 'lucide-react';

export const PitchPipeKeyboard: React.FC = () => {
  const [activeNoteMidi, setActiveNoteMidi] = useState<number | null>(null);
  const [isDroneActive, setIsDroneActive] = useState(false);
  const [droneRootMidi, setDroneRootMidi] = useState(57); // A3 (220 Hz)
  const [instrumentType, setInstrumentType] = useState<'piano' | 'synth'>('piano');

  const pitchPipeNotes = [
    { name: 'C', fullName: 'C4', midi: 60 },
    { name: 'C#', fullName: 'C#4', midi: 61 },
    { name: 'D', fullName: 'D4', midi: 62 },
    { name: 'D#', fullName: 'D#4', midi: 63 },
    { name: 'E', fullName: 'E4', midi: 64 },
    { name: 'F', fullName: 'F4', midi: 65 },
    { name: 'F#', fullName: 'F#4', midi: 66 },
    { name: 'G', fullName: 'G4', midi: 67 },
    { name: 'G#', fullName: 'G#4', midi: 68 },
    { name: 'A', fullName: 'A4', midi: 69 },
    { name: 'A#', fullName: 'A#4', midi: 70 },
    { name: 'B', fullName: 'B4', midi: 71 },
  ];

  // Piano keys from C3 (48) to C6 (84)
  const pianoKeys: { midi: number; name: string; isBlack: boolean; label: string }[] = [];
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  for (let m = 48; m <= 84; m++) {
    const noteIdx = ((m % 12) + 12) % 12;
    const isBlack = [1, 3, 6, 8, 10].includes(noteIdx);
    const octave = Math.floor(m / 12) - 1;
    pianoKeys.push({
      midi: m,
      name: noteNames[noteIdx],
      isBlack,
      label: `${noteNames[noteIdx]}${octave}`,
    });
  }

  const playNote = (midi: number) => {
    setActiveNoteMidi(midi);
    const freq = midiToFrequency(midi);
    synth.playTone(freq, 1.2, instrumentType);
    setTimeout(() => {
      setActiveNoteMidi((prev) => (prev === midi ? null : prev));
    }, 400);
  };

  // Drone runner
  useEffect(() => {
    let intervalId: number | null = null;
    if (isDroneActive) {
      const rootFreq = midiToFrequency(droneRootMidi);
      const fifthFreq = midiToFrequency(droneRootMidi + 7); // perfect fifth

      const playDronePulse = () => {
        synth.playTone(rootFreq, 2.5, 'synth');
        synth.playTone(fifthFreq, 2.5, 'synth');
      };

      playDronePulse();
      intervalId = window.setInterval(playDronePulse, 2300);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isDroneActive, droneRootMidi]);

  return (
    <div className="space-y-6">
      {/* Chromatic Master Pitch Pipe Circle */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Disc className="w-4 h-4 text-cyan-400" />
              Master Vocal Pitch Pipe
            </h3>
            <p className="text-xs text-slate-400">
              Standard 12-pitch reference disc for a cappella singers, choirs, and soloists
            </p>
          </div>
          <div className="flex items-center gap-2 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setInstrumentType('piano')}
              className={`px-2 py-1 rounded-lg font-medium transition-colors ${
                instrumentType === 'piano' ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              Piano
            </button>
            <button
              onClick={() => setInstrumentType('synth')}
              className={`px-2 py-1 rounded-lg font-medium transition-colors ${
                instrumentType === 'synth' ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              Tone
            </button>
          </div>
        </div>

        {/* 12 Pipe buttons grid */}
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-2 pt-2">
          {pitchPipeNotes.map((note) => {
            const freq = midiToFrequency(note.midi);
            const isPlaying = activeNoteMidi === note.midi;
            return (
              <button
                key={note.fullName}
                onClick={() => playNote(note.midi)}
                className={`py-3 px-2 rounded-2xl border text-center transition-all ${
                  isPlaying
                    ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/40 scale-105'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-200'
                }`}
              >
                <span className="font-mono text-base font-extrabold block">{note.name}</span>
                <span className="text-[10px] text-slate-400 block font-mono">{freq.toFixed(0)} Hz</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Harmonic Drone Generator */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            Harmonic Fifth Drone Generator
          </h4>
          <p className="text-xs text-slate-400">
            Plays continuous sustained Root + Perfect 5th chord for modal pitch centering and ear training
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={droneRootMidi}
            onChange={(e) => setDroneRootMidi(parseInt(e.target.value))}
            className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-xl px-3 py-2"
          >
            <option value={48}>C3 (130.8 Hz)</option>
            <option value={50}>D3 (146.8 Hz)</option>
            <option value={52}>E3 (164.8 Hz)</option>
            <option value={53}>F3 (174.6 Hz)</option>
            <option value={55}>G3 (196.0 Hz)</option>
            <option value={57}>A3 (220.0 Hz)</option>
            <option value={59}>B3 (246.9 Hz)</option>
            <option value={60}>C4 (261.6 Hz)</option>
          </select>

          <button
            onClick={() => setIsDroneActive(!isDroneActive)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              isDroneActive
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-md'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md'
            }`}
          >
            {isDroneActive ? (
              <>
                <VolumeX className="w-4 h-4" /> Stop Drone
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4" /> Start Drone
              </>
            )}
          </button>
        </div>
      </div>

      {/* Interactive 3-Octave Virtual Piano Roll Keyboard */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">Full 3-Octave Keyboard (C3 - C6)</h4>
          <span className="text-xs text-slate-500">Click or tap keys to play tone</span>
        </div>

        {/* Responsive Piano Roll */}
        <div className="overflow-x-auto pb-2">
          <div className="relative h-44 min-w-[700px] flex select-none bg-slate-950 p-2 rounded-2xl border border-slate-800">
            {pianoKeys
              .filter((k) => !k.isBlack)
              .map((whiteKey) => {
                const isPlaying = activeNoteMidi === whiteKey.midi;
                return (
                  <div
                    key={whiteKey.midi}
                    onClick={() => playNote(whiteKey.midi)}
                    className={`flex-1 h-full mx-0.5 rounded-b-lg border border-slate-300 flex flex-col justify-end items-center pb-2 cursor-pointer transition-colors ${
                      isPlaying
                        ? 'bg-indigo-300 border-indigo-400 shadow-inner'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span className="font-mono text-[10px] font-bold text-slate-800">
                      {whiteKey.label}
                    </span>
                  </div>
                );
              })}

            {/* Black keys overlay */}
            <div className="absolute inset-x-2 top-2 h-28 pointer-events-none flex">
              {pianoKeys
                .filter((k) => !k.isBlack)
                .map((whiteKey, idx) => {
                  // Check if next key in full sequence is black
                  const fullIdx = pianoKeys.findIndex((k) => k.midi === whiteKey.midi);
                  const nextKey = pianoKeys[fullIdx + 1];
                  const hasBlackAfter = nextKey && nextKey.isBlack;

                  return (
                    <div key={whiteKey.midi} className="flex-1 relative">
                      {hasBlackAfter && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            playNote(nextKey.midi);
                          }}
                          className={`pointer-events-auto absolute -right-3 top-0 w-6 h-full rounded-b-md cursor-pointer z-10 transition-colors ${
                            activeNoteMidi === nextKey.midi
                              ? 'bg-indigo-500 border border-indigo-300'
                              : 'bg-slate-900 border border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          <span className="text-[8px] font-mono text-slate-400 absolute bottom-1.5 inset-x-0 text-center">
                            {nextKey.name}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
