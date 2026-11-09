import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Download, FolderOpen, Mic, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { RecordingProject } from '../../types/recording';
import type { RecordingDraft } from '../../hooks/useSentenceRecorder';
import { createRecordingProject } from '../../utils/recordingPrompts';
import { deleteRecordingProject, listRecordingProjects, saveRecordingProject } from '../../utils/recordingStorage';
import { exportRecordingArchive, importRecordingArchive, MAX_PROMPTS } from '../../utils/recordingArchive';
import { downloadBlob, safeFilename } from '../../utils/recordingAudio';
import { AudioPreview, RecordingCapture, recordingButton } from './RecordingCapture';
import { PhraseWorkbench } from './PhraseWorkbench';
import { SoundAlignmentEditor } from './SoundAlignmentEditor';
import { VoiceBankBuilder } from './VoiceBankBuilder';
import type { VoiceBank } from '../../types/voiceBank';

const field = 'w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-300/60';

interface Props { active: boolean; onPendingChange: (pending: boolean) => void; onInstall: (bank: VoiceBank) => Promise<void> }

export function RecordingStudio({ active, onPendingChange, onInstall }: Props) {
  const [project, setProject] = useState<RecordingProject | null>(null);
  const [projects, setProjects] = useState<RecordingProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [capturePending, setCapturePending] = useState(false);
  const [selected, setSelected] = useState(0);
  const [view, setView] = useState<'record' | 'use' | 'align' | 'build'>('record');
  const [micTest, setMicTest] = useState(false);
  const [micTested, setMicTested] = useState(false);
  const [customText, setCustomText] = useState('');
  const [editingDetails, setEditingDetails] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const pending = capturePending || saving || working;
  const setCapture = useCallback((value: boolean) => setCapturePending(value), []);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    listRecordingProjects().then(saved => {
      if (cancelled) return;
      setProjects(saved); setProject(saved[0] || createRecordingProject());
    }).catch(() => {
      if (cancelled) return;
      setStorageError('Browser storage is unavailable. You can still record, but download a project backup before closing this page.');
      setProject(createRecordingProject());
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; mounted.current = false; };
  }, []);

  useEffect(() => { onPendingChange(pending); return () => onPendingChange(false); }, [pending, onPendingChange]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (pending || storageError) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [pending, storageError]);

  const persist = async (next: RecordingProject) => {
    const updated = { ...next, updatedAt: new Date().toISOString() };
    setProject(updated);
    setProjects(previous => [updated, ...previous.filter(item => item.id !== updated.id)]);
    setSaving(true); setNotice('');
    try {
      await saveRecordingProject(updated);
      if (mounted.current) { setStorageError(''); setNotice('Saved on this device'); }
    } catch {
      if (mounted.current) setStorageError('Could not save to browser storage. Your work is still open in this page. Download a project backup before closing it.');
    } finally { if (mounted.current) setSaving(false); }
  };

  const chooseProject = (next: RecordingProject) => {
    setProject(next); setSelected(Math.max(0, next.prompts.findIndex(prompt => !next.recordings[prompt.id])));
    setView('record'); setMicTest(false); setMicTested(false); setEditingDetails(false); setError(''); setNotice(''); setCustomText('');
  };

  const exportProject = async (voiceOnly: boolean) => {
    if (!project) return;
    setWorking(true); setError('');
    try {
      const blob = await exportRecordingArchive(project, voiceOnly);
      downloadBlob(blob, `${safeFilename(project.name)}.${voiceOnly ? 'vvoice' : 'vproject'}`);
      setNotice(voiceOnly ? 'Phrase voice downloaded. It contains your approved sentences, not an arbitrary-text voice.' : 'Project backup downloaded. Keep it somewhere safe.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not export this project.'); }
    finally { setWorking(false); }
  };

  const openFile = async (file: File) => {
    setWorking(true); setError('');
    try {
      const imported = await importRecordingArchive(file);
      chooseProject(imported);
      await persist(imported);
      setNotice('Imported as a new project. Confirm your permission to use these recordings before continuing.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open this file.'); }
    finally { setWorking(false); }
  };

  if (loading || !project) return <p role="status" className="text-slate-400 p-8">Opening your recording projects…</p>;
  const prompt = project.prompts[selected];
  const current = project.recordings[prompt.id];
  const kept = project.prompts.filter(item => project.recordings[item.id]).length;
  const totalSeconds = Object.values(project.recordings).reduce((sum, item) => sum + item.quality.duration, 0);
  const ready = project.permissionConfirmed && !!project.name.trim();

  const keep = async (draft: RecordingDraft) => {
    const next = { ...project, recordings: { ...project.recordings, [prompt.id]: { promptId: prompt.id, ...draft, recordedAt: new Date().toISOString() } } };
    await persist(next);
    setNotice('Sentence kept. Your recording is ready to use.');
    const nextIndex = next.prompts.findIndex((item, i) => i > selected && !next.recordings[item.id]);
    const firstMissing = next.prompts.findIndex(item => !next.recordings[item.id]);
    setSelected(nextIndex >= 0 ? nextIndex : firstMissing >= 0 ? firstMissing : selected);
    return true;
  };

  return <div className="max-w-6xl mx-auto space-y-6">
    <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div><p className="text-amber-300 text-xs font-semibold uppercase tracking-[0.2em] mb-2">Vocalis · Recording Studio</p><h1 className="text-3xl font-bold text-white tracking-tight">Your voice. From the beginning.</h1><p className="text-sm text-slate-400 mt-2 max-w-xl">Read a sentence. Listen back. Keep the take. Build a collection of your own recordings, one clear phrase at a time.</p></div>
      <span className="inline-flex items-center gap-2 shrink-0 self-start text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-800/50 rounded-full px-3 py-2"><ShieldCheck size={14} />Local recording · No AI</span>
    </header>

    <div className="rounded-2xl bg-amber-300/5 border border-amber-300/20 p-4 text-sm text-slate-300"><strong className="text-amber-200">Experimental voice-building workflow.</strong> Record sentences, mark and review their sounds, build a sound bank, then test new text. Alignment is manual—not automatic recognition. The 20 starter prompts are not a complete speech corpus, and voice quality needs listening tests.</div>

    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="recording-project">Recording project</label>
      <select id="recording-project" disabled={pending} value={project.id} onChange={event => { const next = projects.find(item => item.id === event.target.value); if (next) chooseProject(next); }} className={`${field} sm:!w-64`}>
        {![...projects].some(item => item.id === project.id) && <option value={project.id}>{project.name}</option>}
        {projects.map(item => <option key={item.id} value={item.id}>{item.name} · {Object.keys(item.recordings).length} takes</option>)}
      </select>
      <button type="button" disabled={pending} onClick={() => { const next = createRecordingProject(); chooseProject(next); void persist(next); }} className={`${recordingButton} bg-slate-800 text-slate-200 hover:bg-slate-700`}><Plus size={16} />New project</button>
      <input ref={fileInput} type="file" accept=".vproject,.vvoice,application/json" className="hidden" aria-label="Import Vocalis project or phrase voice" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void openFile(file); }} />
      <button type="button" disabled={pending} onClick={() => fileInput.current?.click()} className={`${recordingButton} bg-slate-800 text-slate-200 hover:bg-slate-700`}><FolderOpen size={16} />Open file</button>
      <span role="status" className="text-xs text-slate-400 sm:ml-auto">{saving ? 'Saving…' : notice}</span>
    </div>
    {storageError && <div role="alert" className="text-sm text-amber-200 bg-amber-950/30 border border-amber-800 p-4 rounded-xl">{storageError}</div>}
    {error && <div role="alert" className="text-sm text-rose-300 bg-rose-950/30 border border-rose-800 p-4 rounded-xl">{error}</div>}

    {(!ready || editingDetails) ? <ProjectDetails key={project.id} project={project} disabled={pending} onSave={async details => { await persist({ ...project, ...details }); setEditingDetails(false); }} /> :
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4"><div><h2 className="font-semibold text-white">{project.name}</h2><p className="text-xs text-slate-400">{project.language}{project.accent ? ` · ${project.accent}` : ''} · Permission confirmed by you</p></div><button type="button" disabled={pending} onClick={() => setEditingDetails(true)} className="text-xs text-amber-200 underline underline-offset-4 disabled:opacity-40">Edit details</button></div>}

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {[['01', 'Read & record', 'A quiet space, one sentence at a time.'], ['02', 'Mark sounds', 'Listen and review each sound boundary.'], ['03', 'Build & test', 'Create a bank and try new sentences.'], ['04', 'Use & export', 'Install your voice or make a backup.']].map(([number, title, detail]) => <div key={number} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4"><span className="text-amber-300 text-xs font-mono">{number}</span><h3 className="text-sm font-bold text-white mt-1">{title}</h3><p className="text-xs text-slate-400 mt-1">{detail}</p></div>)}
    </div>

    <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
      <button type="button" disabled={pending} onClick={() => setView('record')} className={`${recordingButton} ${view === 'record' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>Read & record</button>
      <button type="button" disabled={pending} onClick={() => setView('align')} className={`${recordingButton} ${view === 'align' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>Mark sounds</button>
      <button type="button" disabled={pending} onClick={() => setView('build')} className={`${recordingButton} ${view === 'build' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>Build & test</button>
      <button type="button" disabled={pending} onClick={() => setView('use')} className={`${recordingButton} ${view === 'use' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>Use my recordings <span className="text-xs rounded-full px-2 py-0.5 bg-amber-300/10 text-amber-200">{kept}</span></button>
    </div>

    {view === 'record' ? <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-white flex items-center gap-2"><Mic size={16} className="text-amber-300" />{micTested ? 'Microphone checked' : 'Before you begin'}</h3><button type="button" disabled={pending || !ready} onClick={() => setMicTest(!micTest)} className="text-xs text-amber-200 underline underline-offset-4 disabled:opacity-40">{micTest ? 'Back to sentences' : 'Test microphone'}</button></div>
          <p className="text-xs leading-relaxed text-slate-400">Use a quiet room, keep your microphone in one position, and read naturally. No music, effects or character voices. If microphone access is blocked in the embedded preview, open it in a new tab.</p>
        </section>
        <section className="rounded-3xl bg-slate-900 border border-slate-800 p-5 sm:p-7 space-y-6">
          <div className="flex items-center justify-between gap-3"><span className="text-xs uppercase tracking-wider text-amber-300 font-semibold">{micTest ? 'Microphone check · not saved' : prompt.category}</span><span className="text-xs text-slate-400 font-mono">{micTest ? 'Test take' : `${selected + 1} / ${project.prompts.length}`}</span></div>
          <blockquote className="text-xl sm:text-2xl leading-relaxed font-medium text-slate-100">“{micTest ? 'This is my normal speaking voice. I am recording clearly, at a comfortable pace.' : prompt.text}”</blockquote>
          <p className="text-xs text-slate-400">Read exactly these words, including the whole sentence. Leave a short pause at the beginning and end.</p>
          {!micTest && current && <div className="rounded-xl bg-emerald-950/20 border border-emerald-800/50 p-3 space-y-2"><p className="text-xs text-emerald-300 flex items-center gap-1.5"><Check size={14} />Kept take · {current.quality.duration.toFixed(1)} seconds. A retry only replaces this when you keep it.</p>{active && <AudioPreview audio={current.audio} />}<div className="flex gap-4"><button type="button" disabled={pending} onClick={() => downloadBlob(current.audio, `${safeFilename(project.name)}-${prompt.id}.wav`)} className="text-xs text-slate-300 underline underline-offset-2">Download WAV</button><button type="button" disabled={pending} onClick={() => { if (!window.confirm('Delete this saved sentence recording?')) return; const recordings = { ...project.recordings }; delete recordings[prompt.id]; void persist({ ...project, recordings }); }} className="text-xs text-rose-300 underline underline-offset-2">Delete take</button></div></div>}
          {!ready && <p className="text-sm text-amber-200">Complete the voice details and permission checkbox above to enable recording.</p>}
          {active && <RecordingCapture key={`${project.id}-${micTest ? 'mic-test' : prompt.id}`} test={micTest} disabled={!ready || saving || working || editingDetails} onKeep={keep} onPendingChange={setCapture} onTested={() => { setMicTested(true); setMicTest(false); setNotice('Microphone checked. Start with any sentence below.'); }} />}
          {!micTest && <div className="flex items-center justify-between border-t border-slate-800 pt-4"><button type="button" disabled={pending || selected === 0} onClick={() => setSelected(selected - 1)} className={`${recordingButton} text-slate-400 hover:text-white`}><ChevronLeft size={15} />Previous</button><button type="button" disabled={pending || selected === project.prompts.length - 1} onClick={() => setSelected(selected + 1)} className={`${recordingButton} text-slate-400 hover:text-white`}>Next sentence<ChevronRight size={15} /></button></div>}
        </section>
        <form onSubmit={event => { event.preventDefault(); if (!customText.trim() || project.prompts.length >= MAX_PROMPTS || pending) return; const next = { ...project, prompts: [...project.prompts, { id: crypto.randomUUID(), text: customText.trim(), category: 'My own phrases' }] }; setSelected(next.prompts.length - 1); setCustomText(''); setMicTest(false); void persist(next); }} className="rounded-2xl border border-slate-800 p-4 space-y-3">
          <label htmlFor="custom-reading-prompt" className="text-sm font-semibold text-white">Add a phrase you actually need</label><p className="text-xs text-slate-400">Write your own short sentence. Record it, then use it in an announcement or greeting.</p><textarea id="custom-reading-prompt" value={customText} disabled={pending} onChange={event => setCustomText(event.target.value)} maxLength={500} rows={2} placeholder="Welcome to our shop. How can we help you today?" className={field} /><button type="submit" disabled={pending || !customText.trim() || project.prompts.length >= MAX_PROMPTS} className={`${recordingButton} bg-slate-800 text-white`}><Plus size={15} />Add sentence</button><span className="text-xs text-slate-500 ml-3">Up to {MAX_PROMPTS} sentences per project</span>
        </form>
      </div>
      <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
        <div><div className="flex items-baseline justify-between"><h3 className="text-sm font-semibold text-white">Your reading list</h3><span className="text-xs text-amber-200">{kept} / {project.prompts.length} kept</span></div><progress aria-label="Sentences recorded" value={kept} max={project.prompts.length} className="w-full h-1.5 mt-3 accent-amber-300" /><p className="text-xs text-slate-500 mt-2">{totalSeconds.toFixed(0)} seconds recorded · Session progress, not phonetic coverage</p></div>
        <div className="max-h-[520px] overflow-y-auto space-y-1 pr-1">{project.prompts.map((item, index) => <button type="button" key={item.id} disabled={pending} onClick={() => { setSelected(index); setMicTest(false); }} className={`w-full flex items-start gap-2 text-left rounded-xl p-3 text-xs transition-colors disabled:opacity-50 ${selected === index && !micTest ? 'bg-amber-300/10 text-amber-100 border border-amber-300/30' : 'text-slate-400 hover:bg-slate-800 border border-transparent'}`} aria-current={selected === index && !micTest ? 'step' : undefined}><span className="w-4 shrink-0 mt-0.5">{project.recordings[item.id] ? <Check size={13} className="text-emerald-400" /> : index + 1}</span><span>{item.text}{project.recordings[item.id] && <span className="sr-only"> · recorded</span>}</span></button>)}</div>
      </aside>
    </div> : view === 'use' ? active && <PhraseWorkbench key={project.id} project={project} disabled={!ready || pending} />
      : view === 'align' ? active && <SoundAlignmentEditor key={project.id} project={project} disabled={!ready || saving || working || editingDetails} onSave={persist} onPendingChange={setCapture} />
      : active && <VoiceBankBuilder key={project.id} project={project} disabled={!ready || saving || working || editingDetails} onSave={persist} onInstall={onInstall} onPendingChange={setCapture} onAddPrompt={text => {
        if (project.prompts.length >= MAX_PROMPTS) { setError('This project has reached its sentence limit.'); return; }
        const next = { ...project, prompts: [...project.prompts, { id: crypto.randomUUID(), text, category: 'Coverage practice' }] };
        setSelected(next.prompts.length - 1); setView('record'); setMicTest(false); void persist(next);
      }} />}

    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
      <div><h3 className="font-semibold text-white">Keep your voice portable</h3><p className="text-xs text-slate-400 mt-1">Browser storage is local to this site and can be cleared. Back up your project regularly. Open project and phrase files here. Open sound-bank files under Build & test.</p></div>
      <div className="flex flex-wrap gap-3"><button type="button" disabled={pending || !ready} onClick={() => void exportProject(false)} className={`${recordingButton} bg-slate-800 text-white hover:bg-slate-700`}><Download size={16} />Back up project (.vproject)</button><button type="button" disabled={pending || !ready || !kept} onClick={() => void exportProject(true)} className={`${recordingButton} bg-amber-300 text-slate-950 hover:bg-amber-200`}><Download size={16} />Build phrase voice (.vvoice)</button></div>
      <p className="text-xs text-slate-500">Project = prompts, approved WAV recordings and sound labels. Phrase voice = approved phrases only. Build & test exports a different sound-bank .vvoice format for new-text synthesis. No format includes a neural model. Exporting does not grant recording or speaker rights.</p>
      <button type="button" disabled={pending} onClick={async () => { if (!window.confirm(`Delete “${project.name}” and its recordings from this browser? Export a backup first if needed.`)) return; setWorking(true); try { await deleteRecordingProject(project.id); const remaining = projects.filter(item => item.id !== project.id); setProjects(remaining); chooseProject(remaining[0] || createRecordingProject()); setStorageError(''); } catch { setError('Could not delete this project from browser storage.'); } finally { setWorking(false); } }} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-300 disabled:opacity-40"><Trash2 size={13} />Delete this project</button>
    </section>
  </div>;
}

function ProjectDetails({ project, disabled, onSave }: { project: RecordingProject; disabled: boolean; onSave: (details: Pick<RecordingProject, 'name' | 'language' | 'accent' | 'permissionConfirmed'>) => Promise<void> }) {
  const [name, setName] = useState(project.name);
  const [language, setLanguage] = useState(project.language);
  const [accent, setAccent] = useState(project.accent);
  const [permission, setPermission] = useState(project.permissionConfirmed);
  return <form onSubmit={event => { event.preventDefault(); if (name.trim() && language.trim() && permission) void onSave({ name: name.trim(), language: language.trim(), accent: accent.trim(), permissionConfirmed: permission }); }} className="rounded-2xl bg-slate-900 border border-slate-700 p-5 space-y-4">
    <h2 className="text-base font-bold text-white">First, give your voice a name</h2>
    <div className="grid sm:grid-cols-3 gap-4"><label className="space-y-1.5 text-xs text-slate-400">Voice name<input required maxLength={80} value={name} disabled={disabled} onChange={event => setName(event.target.value)} className={field} /></label><label className="space-y-1.5 text-xs text-slate-400">Language<input required maxLength={60} value={language} disabled={disabled} onChange={event => setLanguage(event.target.value)} className={field} /></label><label className="space-y-1.5 text-xs text-slate-400">Your natural accent (optional)<input maxLength={80} value={accent} disabled={disabled} onChange={event => setAccent(event.target.value)} placeholder="e.g. South African English" className={field} /></label></div>
    <p className="text-xs text-slate-500">The starter script is in English. For another language, add your own matching sentences. Language labels do not translate the script.</p>
    <label className="flex items-start gap-3 text-sm text-slate-300 cursor-pointer"><input type="checkbox" checked={permission} disabled={disabled} onChange={event => setPermission(event.target.checked)} className="accent-amber-300 mt-1" />I am recording my own voice, or I have the speaker’s permission to record, process and use these recordings. I will obtain any additional rights needed before sharing or commercial use.</label>
    <button type="submit" disabled={disabled || !name.trim() || !language.trim() || !permission} className={`${recordingButton} bg-amber-300 text-slate-950 hover:bg-amber-200`}>Save details & start</button>
  </form>;
}
