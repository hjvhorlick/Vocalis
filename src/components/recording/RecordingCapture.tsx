import React, { useEffect, useState, useRef } from 'react';
import { Check, Mic, RotateCcw, Square, Download } from 'lucide-react';
import { useSentenceRecorder, RecordingDraft } from '../../hooks/useSentenceRecorder';
import { downloadBlob } from '../../utils/recordingAudio';
import { stopSpeaking } from '../../utils/naturalVoiceEngine';

export function AudioPreview({ audio }: { audio: Blob }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(audio);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [audio]);
  return url ? <audio controls preload="metadata" onPlay={event => {
    stopSpeaking();
    document.querySelectorAll('audio').forEach(audio => { if (audio !== event.currentTarget) audio.pause(); });
  }} src={url} className="w-full h-10" /> : null;
}

export const recordingButton = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300';

interface Props {
  test?: boolean;
  disabled: boolean;
  onKeep: (draft: RecordingDraft) => Promise<boolean>;
  onPendingChange: (pending: boolean) => void;
  onTested?: () => void;
}

export function RecordingCapture({ test = false, disabled, onKeep, onPendingChange, onTested }: Props) {
  const recorder = useSentenceRecorder();
  const fileInput = useRef<HTMLInputElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  const busy = ['requesting', 'recording', 'processing'].includes(recorder.phase);
  const pending = busy || !!recorder.draft;
  useEffect(() => { onPendingChange(pending); return () => onPendingChange(false); }, [pending, onPendingChange]);
  const reset = () => { recorder.cancel(); setConfirmed(false); };

  return (
    <div className="space-y-4">
      {recorder.error && <p role="alert" className="text-sm text-rose-300 bg-rose-950/30 border border-rose-900 p-3 rounded-xl">{recorder.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {!busy && !recorder.draft && <button type="button" disabled={disabled} onClick={() => { setConfirmed(false); stopSpeaking(); document.querySelectorAll('audio').forEach(audio => audio.pause()); void recorder.start(); }} className={`${recordingButton} bg-amber-300 text-slate-950 hover:bg-amber-200`}><Mic size={17} />{test ? 'Record mic test' : 'Record sentence'}</button>}
        {!test && !busy && !recorder.draft && <><input ref={fileInput} type="file" accept="audio/*" aria-label="Upload sentence audio" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) { setConfirmed(false); void recorder.loadAudio(file); } }} /><button type="button" disabled={disabled} onClick={() => fileInput.current?.click()} className={`${recordingButton} bg-slate-800 text-white`}>Upload a take</button></>}
        {recorder.phase === 'recording' && <button type="button" onClick={recorder.stop} className={`${recordingButton} bg-rose-600 text-white hover:bg-rose-500`}><Square size={16} fill="currentColor" />Stop recording</button>}
        {recorder.phase === 'requesting' && <><span role="status" className="text-sm text-amber-200">Waiting for microphone permission…</span><button type="button" onClick={reset} className={`${recordingButton} bg-slate-800 text-white`}>Cancel</button></>}
        {recorder.phase === 'processing' && <span role="status" className="text-sm text-amber-200">Preparing your WAV recording…</span>}
        {recorder.phase === 'recording' && <span className="text-sm text-rose-300 font-mono tabular-nums" role="timer">{recorder.seconds.toFixed(1)} / 30s</span>}
      </div>
      {recorder.phase === 'recording' && <div className="space-y-1">
        <div role="meter" aria-label="Microphone peak level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(recorder.level * 100)} className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full transition-[width] duration-75 ${recorder.level > 0.95 ? 'bg-rose-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min(100, recorder.level * 100)}%` }} />
        </div>
        <p className="text-xs text-slate-400">Speak naturally. Stay at the same distance from your microphone. Stops automatically after 30 seconds.</p>
      </div>}
      {recorder.draft && <div className="space-y-4 rounded-2xl bg-slate-950/80 border border-slate-700 p-4">
        <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold text-white">Listen before keeping</h4><span className="text-xs text-slate-400">{recorder.draft.quality.duration.toFixed(1)} seconds · mono WAV</span></div>
        <AudioPreview audio={recorder.draft.audio} />
        {recorder.draft.quality.warnings.length > 0 ? <ul className="text-sm text-amber-200 list-disc pl-5 space-y-1">{recorder.draft.quality.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : <p className="text-xs text-emerald-300">Basic level check passed. Please listen for noise, mistakes and missing words.</p>}
        <p className="text-xs text-slate-500">Level checks do not verify the words or certify recording quality. No speech recognition or AI is used.</p>
        {!test && <label className="flex items-start gap-2 text-sm text-slate-300 cursor-pointer"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 accent-amber-300" />I read the displayed sentence correctly and have listened to this take.</label>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={disabled || !recorder.draft.quality.usable || (!test && !confirmed)} onClick={async () => {
            if (!recorder.draft) return;
            if (test) { reset(); onTested?.(); }
            else if (await onKeep(recorder.draft)) reset();
          }} className={`${recordingButton} bg-emerald-400 text-slate-950 hover:bg-emerald-300`}><Check size={16} />{test ? 'Microphone sounds good' : 'Keep & next'}</button>
          <button type="button" disabled={disabled} onClick={reset} className={`${recordingButton} bg-slate-800 text-slate-200 hover:bg-slate-700`}><RotateCcw size={16} />Discard & retry</button>
          <button type="button" onClick={() => recorder.draft && downloadBlob(recorder.draft.audio, test ? 'microphone-test.wav' : 'sentence-take.wav')} className={`${recordingButton} text-slate-400 hover:text-white`}><Download size={16} />Save WAV</button>
        </div>
      </div>}
      {!busy && !recorder.draft && <p className="text-xs text-slate-500">Your microphone is off. Audio stays on this device; nothing is uploaded.</p>}
    </div>
  );
}
