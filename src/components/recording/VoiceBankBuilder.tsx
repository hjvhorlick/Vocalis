import React, { useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, Hammer, Library, Play, Plus } from 'lucide-react';
import type { RecordingProject } from '../../types/recording';
import type { VoiceBank, VoiceRender } from '../../types/voiceBank';
import { bankCoverage, buildVoiceBank, renderVoiceBank } from '../../utils/voiceBankEngine';
import { exportVoiceBank, importVoiceBank } from '../../utils/voiceBankArchive';
import { downloadBlob, safeFilename } from '../../utils/recordingAudio';
import { parsePhones, PHONE_EXAMPLES } from '../../utils/voicePhonetics';
import { AudioPreview, recordingButton } from './RecordingCapture';

interface Props {
  project: RecordingProject;
  disabled: boolean;
  onSave: (project: RecordingProject) => Promise<void>;
  onInstall: (bank: VoiceBank) => Promise<void>;
  onAddPrompt: (text: string) => void;
  onPendingChange: (pending: boolean) => void;
}
const input = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white';

export function VoiceBankBuilder({ project, disabled, onSave, onInstall, onAddPrompt, onPendingChange }: Props) {
  const [bank, setBank] = useState<VoiceBank | null>(null);
  const [builtFrom, setBuiltFrom] = useState<string | null>(null);
  const [text, setText] = useState('Hello.');
  const [result, setResult] = useState<VoiceRender | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [permission, setPermission] = useState(false);
  const [word, setWord] = useState('');
  const [phones, setPhones] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  useEffect(() => { onPendingChange(busy); return () => onPendingChange(false); }, [busy, onPendingChange]);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    if (builtFrom && builtFrom !== project.updatedAt) { setBank(null); setResult(null); setNotice('Project changed. Rebuild the bank to use the latest recordings and pronunciation entries.'); }
  }, [project.updatedAt, builtFrom]);
  const coverage = bank && bankCoverage(bank);
  const reviewed = Object.values(project.recordings).filter(recording => recording.alignment?.reviewed).length;
  const execute = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'This operation failed.'); }
    finally { setBusy(false); }
  };

  return <section className="space-y-5">
    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-7 space-y-4">
      <h2 className="text-xl text-white font-bold">Build a voice that can say new words</h2>
      <p className="text-sm text-slate-400">Vocalis extracts one-, two- and three-sound units from reviewed labels, keeps several candidates, and selects a matching sequence for your text. This experimental concatenative engine may sound choppy. It has no neural model and never borrows a missing sound from another speaker.</p>
      <p className="text-sm text-amber-200">{reviewed} recording{reviewed === 1 ? '' : 's'} with reviewed sound labels</p>
      <div className="flex flex-wrap gap-3"><button type="button" disabled={disabled || busy || !reviewed} onClick={() => void execute(async () => { const built = await buildVoiceBank(project); setBank(built); setBuiltFrom(project.updatedAt); setPermission(true); setText(built.exampleText || 'Hello.'); setResult(null); setNotice('Sound bank built. Test it on new sentences before relying on it.'); })} className={`${recordingButton} bg-amber-300 text-slate-950`}><Hammer size={16} />Build sound bank</button>
        <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className={`${recordingButton} bg-slate-800 text-white`}><FolderOpen size={16} />Open sound bank (.vvoice)</button>
        <input type="file" ref={fileInput} className="hidden" accept=".vvoice,application/json" aria-label="Import sound bank" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void execute(async () => { const loaded = await importVoiceBank(file); setBank(loaded); setBuiltFrom(null); setPermission(false); setResult(null); setText(loaded.exampleText || 'Hello.'); setNotice('Sound bank opened. Confirm your permission to use it before testing or installing.'); }); }} />
      </div>
      <p className="text-xs text-slate-500">The voice stays experimental even with all 39 English sound labels present. This is inventory coverage, not a listening-quality score or complete diphone coverage.</p>
    </div>
    {busy && <p role="status" className="text-sm text-amber-200">Working locally…</p>}
    {error && <p role="alert" className="p-4 rounded-xl border border-rose-800 text-sm text-rose-300 bg-rose-950/20">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
    {bank && coverage && <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-7 space-y-5">
      <div><h3 className="font-bold text-white text-lg">{bank.name}</h3><p className="text-xs text-slate-400 mt-1">{bank.language} · {bank.accent || 'Accent not specified'} · {coverage.units} units · {coverage.present.length}/39 sound labels · {(bank.audio.size / 1024 / 1024).toFixed(1)} MiB</p></div>
      <label className="flex items-start gap-3 text-sm text-slate-300"><input type="checkbox" checked={permission} onChange={event => setPermission(event.target.checked)} className="accent-amber-300 mt-1" />I have permission to use and, if needed, redistribute this voice bank. Importing a file is not proof of permission.</label>
      <div><h4 className="text-xs uppercase tracking-wider text-slate-400 mb-2">Missing sounds</h4><div className="flex flex-wrap gap-1.5">{coverage.missing.length ? coverage.missing.map(phone => <button type="button" key={phone} disabled={busy || disabled} title={`Add a recording prompt for ${phone}`} onClick={() => onAddPrompt(`Please say the word ${PHONE_EXAMPLES[phone]} again.`)} className="rounded-lg border border-amber-300/30 text-amber-200 bg-amber-300/5 px-2.5 py-1.5 text-xs">{phone} · {PHONE_EXAMPLES[phone]} +</button>) : <p className="text-sm text-emerald-300">Every English sound label has at least one candidate. Now test clarity and transitions.</p>}</div><p className="text-xs text-slate-500 mt-2">Tap a missing sound to add a reading prompt. Record it, mark its sounds, then rebuild.</p></div>
      <label className="block space-y-2 text-sm text-slate-300">Test new text<textarea aria-label="Sound bank test text" value={text} maxLength={1000} rows={3} disabled={busy} onChange={event => { setText(event.target.value); setResult(null); }} className={input} /></label>
      <p className="text-xs text-slate-500">English only in this version. Spell out numbers. Unknown words need a pronunciation entry. Pitch, stress and expressive prosody are not reconstructed.</p>
      <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || !permission || !text.trim()} onClick={() => void execute(async () => { setResult(null); const token = generation.current; const rendered = await renderVoiceBank(text, bank); if (token === generation.current) setResult(rendered); })} className={`${recordingButton} bg-amber-300 text-slate-950`}><Play size={16} />Generate test speech</button><button type="button" disabled={busy || !permission} onClick={() => void execute(async () => { await onInstall(bank); setNotice('Voice added to the library. Select it in Voice Hub, Voice Creator or Dialogue. Keep an exported backup too.'); })} className={`${recordingButton} bg-slate-800 text-white`}><Library size={16} />Add to voice library</button><button type="button" disabled={busy || !permission} onClick={() => void execute(async () => { downloadBlob(await exportVoiceBank(bank), `${safeFilename(bank.name)}-sound-bank.vvoice`); setNotice('Sound bank exported with its audio, unit index, pronunciation entries and notices.'); })} className={`${recordingButton} bg-slate-800 text-white`}><Download size={16} />Export sound bank</button></div>
      {result && <div className="rounded-xl bg-slate-950 p-4 space-y-3"><AudioPreview audio={result.audio} /><p className="text-xs text-slate-400">{result.duration.toFixed(2)} seconds · {result.selectedUnits} units selected · from this speaker only</p><button type="button" onClick={() => downloadBlob(result.audio, `${safeFilename(bank.name)}-test.wav`)} className={`${recordingButton} text-emerald-300`}><Download size={16} />Download test WAV</button></div>}
      <details className="text-xs text-slate-400"><summary className="cursor-pointer">Source and rights notices</summary>{bank.notices.map((notice, index) => <pre key={index} className="whitespace-pre-wrap mt-3 max-h-48 overflow-y-auto">{notice}</pre>)}</details>
    </div>}
    <form onSubmit={event => { event.preventDefault(); void execute(async () => { const key = word.trim().toLowerCase(); if (!/^[a-z]+(?:'[a-z]+)*$/.test(key) || key.length > 80) throw new Error('Enter one English word without spaces or numbers.'); const parsed = parsePhones(phones); if (parsed.length > 60) throw new Error('Use at most 60 sounds for a word.'); const pronunciations = { ...project.pronunciations, [key]: parsed }; if (Object.keys(pronunciations).length > 500) throw new Error('This project already has 500 pronunciation entries.'); await onSave({ ...project, pronunciations }); setWord(''); setPhones(''); setNotice('Pronunciation saved to this project. Rebuild the bank to include it.'); }); }} className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-3">
      <h3 className="font-semibold text-white">Pronunciation corrections</h3><p className="text-xs text-slate-400">Add words the bundled dictionary does not know, or correct their sounds. These entries travel with the project and new banks built from it, not with an unrelated imported bank.</p>
      <div className="grid sm:grid-cols-2 gap-3"><label className="text-xs text-slate-400">Word<input aria-label="Pronunciation word" value={word} disabled={busy || disabled} maxLength={80} onChange={event => setWord(event.target.value)} placeholder="hello" className={input} /></label><label className="text-xs text-slate-400">Sound labels<input aria-label="Pronunciation sounds" value={phones} disabled={busy || disabled} maxLength={300} onChange={event => setPhones(event.target.value)} placeholder="HH EH L OW" className={input} /></label></div>
      <button type="submit" disabled={busy || disabled || !word.trim() || !phones.trim()} className={`${recordingButton} bg-slate-800 text-white`}><Plus size={16} />Save pronunciation</button>
      {Object.entries(project.pronunciations || {}).map(([key, value]) => <div key={key} className="flex items-center justify-between gap-3 text-xs text-slate-400"><span>{key}: {value.join(' ')}</span><button type="button" disabled={busy || disabled} onClick={() => void execute(async () => { const pronunciations = { ...project.pronunciations }; delete pronunciations[key]; await onSave({ ...project, pronunciations }); })} className="text-rose-300">Remove</button></div>)}
    </form>
  </section>;
}
