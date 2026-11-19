import React, { useState } from 'react';
import { Activity, AlertTriangle, Gauge, RefreshCw } from 'lucide-react';
import type { VoiceModelConfig } from '../utils/naturalVoiceEngine';
import { NATURAL_HUMAN_SAMPLES, getSharedAudioContext } from '../utils/naturalHumanAudio';
import { verifiedOriginalSourceBlob } from '../utils/voiceProvenance';
import { analysisWarnings, type AcousticAnalysis } from '../utils/voiceAnalysis';
import { analyseAudioBufferInWorker } from '../utils/voiceAnalysisClient';

export const AcousticAnalysisPanel: React.FC<{ model: VoiceModelConfig }> = ({ model }) => {
  const [analysis, setAnalysis] = useState<AcousticAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source = NATURAL_HUMAN_SAMPLES.find(sample => sample.id === (model.sourceId || model.baseSampleId));
  const warnings = analysis ? analysisWarnings(analysis) : [];

  const analyse = async () => {
    if (!source) { setError('This profile has no packaged original source recording available for local analysis.'); return; }
    setBusy(true); setError(null);
    try {
      // A SHA-256-verified blob is decoded to a working copy; no source byte is rewritten.
      const verified = await verifiedOriginalSourceBlob(model);
      const workingCopy = await getSharedAudioContext().decodeAudioData(await verified.blob.arrayBuffer());
      setAnalysis(await analyseAudioBufferInWorker(workingCopy));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not analyse this source.'); }
    finally { setBusy(false); }
  };

  return <section className="rounded-2xl border border-cyan-900/70 bg-cyan-950/15 p-4 space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-bold text-cyan-100"><Activity className="h-4 w-4 text-cyan-300" /> Acoustic proof-of-concept meters</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-400">Worker-based autocorrelation F0/voicing, LPC spectral-envelope peaks, and aperiodicity from a decoded working copy. These measurements do not alter the original import.</p></div><button type="button" onClick={() => void analyse()} disabled={!source || busy} className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-100 disabled:opacity-50">{busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5" />}{busy ? 'Analysing…' : 'Analyse source'}</button></div>
    {error && <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-2 text-xs text-rose-200">{error}</p>}
    {analysis && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs"><div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3"><span className="block text-[10px] uppercase text-slate-500">Voiced frames</span><strong className="text-cyan-200">{Math.round(analysis.voicedFrameRatio * 100)}%</strong></div><div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3"><span className="block text-[10px] uppercase text-slate-500">Median F0</span><strong className="text-cyan-200">{analysis.medianF0Hz ? `${analysis.medianF0Hz.toFixed(0)} Hz` : '—'}</strong></div><div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3"><span className="block text-[10px] uppercase text-slate-500">LPC envelope peaks</span><strong className="text-cyan-200">{analysis.medianFormantsHz.length ? analysis.medianFormantsHz.map(value => `${value.toFixed(0)} Hz`).join(' · ') : '—'}</strong></div><div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3"><span className="block text-[10px] uppercase text-slate-500">Frame / hop</span><strong className="text-cyan-200">{analysis.frameMs} / {analysis.hopMs} ms</strong></div></div>}
    {warnings.length > 0 && <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-[11px] text-amber-100"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{warnings.join(' ')}</span></div>}
  </section>;
};
