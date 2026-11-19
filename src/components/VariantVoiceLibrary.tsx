import React, { useEffect, useMemo, useState } from 'react';
import { AudioWaveform, Trash2 } from 'lucide-react';
import type { GeneratedTake } from '../types/voice';
import type { VoiceAsset } from '../types/voiceAsset';
import { deleteVoiceAsset, readVoiceAssets } from '../utils/voiceAssetStorage';
import type { VoiceModelConfig } from '../utils/naturalVoiceEngine';
import { VoiceAvatar } from './VoiceAvatar';

interface VariantVoiceLibraryProps {
  voices: VoiceModelConfig[];
  savedTakes: GeneratedTake[];
  onDeleteCustomModel: (id: string) => void;
  onDeleteTake: (id: string) => void;
}

/** Holds only newly created voices; protected originals never appear in this section. */
export function VariantVoiceLibrary({ voices, savedTakes, onDeleteCustomModel, onDeleteTake }: VariantVoiceLibraryProps) {
  const [assets, setAssets] = useState<VoiceAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const variants = useMemo(() => voices.filter((voice) => voice.isCustom), [voices]);

  useEffect(() => {
    void readVoiceAssets().then(setAssets).catch(() => setError('Created voice records could not be opened in this browser.'));
  }, []);

  const removeVariant = async (voice: VoiceModelConfig) => {
    setDeletingId(voice.id);
    try {
      const linkedAssets = assets.filter((asset) => asset.profileId === voice.id);
      for (const asset of linkedAssets) {
        const removed = await deleteVoiceAsset(asset.id);
        if (removed.takeId) onDeleteTake(removed.takeId);
      }
      onDeleteCustomModel(voice.id);
      setAssets((current) => current.filter((asset) => asset.profileId !== voice.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This created voice could not be removed.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <header className="border-b border-slate-800 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-300">Section 3 of 4</p>
        <h1 className="mt-0.5 text-xl font-extrabold text-white">New Voice Library</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">Only voices created in Voice Creator appear here. Protected original imports are kept separate in Original Voices.</p>
      </header>

      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-700/60 bg-rose-950/30 px-4 py-3 text-xs text-rose-200"><span>{error}</span><button type="button" onClick={() => setError(null)} className="underline">Dismiss</button></div>}

      {variants.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/50 p-12 text-center">
          <AudioWaveform className="mx-auto h-9 w-9 text-slate-600" />
          <h2 className="mt-3 text-sm font-bold text-white">No new voices yet</h2>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-400">Create a variant in Section 2. It will appear here as a separate item and will never replace an original import.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {variants.map((voice) => {
            const asset = assets.find((item) => item.profileId === voice.id);
            const take = asset?.takeId ? savedTakes.find((item) => item.id === asset.takeId) : undefined;
            const parent = voices.find((item) => item.id === voice.parentVoiceDefinitionId);
            return <article key={voice.id} className="rounded-2xl border border-cyan-500/25 bg-slate-900/90 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><VoiceAvatar id={voice.id} name={voice.name} color={voice.avatarColor} size="sm" /><div className="min-w-0"><h2 className="truncate text-sm font-bold text-white">{voice.name}</h2><p className="truncate text-[11px] text-cyan-200">Derived from {parent?.name || 'protected source'}</p></div></div><span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold uppercase text-cyan-100">New variant</span></div>
              <p className="text-xs leading-relaxed text-slate-400">{voice.description}</p>
              {take ? <audio controls src={take.audioUrl} className="h-8 w-full" /> : <p className="text-xs text-slate-500">The preview file is not available in this browser session.</p>}
              <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-3"><span className="text-[10px] text-slate-500">{asset?.disclosure || 'Separate derived voice'}</span><button type="button" onClick={() => void removeVariant(voice)} disabled={deletingId === voice.id} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-100 hover:bg-rose-500/20 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> {deletingId === voice.id ? 'Removing…' : 'Remove'}</button></div>
            </article>;
          })}
        </div>
      )}
    </section>
  );
}
