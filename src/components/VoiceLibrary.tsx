import React, { useEffect, useRef, useState } from 'react';
import { VoiceModelConfig, auditionSourceRecording, stopSpeaking } from '../utils/naturalVoiceEngine';
import { createVoiceRenderRequest, playRenderedVoice, renderVoiceRequest } from '../utils/voiceRenderContract';
import { GeneratedTake } from '../types/voice';
import {
  Square,
  Trash2,
  Download,
  AudioWaveform,
  Volume2,
  Search,
} from 'lucide-react';
import { VoiceAvatar } from './VoiceAvatar';
import { VoiceSourceNote } from './VoiceSourceNote';
import { CandidateABPlayback } from './CandidateABPlayback';
import { createFreeLibraryManifest } from '../utils/freeLibraryPublication';
import type { VoiceAsset, VoiceQualityRating } from '../types/voiceAsset';
import { deleteVoiceAsset, readVoiceAssets, updateVoiceAssetReview } from '../utils/voiceAssetStorage';

interface VoiceLibraryProps {
  models: VoiceModelConfig[];
  savedTakes: GeneratedTake[];
  onDeleteTake: (id: string) => void;
  onDeleteCustomModel: (id: string) => void;
  onSaveModel: (model: VoiceModelConfig) => void;
}

export const VoiceLibrary: React.FC<VoiceLibraryProps> = ({
  models,
  savedTakes,
  onDeleteTake,
  onDeleteCustomModel,
  onSaveModel,
}) => {
  const [activeTab, setActiveTab] = useState<'takes' | 'originals' | 'review' | 'approved'>('originals');
  const [originalSearch, setOriginalSearch] = useState('');
  const [selectedOriginalId, setSelectedOriginalId] = useState('');
  const [auditioningId, setAuditioningId] = useState<string | null>(null);
  const [assets, setAssets] = useState<VoiceAsset[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewRatings, setReviewRatings] = useState<Record<string, VoiceQualityRating>>({});
  const [assetError, setAssetError] = useState<string | null>(null);
  const originalModels = models.filter((model) => model.sourceType === 'original');
  const normalizedOriginalSearch = originalSearch.trim().toLowerCase();
  const matchingOriginalModels = originalModels.filter((model) => !normalizedOriginalSearch || [model.name, model.archetype, model.description, model.accent, model.realSpeakerName].filter(Boolean).some((value) => value!.toLowerCase().includes(normalizedOriginalSearch)));
  const selectedOriginal = originalModels.find((model) => model.id === selectedOriginalId) || originalModels[0];
  const playerRef = useRef<HTMLAudioElement | null>(null);
  const reloadAssets = async () => {
    try { setAssets(await readVoiceAssets()); }
    catch (error) { setAssetError(error instanceof Error ? error.message : 'Could not open the variant asset library.'); }
  };
  useEffect(() => { void reloadAssets(); }, []);
  const ratingFor = (asset: VoiceAsset): VoiceQualityRating => reviewRatings[asset.id] || asset.review?.ratings || {
    intelligibility: 3, naturalness: 3, artifactFree: 3, toneBodyFit: 3, pitchStability: 3, loudness: 3, suitability: 3,
  };
  const setRating = (asset: VoiceAsset, key: keyof VoiceQualityRating, value: number) => {
    setReviewRatings(previous => ({ ...previous, [asset.id]: { ...ratingFor(asset), [key]: value } }));
  };

  const handleReview = async (asset: VoiceAsset, state: 'approved' | 'rejected') => {
    const model = models.find(item => item.id === asset.profileId);
    const manifest = asset.rendererManifest;
    try {
      if (state === 'approved') {
        const listenerRatings = reviewRatings[asset.id] || asset.review?.ratings;
        const listenerNotes = reviewNotes[asset.id] ?? asset.review?.notes;
        if (!listenerRatings || !listenerNotes?.trim()) throw new Error('Approval requires all seven listener ratings and review notes after matched A/B listening.');
        if (manifest) {
          if (!model || manifest.request.purpose !== 'validation' || manifest.environment.id !== 'dry-reference' || model.validatedRecipeId !== manifest.request.voiceRecipeId) {
            throw new Error('Approval is blocked until this candidate has a matching stored Dry Reference validation render.');
          }
          const updated = await updateVoiceAssetReview(asset.id, 'approved', { ratings: ratingFor(asset), notes: reviewNotes[asset.id] || asset.review?.notes });
          onSaveModel({ ...model, reviewState: 'approved', validatedRecipeId: manifest.request.voiceRecipeId, approvedEnvironmentRecipeIds: [...new Set([...(model.approvedEnvironmentRecipeIds || []), manifest.environment.recipeId])] });
          setAssets(previous => previous.map(item => item.id === updated.id ? updated : item));
        } else if (asset.sourceVariantManifest && model && asset.takeId && asset.sourceVariantManifest.parentSourceHash === asset.sourceHash && asset.sourceVariantManifest.outputHash === asset.audioHash) {
          const updated = await updateVoiceAssetReview(asset.id, 'approved', { ratings: ratingFor(asset), notes: reviewNotes[asset.id] || asset.review?.notes });
          onSaveModel({ ...model, reviewState: 'approved' });
          setAssets(previous => previous.map(item => item.id === updated.id ? updated : item));
        } else {
          throw new Error('Approval requires either a matching Dry Reference validation render or a complete source-clip variant manifest with a linked WAV.');
        }
      } else {
        const updated = await updateVoiceAssetReview(asset.id, 'rejected', { ratings: ratingFor(asset), notes: reviewNotes[asset.id] || asset.review?.notes });
        setAssets(previous => previous.map(item => item.id === updated.id ? updated : item));
      }
    } catch (error) { setAssetError(error instanceof Error ? error.message : 'Could not update candidate review.'); }
  };

  const downloadManifest = (asset: VoiceAsset) => {
    try {
      const manifest = createFreeLibraryManifest(asset);
      const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${asset.id}-publication-manifest.json`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) { setAssetError(error instanceof Error ? error.message : 'Publication manifest verification failed.'); }
  };

  const downloadApprovedWav = (asset: VoiceAsset, take: GeneratedTake) => {
    try {
      createFreeLibraryManifest(asset);
      const anchor = document.createElement('a');
      anchor.href = take.audioUrl; anchor.download = `${take.title}.wav`; anchor.click();
    } catch (error) { setAssetError(error instanceof Error ? error.message : 'Publication verification failed.'); }
  };

  const handleDeleteAsset = async (asset: VoiceAsset) => {
    try {
      const removed = await deleteVoiceAsset(asset.id);
      if (removed.takeId) onDeleteTake(removed.takeId);
      const profile = models.find((model) => model.id === removed.profileId);
      if (profile?.isCustom) onDeleteCustomModel(profile.id);
      setAssets(previous => previous.filter(item => item.id !== removed.id));
    } catch (error) { setAssetError(error instanceof Error ? error.message : 'Could not delete the derived asset.'); }
  };

  const handleAudition = async (m: VoiceModelConfig) => {
    if (auditioningId === m.id) {
      playerRef.current?.pause(); playerRef.current = null; stopSpeaking(); setAuditioningId(null);
      return;
    }
    playerRef.current?.pause();
    setAuditioningId(m.id);
    try {
      if (m.renderMode === 'source-clip-only') {
        if (m.sourceType === 'original') {
          await auditionSourceRecording(m, {
            onEnd: () => setAuditioningId(current => current === m.id ? null : current),
            onError: error => { setAssetError(error.message); setAuditioningId(null); },
          });
          return;
        }
        throw new Error('This is a finite source-clip variant. Play its linked reviewed WAV instead; it cannot render arbitrary text.');
      }
      const request = createVoiceRenderRequest(m, m.samplePhrase, { environmentId: 'dry-reference', purpose: 'audition' });
      const result = await renderVoiceRequest(m, request);
      let player: HTMLAudioElement;
      player = playRenderedVoice(result, {
        onEnd: () => { if (playerRef.current === player) { playerRef.current = null; setAuditioningId(null); } },
        onError: () => { if (playerRef.current === player) { playerRef.current = null; setAuditioningId(null); } },
      });
      playerRef.current = player;
    } catch (error) {
      console.error('Library audition failed:', error);
      setAssetError(error instanceof Error ? error.message : 'Library audition failed.');
      setAuditioningId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* The Library has one job: source/provenance, review, approved files, and saved takes. Voice selection and script work belong in later workflow steps. */}
      <div className="space-y-3 border-b border-slate-800 pb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-300">Step 1 of 5</p>
          <h2 className="mt-0.5 text-lg font-extrabold text-white">Voice Library</h2>
          <p className="mt-1 text-xs text-slate-400">Listen to protected originals, then review or export only separately created candidates. Script narration happens in Step 4.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-slate-800 bg-slate-900 p-1">
          {[
            ['originals', `Original Library (${originalModels.length})`],
            ['review', `Review Queue (${assets.filter(asset => asset.reviewState === 'candidate').length})`],
            ['approved', `Free Library (${assets.filter(asset => asset.reviewState === 'approved').length})`],
            ['takes', `Saved Takes (${savedTakes.length})`],
          ].map(([id, label]) => <button key={id} onClick={() => setActiveTab(id as typeof activeTab)} className={`rounded-xl px-3 py-2 text-xs font-bold transition-all ${activeTab === id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}>{label}</button>)}
        </div>
      </div>

      {assetError && <div role="alert" className="rounded-xl border border-rose-700/60 bg-rose-950/30 p-3 text-xs text-rose-200 flex justify-between gap-3"><span>{assetError}</span><button type="button" onClick={() => setAssetError(null)} className="underline">Dismiss</button></div>}

      {activeTab === 'originals' && (
        <section className="space-y-3">
          <div className="rounded-2xl border border-amber-500/25 bg-amber-950/15 p-4 text-xs text-amber-100"><strong>Original Voice Library — read only.</strong> These recordings retain their existing personalities and source bytes. Playback/download verifies the protected hash and never applies DSP, room treatment, or AI.</div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input type="search" value={originalSearch} onChange={(event) => setOriginalSearch(event.target.value)} placeholder={`Find one of ${originalModels.length} original voices`} className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400" />
              </label>
              <div className="mt-2 max-h-[30rem] space-y-1 overflow-y-auto pr-1">
                {matchingOriginalModels.map((model) => <button key={model.id} type="button" onClick={() => setSelectedOriginalId(model.id)} className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors ${selectedOriginal?.id === model.id ? 'border-indigo-500/60 bg-indigo-500/10' : 'border-transparent hover:bg-slate-800/80'}`}><VoiceAvatar id={model.id} name={model.name} color={model.avatarColor} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-white">{model.flag} {model.name}</span><span className="block truncate text-[10px] text-slate-400">{model.archetype} · {model.renderMode === 'source-clip-only' ? 'original recording' : 'recorded-unit source'}</span></span></button>)}
                {matchingOriginalModels.length === 0 && <p className="p-4 text-center text-xs text-slate-400">No original voice matches that search.</p>}
              </div>
            </div>

            {selectedOriginal && <article className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><VoiceAvatar id={selectedOriginal.id} name={selectedOriginal.name} color={selectedOriginal.avatarColor} size="lg" /><div><h3 className="text-base font-bold text-white">{selectedOriginal.name}</h3><p className="text-[11px] text-indigo-300">{selectedOriginal.archetype}</p></div></div><span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase text-amber-100">Protected original</span></div>
              <p className="text-xs leading-relaxed text-slate-400">{selectedOriginal.description}</p>
              <button type="button" onClick={() => void handleAudition(selectedOriginal)} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold ${auditioningId === selectedOriginal.id ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}>{auditioningId === selectedOriginal.id ? <><Square className="h-3.5 w-3.5 fill-current" /> Stop</> : <><Volume2 className="h-3.5 w-3.5" /> Listen to original</>}</button>
              <VoiceSourceNote model={selectedOriginal} />
              <p className="break-all font-mono text-[10px] text-slate-500">SHA-256: {selectedOriginal.originalSourceHash}</p>
            </article>}
          </div>
        </section>
      )}

      {activeTab === 'review' && (
        <section className="space-y-3">
          <div className="rounded-2xl border border-amber-500/25 bg-amber-950/15 p-4 text-xs text-amber-100"><strong>Listener review queue.</strong> Judge a candidate against its original at matched loudness. Approval requires all seven ratings plus notes; rejection only archives the candidate.</div>
          {assets.filter(asset => asset.reviewState === 'candidate').length === 0 ? <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center text-sm text-slate-400">No candidate assets are waiting for review.</div> : assets.filter(asset => asset.reviewState === 'candidate').map(asset => {
            const take = savedTakes.find(item => item.id === asset.takeId);
            const ratings = ratingFor(asset);
            return <article key={asset.id} className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-sm font-bold text-white">{models.find(model => model.id === asset.profileId)?.name || asset.profileId}</h4><p className="mt-1 text-xs text-cyan-300">{asset.disclosure}</p><p className="mt-1 font-mono text-[10px] text-slate-500">Output {asset.audioHash.slice(0, 16)}… · Parent {asset.sourceHash?.slice(0, 16) || 'not recorded'}…</p></div><span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase text-amber-200">Candidate</span></div>
              {take && <CandidateABPlayback asset={asset} sourceProfile={models.find(model => model.id === asset.profileId)} variantTake={take} />}
              {asset.quality && <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3 text-[11px] text-slate-400">Peak {asset.quality.peakDbfs.toFixed(1)} dBFS · RMS {asset.quality.rmsDbfs.toFixed(1)} dBFS · voiced frames {Math.round((asset.quality.voicedFrameRatio || 0) * 100)}%{asset.quality.warnings.length ? <p className="mt-1 text-amber-200">{asset.quality.warnings.join(' ')}</p> : null}</div>}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{(Object.keys(ratings) as (keyof VoiceQualityRating)[]).map(key => <label key={key} className="text-[10px] text-slate-400 capitalize">{key.replace(/([A-Z])/g, ' $1')}<select value={ratings[key]} onChange={event => setRating(asset, key, Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white">{[1,2,3,4,5].map(value => <option key={value} value={value}>{value}/5</option>)}</select></label>)}</div>
              <textarea value={reviewNotes[asset.id] ?? asset.review?.notes ?? ''} onChange={event => setReviewNotes(previous => ({ ...previous, [asset.id]: event.target.value }))} rows={2} placeholder="Listener notes: intelligibility, naturalness, artefacts, tone, use case…" className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-xs text-white" />
              <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void handleReview(asset, 'approved')} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Approve candidate</button><button type="button" onClick={() => void handleReview(asset, 'rejected')} className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-100">Reject / archive</button><button type="button" onClick={() => void handleDeleteAsset(asset)} className="rounded-xl border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-100">Delete candidate</button></div>
            </article>;
          })}
        </section>
      )}

      {activeTab === 'approved' && (
        <section className="space-y-3">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/15 p-4 text-xs text-emerald-100"><strong>Free Voice Library.</strong> Only locally approved, provenance-bearing assets are listed. Export includes its manifest and disclosure; publication still requires independent licence clearance.</div>
          {assets.filter(asset => asset.reviewState === 'approved').length === 0 ? <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center text-sm text-slate-400">No approved derived files are ready for the free library.</div> : assets.filter(asset => asset.reviewState === 'approved').map(asset => { const take = savedTakes.find(item => item.id === asset.takeId); return <article key={asset.id} className="rounded-2xl border border-emerald-500/25 bg-slate-900/90 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="text-sm font-bold text-white">{models.find(model => model.id === asset.profileId)?.name || asset.profileId}</h4><p className="text-xs text-emerald-200">{asset.disclosure}</p><p className="mt-1 text-[10px] text-slate-500">{asset.licenceNotices?.join(' ') || asset.license || 'Attribution and parent source notices required.'}</p></div><div className="flex flex-wrap gap-2">{take && <button type="button" onClick={() => downloadApprovedWav(asset, take)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Verify & download WAV</button>}{(asset.rendererManifest || asset.sourceVariantManifest) && <button type="button" onClick={() => downloadManifest(asset)} className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-bold text-slate-200">Manifest</button>}</div></article>; })}
        </section>
      )}

      {/* Audio Takes Archive */}
      {activeTab === 'takes' && (
        <div className="space-y-3">
          {savedTakes.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center max-w-lg mx-auto">
              <AudioWaveform className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <h4 className="font-bold text-white text-sm">No Saved Audio Takes</h4>
              <p className="text-xs text-slate-400 mt-1">
                Generate WAV speech in the Speech Studio and click &quot;Save to Library&quot; to archive takes here.
              </p>
            </div>
          ) : (
            savedTakes.map((take) => (
              <div
                key={take.id}
                className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 shrink-0">
                    <AudioWaveform className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="font-bold text-white text-sm">{take.title}</h5>
                    <p className="text-xs text-slate-400 italic mt-0.5 line-clamp-1">
                      &ldquo;{take.textSnippet}&rdquo;
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                      <span>Voiced by: {take.voiceName}</span>
                      <span>&bull;</span>
                      <span>Duration: {take.durationSeconds}s</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <audio src={take.audioUrl} controls className="h-8 max-w-[200px]" />
                  <a
                    href={take.audioUrl}
                    download={`${take.title.slice(0, 20)}.wav`}
                    className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white"
                    title="Download WAV"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => onDeleteTake(take.id)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Delete Take"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
