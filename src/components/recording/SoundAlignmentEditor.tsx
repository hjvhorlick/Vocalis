import React, { useEffect, useMemo, useState } from 'react';
import type { RecordingProject } from '../../types/recording';
import type { SoundAlignment, SoundSegment } from '../../types/voiceBank';
import { decodeProjectWav, encodeMonoWav, RECORDING_SAMPLE_RATE } from '../../utils/recordingAudio';
import { parsePhones, PHONE_EXAMPLES, PHONES, pronounceText } from '../../utils/voicePhonetics';
import { seedAlignment, validateAlignment } from '../../utils/voiceBankEngine';
import { AudioPreview, recordingButton } from './RecordingCapture';

const input = 'w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white disabled:opacity-40';
interface Props { project: RecordingProject; disabled: boolean; onSave: (project: RecordingProject) => Promise<void>; onPendingChange: (pending: boolean) => void }

export function SoundAlignmentEditor({ project, disabled, onSave, onPendingChange }: Props) {
  const available = project.prompts.filter(prompt => project.recordings[prompt.id]);
  const [promptId, setPromptId] = useState(available[0]?.id || '');
  const prompt = available.find(item => item.id === promptId) || available[0];
  const recording = prompt && project.recordings[prompt.id];
  const [alignment, setAlignment] = useState<SoundAlignment>({ segments: [], reviewed: false });
  const [phoneText, setPhoneText] = useState('');
  const [samples, setSamples] = useState<Float32Array | null>(null);
  const [selected, setSelected] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const segment = alignment.segments[selected];
  useEffect(() => { onPendingChange(dirty || busy); return () => onPendingChange(false); }, [dirty, busy, onPendingChange]);
  useEffect(() => {
    let cancelled = false;
    setSamples(null); setError(''); setSelected(0); setDirty(false);
    const initial = recording?.alignment || { segments: [], reviewed: false };
    setAlignment(initial); setPhoneText(initial.segments.map(item => item.phone).join(' '));
    if (recording) recording.audio.arrayBuffer().then(decodeProjectWav).then(audio => { if (!cancelled) setSamples(audio); }).catch(() => { if (!cancelled) setError('Could not read this recording.'); });
    return () => { cancelled = true; };
  }, [recording]);
  const duration = samples ? samples.length / RECORDING_SAMPLE_RATE : 0;
  const waveform = useMemo(() => {
    if (!samples) return '';
    return Array.from({ length: 800 }, (_, i) => {
      const start = Math.floor(i * samples.length / 800), end = Math.floor((i + 1) * samples.length / 800);
      let peak = 0;
      for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(samples[j]));
      return `${i * 1000 / 800},${60 - peak * 55} ${i * 1000 / 800},${60 + peak * 55}`;
    }).join(' ');
  }, [samples]);
  const preview = useMemo(() => {
    if (!samples || !segment || segment.end <= segment.start || segment.start < 0 || segment.end > duration) return null;
    return encodeMonoWav(samples.slice(Math.round(segment.start * RECORDING_SAMPLE_RATE), Math.round(segment.end * RECORDING_SAMPLE_RATE)));
  }, [samples, segment, duration]);
  const edit = (changes: Partial<SoundSegment>) => {
    const segments = alignment.segments.map(item => ({ ...item }));
    if (!segments[selected]) return;
    // Shared boundaries move together. Gaps remain editable by changing both fields.
    if (changes.start !== undefined && selected > 0 && Math.abs(segments[selected - 1].end - segment.start) < 0.001) segments[selected - 1].end = changes.start;
    if (changes.end !== undefined && selected + 1 < segments.length && Math.abs(segments[selected + 1].start - segment.end) < 0.001) segments[selected + 1].start = changes.end;
    segments[selected] = { ...segments[selected], ...changes };
    setPhoneText(segments.map(item => item.phone).join(' '));
    setAlignment({ reviewed: false, segments }); setDirty(true); setError('');
  };
  const seed = (phones: string[]) => { setAlignment(seedAlignment(phones, duration)); setPhoneText(phones.join(' ')); setSelected(0); setDirty(true); };

  if (!recording || !prompt) return <section className="p-8 rounded-2xl border border-slate-800 text-slate-400">Keep at least one recording in Read & record, then mark its sounds here.</section>;
  return <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-7 space-y-5">
    <div><h2 className="text-xl text-white font-bold">Mark the sounds in your recording</h2><p className="text-sm text-slate-400 mt-2">This is the hands-on step. Listen, adjust each boundary, then confirm the labels. Suggested spacing is only a starting grid—not automatic alignment. Accurate labels matter more than the number of takes.</p></div>
    <label className="block text-sm text-slate-300 space-y-2">Recorded sentence<select className={input} disabled={dirty || busy || disabled} value={prompt.id} onChange={event => setPromptId(event.target.value)}>{available.map(item => <option key={item.id} value={item.id}>{project.recordings[item.id].alignment?.reviewed ? '✓ ' : ''}{item.text}</option>)}</select></label>
    <AudioPreview audio={recording.audio} />
    <div className="flex flex-wrap gap-2"><button type="button" disabled={!samples || busy || disabled} className={`${recordingButton} bg-slate-800 text-white`} onClick={async () => {
      if (dirty && !window.confirm('Replace the unsaved labels with a new starting grid?')) return;
      setBusy(true); setError('');
      try { const plan = await pronounceText(prompt.text, project.pronunciations); if (plan.unknown.length) throw new Error(`Unknown words: ${plan.unknown.join(', ')}. Enter the sounds manually below, or add a pronunciation under Build & test.`); const phones = plan.words.flatMap(word => word.phones); if (phones.length > 300) throw new Error('Use a shorter recording (at most 300 sounds).'); seed(phones); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not suggest sounds.'); } finally { setBusy(false); }
    }}>{busy ? 'Looking up words…' : 'Suggest sounds from transcript'}</button></div>
    <details className="text-sm text-slate-400"><summary className="cursor-pointer">Edit sound sequence manually / pronunciation guide</summary><div className="mt-3 space-y-3"><p>Use English ARPABET labels. SIL marks silence. This version ignores stress digits and does not infer accent-specific sounds.</p><textarea aria-label="Manual phoneme sequence" value={phoneText} onChange={event => { setPhoneText(event.target.value); setDirty(true); }} disabled={busy || disabled} rows={3} maxLength={1500} className={input} /><button type="button" className={`${recordingButton} bg-slate-800 text-white`} disabled={!samples || busy || disabled} onClick={() => { try { seed(parsePhones(phoneText, true)); setError(''); } catch (cause) { setError((cause as Error).message); } }}>Create starting grid from labels</button><p className="text-xs leading-loose">{PHONES.map(phone => `${phone} = ${PHONE_EXAMPLES[phone]}`).join(' · ')} · SIL = silence</p></div></details>
    {samples && <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden"><svg viewBox="0 0 1000 120" className="w-full h-32" role="img" aria-label="Recording waveform with selected sound highlighted"><polyline points={waveform} fill="none" stroke="#64748b" strokeWidth="1" />{segment && <rect x={segment.start / duration * 1000} width={Math.max(0, (segment.end - segment.start) / duration * 1000)} y="0" height="120" fill="#fcd34d" opacity="0.24" />}</svg><p className="px-3 pb-2 text-xs text-slate-500">0 seconds → {duration.toFixed(2)} seconds · Selected range in gold</p></div>}
    <div className="flex flex-wrap gap-1 max-h-44 overflow-y-auto">{alignment.segments.map((item, index) => <button type="button" key={index} disabled={disabled || busy} onClick={() => setSelected(index)} className={`px-2.5 py-2 rounded-lg text-xs font-mono border ${index === selected ? 'text-amber-200 border-amber-300/60 bg-amber-300/10' : 'text-slate-400 border-slate-700'}`} aria-label={`Sound ${index + 1}: ${item.phone}`}>{item.phone}</button>)}</div>
    {segment && <div className="rounded-2xl bg-slate-950 p-4 space-y-4">
      <div className="flex flex-wrap gap-3 items-center"><span className="text-sm text-amber-200">Sound {selected + 1} / {alignment.segments.length}</span><label className="text-xs text-slate-400">Label<select aria-label="Selected sound label" value={segment.phone} disabled={disabled} onChange={event => edit({ phone: event.target.value })} className={`${input} mt-1`}>{[...PHONES, 'SIL'].map(phone => <option key={phone} value={phone}>{phone} · {PHONE_EXAMPLES[phone] || 'silence'}</option>)}</select></label></div>
      <div className="grid sm:grid-cols-2 gap-4">{(['start', 'end'] as const).map(boundary => <div key={boundary} className="space-y-2"><label className="text-xs text-slate-400 capitalize">{boundary} seconds<input aria-label={`${boundary} seconds`} type="number" step="0.005" min={0} max={duration} value={Number(segment[boundary].toFixed(4))} disabled={disabled} onChange={event => edit({ [boundary]: Number(event.target.value) })} className={input} /></label><input aria-label={`${boundary} boundary slider`} type="range" min={0} max={duration} step="0.005" value={segment[boundary]} disabled={disabled} onChange={event => edit({ [boundary]: Number(event.target.value) })} className="w-full accent-amber-300" /></div>)}</div>
      {preview && <><p className="text-xs text-slate-400">Listen to just this range. Use the full recording above to hear its context.</p><AudioPreview audio={preview} /></>}
      <div className="flex justify-between"><button type="button" disabled={!selected || disabled} onClick={() => setSelected(selected - 1)} className={`${recordingButton} text-slate-300`}>Previous sound</button><button type="button" disabled={selected >= alignment.segments.length - 1 || disabled} onClick={() => setSelected(selected + 1)} className={`${recordingButton} text-slate-300`}>Next sound</button></div>
    </div>}
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    {!!alignment.segments.length && <label className="flex gap-3 text-sm text-slate-300"><input type="checkbox" disabled={disabled || busy} checked={alignment.reviewed} onChange={event => { setAlignment({ ...alignment, reviewed: event.target.checked }); setDirty(true); }} className="accent-amber-300 mt-1" />I listened to every sound range and checked its label and boundaries. Include this recording when building my voice.</label>}
    <div className="flex flex-wrap gap-2"><button type="button" disabled={!dirty || !alignment.segments.length || disabled || busy} className={`${recordingButton} bg-amber-300 text-slate-950`} onClick={async () => {
      try { if (parsePhones(phoneText, true).join(' ') !== alignment.segments.map(item => item.phone).join(' ')) throw new Error('Apply your edited sequence using Create starting grid from labels before saving.'); const checked = validateAlignment(alignment, duration); setError(''); await onSave({ ...project, recordings: { ...project.recordings, [prompt.id]: { ...recording, alignment: checked } } }); setDirty(false); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save labels.'); }
    }}>Save sound labels</button><button type="button" disabled={!dirty || disabled || busy} onClick={() => { const original = recording.alignment || { segments: [], reviewed: false }; setAlignment(original); setPhoneText(original.segments.map(item => item.phone).join(' ')); setSelected(0); setDirty(false); setError(''); }} className={`${recordingButton} text-slate-400`}>Discard edits</button></div>
    <p className="text-xs text-slate-500">Replacing a recording removes its old labels. Only saved, reviewed labels are used in a bank. Save or discard edits before changing sections.</p>
  </section>;
}
