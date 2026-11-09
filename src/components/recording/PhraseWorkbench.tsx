import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Plus, Trash2, AudioLines } from 'lucide-react';
import type { RecordingProject } from '../../types/recording';
import { assemblePhrases, downloadBlob, safeFilename } from '../../utils/recordingAudio';
import { AudioPreview, recordingButton } from './RecordingCapture';

export function PhraseWorkbench({ project, disabled }: { project: RecordingProject; disabled: boolean }) {
  const [sequence, setSequence] = useState<string[]>([]);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const available = project.prompts.filter(prompt => project.recordings[prompt.id]);
  useEffect(() => {
    generation.current++;
    setAudio(null); setBusy(false);
  }, [project.recordings, sequence]);
  useEffect(() => () => { generation.current++; }, []);

  const render = async () => {
    setBusy(true); setError('');
    const token = ++generation.current;
    try {
      const clips = sequence.map(id => {
        if (!project.recordings[id]) throw new Error('One of these phrases no longer has a recording. Remove it and try again.');
        return project.recordings[id].audio;
      });
      const rendered = await assemblePhrases(clips);
      if (generation.current === token) setAudio(rendered);
    } catch (cause) {
      if (generation.current === token) setError(cause instanceof Error ? cause.message : 'Could not assemble this audio.');
    } finally {
      if (generation.current === token) setBusy(false);
    }
  };
  const move = (index: number, delta: number) => {
    const next = [...sequence];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setSequence(next);
  };

  return <section className="rounded-3xl bg-slate-900 border border-slate-800 p-5 sm:p-7 space-y-5">
    <div><h3 className="text-lg font-bold text-white flex items-center gap-2"><AudioLines className="text-amber-300" size={20} />Make something with your voice</h3>
      <p className="text-sm text-slate-400 mt-2">Choose your saved sentences, put them in order, and create a WAV. This plays your actual recordings with short pauses—it does not generate new words.</p></div>
    {!available.length ? <p className="p-6 text-center text-sm text-slate-400 border border-dashed border-slate-700 rounded-xl">Keep your first sentence to start building audio here.</p> : <>
      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {available.map(prompt => <button type="button" key={prompt.id} disabled={busy || disabled || sequence.length >= 20} onClick={() => setSequence([...sequence, prompt.id])} className="w-full flex items-center justify-between gap-3 text-left p-3 rounded-xl border border-slate-800 bg-slate-950 hover:border-amber-300/40 disabled:opacity-40 text-sm text-slate-300"><span>{prompt.text}</span><Plus size={16} className="shrink-0 text-amber-300" /><span className="sr-only">Add phrase</span></button>)}
      </div>
      <div className="border-t border-slate-800 pt-4 space-y-2">
        <h4 className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Your sequence · {sequence.length}/20 phrases</h4>
        {sequence.length === 0 && <p className="text-sm text-slate-500">Tap a sentence above to add it.</p>}
        <ol className="space-y-2">{sequence.map((id, index) => <li key={`${id}-${index}`} className="flex items-center gap-2 text-sm bg-slate-950 rounded-xl p-3">
          <span className="text-amber-300 font-mono">{index + 1}.</span><span className="flex-1 text-slate-300">{project.prompts.find(prompt => prompt.id === id)?.text}</span>
          <button type="button" aria-label={`Move phrase ${index + 1} up`} disabled={busy || index === 0} onClick={() => move(index, -1)} className="p-2 text-slate-400 hover:text-white disabled:opacity-25"><ArrowUp size={15} /></button>
          <button type="button" aria-label={`Move phrase ${index + 1} down`} disabled={busy || index === sequence.length - 1} onClick={() => move(index, 1)} className="p-2 text-slate-400 hover:text-white disabled:opacity-25"><ArrowDown size={15} /></button>
          <button type="button" aria-label={`Remove phrase ${index + 1}`} disabled={busy} onClick={() => setSequence(sequence.filter((_, i) => i !== index))} className="p-2 text-slate-400 hover:text-rose-300"><Trash2 size={15} /></button>
        </li>)}</ol>
      </div>
      <button type="button" disabled={busy || disabled || !sequence.length} onClick={() => void render()} className={`${recordingButton} bg-amber-300 text-slate-950 hover:bg-amber-200`}>{busy ? 'Assembling…' : 'Create audio'}</button>
    </>}
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    {audio && <div className="space-y-3 rounded-xl bg-emerald-950/20 border border-emerald-800/50 p-4"><AudioPreview audio={audio} /><button type="button" onClick={() => downloadBlob(audio, `${safeFilename(project.name)}-phrases.wav`)} className={`${recordingButton} bg-emerald-400 text-slate-950`}><Download size={16} />Download assembled WAV</button></div>}
  </section>;
}
