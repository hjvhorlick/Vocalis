import React, { useEffect, useRef, useState } from 'react';
import { PitchDetectionResult } from '../types/vocalis';
import { Play, Square, RotateCcw, Volume2, AudioWaveform, Sparkles, AlertCircle } from 'lucide-react';

interface LivePitchMonitorProps {
  isMicActive: boolean;
  onStartMic: () => void;
  pitchData: PitchDetectionResult;
  mediaStream: MediaStream | null;
  analyserNode: AnalyserNode | null;
}

export const LivePitchMonitor: React.FC<LivePitchMonitorProps> = ({
  isMicActive,
  onStartMic,
  pitchData,
  mediaStream,
  analyserNode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const oscCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  // Pitch history for scrolling piano roll
  const historyRef = useRef<{ time: number; midi: number; inTune: boolean; volume: number }[]>([]);

  // Push new pitch to history
  useEffect(() => {
    if (pitchData.frequency > 0 && pitchData.note) {
      const midiExact = 69 + 12 * Math.log2(pitchData.frequency / 440);
      historyRef.current.push({
        time: Date.now(),
        midi: midiExact,
        inTune: Math.abs(pitchData.cents) <= 10,
        volume: pitchData.volume,
      });

      // Keep only last 350 samples (~6 seconds of pitch)
      if (historyRef.current.length > 350) {
        historyRef.current.shift();
      }
    } else {
      // Add gap
      if (historyRef.current.length > 0 && historyRef.current[historyRef.current.length - 1].midi !== 0) {
        historyRef.current.push({
          time: Date.now(),
          midi: 0,
          inTune: false,
          volume: 0,
        });
      }
    }
  }, [pitchData]);

  // Canvas drawing loop for Scrolling Pitch Roll
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      // Dark background
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, width, height);

      // MIDI range to display: from C2 (36) to C6 (84) or dynamic centered around active note
      const minMidi = 40; // E2
      const maxMidi = 76; // E5
      const midiRange = maxMidi - minMidi;

      const midiToY = (m: number) => {
        return height - ((m - minMidi) / midiRange) * height;
      };

      // Draw grid lines for chromatic notes
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      for (let m = minMidi; m <= maxMidi; m++) {
        const y = midiToY(m);
        const noteIdx = ((m % 12) + 12) % 12;
        const octave = Math.floor(m / 12) - 1;
        const isC = noteIdx === 0;

        ctx.strokeStyle = isC ? 'rgba(99, 102, 241, 0.35)' : 'rgba(51, 65, 85, 0.2)';
        ctx.lineWidth = isC ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(40, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        // Note labels on the left gutter
        if (isC || noteIdx === 7 || noteIdx === 4 || noteIdx === 9) {
          ctx.fillStyle = isC ? '#a5b4fc' : '#64748b';
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.textAlign = 'right';
          ctx.fillText(`${noteNames[noteIdx]}${octave}`, 34, y + 3);
        }
      }

      // Draw pitch history path
      const history = historyRef.current;
      if (history.length > 1) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const stepX = (width - 60) / 320;
        const startX = width - history.length * stepX;

        // Path drawing
        for (let i = 1; i < history.length; i++) {
          const prev = history[i - 1];
          const curr = history[i];

          if (prev.midi > 0 && curr.midi > 0) {
            const x1 = startX + (i - 1) * stepX;
            const y1 = midiToY(prev.midi);
            const x2 = startX + i * stepX;
            const y2 = midiToY(curr.midi);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineWidth = 4;
            ctx.strokeStyle = curr.inTune ? '#10b981' : '#38bdf8';
            ctx.shadowColor = curr.inTune ? 'rgba(16, 185, 129, 0.6)' : 'rgba(56, 189, 248, 0.4)';
            ctx.shadowBlur = 8;
            ctx.stroke();
            ctx.shadowBlur = 0; // reset
          }
        }

        // Draw cursor bead on current note
        const last = history[history.length - 1];
        if (last && last.midi > 0) {
          const currentX = width - 12;
          const currentY = midiToY(last.midi);

          ctx.fillStyle = last.inTune ? '#34d399' : '#38bdf8';
          ctx.shadowColor = last.inTune ? '#10b981' : '#38bdf8';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(currentX, currentY, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  // Oscilloscope waveform loop
  useEffect(() => {
    const canvas = oscCanvasRef.current;
    if (!canvas || !analyserNode || !isMicActive) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserNode.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    let animId: number;

    const drawOsc = () => {
      analyserNode.getByteTimeDomainData(dataArray);

      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = pitchData.frequency > 0 ? '#818cf8' : '#334155';
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      animId = requestAnimationFrame(drawOsc);
    };

    drawOsc();
    return () => cancelAnimationFrame(animId);
  }, [analyserNode, isMicActive, pitchData.frequency]);

  // Audio Recording handlers
  const startRecording = () => {
    if (!mediaStream) return;
    try {
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(mediaStream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(url);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      recordTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
    }
  };

  const clearHistory = () => {
    historyRef.current = [];
  };

  // Tuning status variables
  const hasVoice = pitchData.frequency > 0 && pitchData.note !== null;
  const cents = pitchData.cents;
  const inTune = hasVoice && Math.abs(cents) <= 10;
  const isFlat = hasVoice && cents < -10;
  const isSharp = hasVoice && cents > 10;

  return (
    <div className="space-y-6">
      {/* Microphone status alert if inactive */}
      {!isMicActive && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-950/60 via-slate-900 to-indigo-950/60 border border-indigo-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Microphone is Offline</h3>
              <p className="text-xs text-slate-400">Click &quot;Start Mic&quot; to begin real-time vocal pitch tracking and tuner analysis.</p>
            </div>
          </div>
          <button
            onClick={onStartMic}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/30"
          >
            Enable Microphone
          </button>
        </div>
      )}

      {/* Main Dual Hero Grid: Precision Tuner Gauge + Live Scrolling Piano Roll */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Big Precision Needle Tuner Gauge */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between shadow-2xl">
          {/* Subtle Ambient Radial Glow */}
          <div
            className={`absolute -top-24 -left-24 w-64 h-64 rounded-full blur-3xl pointer-events-none transition-colors duration-300 ${
              inTune
                ? 'bg-emerald-500/20'
                : isFlat
                ? 'bg-cyan-500/20'
                : isSharp
                ? 'bg-amber-500/20'
                : 'bg-indigo-500/10'
            }`}
          />

          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Acoustic Pitch Tuner</h3>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                A4 = 440 Hz
              </span>
            </div>

            {/* Note Display Card */}
            <div className="py-8 text-center flex flex-col items-center justify-center">
              {hasVoice ? (
                <>
                  <div className="flex items-baseline justify-center gap-1">
                    <span
                      className={`text-7xl font-extrabold tracking-tight font-mono transition-colors duration-150 ${
                        inTune
                          ? 'text-emerald-400 drop-shadow-[0_0_25px_rgba(16,185,129,0.5)]'
                          : isFlat
                          ? 'text-cyan-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {pitchData.note?.name}
                    </span>
                    <span className="text-3xl font-bold text-slate-400 font-mono">
                      {pitchData.note?.octave}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <span className="text-sm font-mono text-slate-300 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                      {pitchData.frequency.toFixed(1)} Hz
                    </span>
                    <span
                      className={`text-sm font-mono font-semibold px-2.5 py-1 rounded-lg ${
                        inTune
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : isFlat
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {cents > 0 ? `+${cents}¢` : `${cents}¢`}
                    </span>
                  </div>

                  <p className="mt-2 text-xs font-medium tracking-wide uppercase">
                    {inTune && <span className="text-emerald-400">Perfect Pitch</span>}
                    {isFlat && <span className="text-cyan-400">Flat — raise your pitch</span>}
                    {isSharp && <span className="text-amber-400">Sharp — relax vocal fold tension</span>}
                  </p>
                </>
              ) : (
                <div className="py-6 text-slate-500 flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full border border-slate-800 flex items-center justify-center">
                    <AudioWaveform className="w-7 h-7 text-slate-600" />
                  </div>
                  <span className="text-sm font-medium">Sing or hum into the microphone</span>
                  <span className="text-xs text-slate-600">Vocal pitch & cents will appear instantly</span>
                </div>
              )}
            </div>

            {/* Cents Needle Gauge Bar */}
            <div className="space-y-2 mt-2">
              <div className="flex justify-between text-[11px] font-mono text-slate-400 px-1">
                <span>-50¢ (Flat)</span>
                <span className="text-emerald-400 font-bold">0¢ In Tune</span>
                <span>+50¢ (Sharp)</span>
              </div>

              {/* Gauge Track */}
              <div className="relative h-6 bg-slate-950 rounded-xl p-1 border border-slate-800 overflow-hidden flex items-center">
                {/* Center target zone */}
                <div className="absolute left-1/2 -translate-x-1/2 w-8 h-full bg-emerald-500/15 border-x border-emerald-500/30" />
                <div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-full bg-emerald-500 z-10" />

                {/* Needle Indicator */}
                {hasVoice && (
                  <div
                    className={`absolute top-0 bottom-0 w-2.5 rounded -translate-x-1/2 transition-all duration-75 shadow-md ${
                      inTune
                        ? 'bg-emerald-400 shadow-emerald-500/50'
                        : isFlat
                        ? 'bg-cyan-400 shadow-cyan-500/50'
                        : 'bg-amber-400 shadow-amber-500/50'
                    }`}
                    style={{
                      left: `${Math.min(97, Math.max(3, 50 + (cents / 50) * 45))}%`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-3 gap-2 mt-6 pt-4 border-t border-slate-800/80 text-center">
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Vibrato</span>
              <span className="text-sm font-mono font-bold text-white">
                {pitchData.vibratoRate ? `${pitchData.vibratoRate} Hz` : '—'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Clarity</span>
              <span className="text-sm font-mono font-bold text-white">
                {pitchData.clarity ? `${Math.round(pitchData.clarity * 100)}%` : '—'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Level</span>
              <span className="text-sm font-mono font-bold text-white">
                {pitchData.volumeDb > -75 ? `${Math.round(pitchData.volumeDb)} dB` : 'Quiet'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Live Scrolling Pitch Roll (Piano Roll Canvas) */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <AudioWaveform className="w-4 h-4 text-indigo-400" />
                Live Pitch Graph (Piano Roll)
              </h3>
              <p className="text-xs text-slate-400">Visualizes vocal pitch contour across musical notes in real time</p>
            </div>
            <button
              onClick={clearHistory}
              className="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Trace
            </button>
          </div>

          {/* Scrolling Canvas */}
          <div className="w-full relative h-[300px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800">
            <canvas
              ref={canvasRef}
              width={700}
              height={300}
              className="w-full h-full block"
            />
          </div>

          {/* Audio Waveform Oscilloscope & Recorder Controls */}
          <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-32 sm:w-44 h-10 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                <canvas ref={oscCanvasRef} width={180} height={40} className="w-full h-full" />
              </div>
              <div className="hidden sm:block">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Vocal Waveform</span>
                <span className="text-xs text-slate-300 font-mono">Real-time Oscilloscope</span>
              </div>
            </div>

            {/* Voice Recorder */}
            <div className="flex items-center gap-2">
              {isRecording ? (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold animate-pulse transition-colors"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  Stop Recording ({recordingSeconds}s)
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  disabled={!isMicActive}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors disabled:opacity-40"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  Record Vocal Take
                </button>
              )}

              {recordedAudioUrl && !isRecording && (
                <div className="flex items-center gap-2">
                  <audio src={recordedAudioUrl} controls className="h-8 max-w-[170px] sm:max-w-[210px]" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Vocal Training Tips Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 shrink-0">
            <Volume2 className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-200">Breath Support & Centering</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Engage lower abdominal support to eliminate pitch wobble and keep the needle rock-solid inside the green zone.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-200">Vocal Vibrato Health</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Natural relaxed singing vibrato oscillates comfortably between 4.8 Hz and 6.5 Hz with consistent gentle depth.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-200">Vocal Warm-up Prep</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Use the Scales & Exercises tab for structured warm-ups before pushing your extreme high or low range.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
