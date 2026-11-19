import React, { useEffect, useRef, useState } from 'react';
import { Download, Play, Square } from 'lucide-react';
import type { VoiceModelConfig } from '../utils/naturalVoiceEngine';
import { createVoiceRenderRequest, playRenderedVoice, renderVoiceRequest } from '../utils/voiceRenderContract';
import { encodeRenderedWavAsMp3 } from '../utils/mp3Export';

interface SimpleNarrationStudioProps {
  voices: VoiceModelConfig[];
}

/** A single-purpose script-to-MP3 screen. Voice selection remains compact and includes original and newly created profiles. */
export function SimpleNarrationStudio({ voices }: SimpleNarrationStudioProps) {
  const [selectedId, setSelectedId] = useState(() => voices.find((voice) => voice.renderMode !== 'source-clip-only')?.id || voices[0]?.id || '');
  const [script, setScript] = useState('Welcome to Vocalis. This is a short narration test.');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [mp3Url, setMp3Url] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<HTMLAudioElement | null>(null);

  const selectedVoice = voices.find((voice) => voice.id === selectedId) || voices[0];
  const scriptReady = selectedVoice?.renderMode !== 'source-clip-only';

  useEffect(() => {
    if (!selectedVoice && voices[0]) setSelectedId(voices[0].id);
  }, [selectedVoice, voices]);
  useEffect(() => () => { if (mp3Url) URL.revokeObjectURL(mp3Url); }, [mp3Url]);

  const stop = () => {
    playerRef.current?.pause();
    playerRef.current = null;
    setIsPlaying(false);
  };

  const clearMp3 = () => {
    setMp3Url((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  const render = async () => {
    if (!selectedVoice) throw new Error('Choose a voice first.');
    if (!scriptReady) throw new Error('This protected original is a short reference recording. It can be tested in Original Voices but cannot narrate a new script.');
    const text = script.trim();
    if (!text) throw new Error('Paste or type a script first.');
    // The same pinned renderer and dry recipe are used for listening and the delivered MP3.
    const request = createVoiceRenderRequest(selectedVoice, text, { environmentId: 'dry-reference', purpose: 'audition' });
    return renderVoiceRequest(selectedVoice, request);
  };

  const testScript = async () => {
    if (isPlaying) { stop(); return; }
    setError(null);
    setIsPlaying(true);
    try {
      const result = await render();
      let player: HTMLAudioElement;
      player = playRenderedVoice(result, {
        onEnd: () => { if (playerRef.current === player) { playerRef.current = null; setIsPlaying(false); } },
        onError: (reason) => { if (playerRef.current === player) { playerRef.current = null; setIsPlaying(false); setError(reason.message); } },
      });
      playerRef.current = player;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The script could not be rendered.');
      setIsPlaying(false);
    }
  };

  const createMp3 = async () => {
    setError(null);
    setIsCreating(true);
    try {
      const result = await render();
      const mp3 = await encodeRenderedWavAsMp3(result.audio);
      const nextUrl = URL.createObjectURL(mp3);
      setMp3Url((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
      URL.revokeObjectURL(result.audioUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The MP3 could not be created.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <header className="border-b border-slate-800 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-300">Section 4 of 4</p>
        <h1 className="mt-0.5 text-xl font-extrabold text-white">Script to MP3</h1>
        <p className="mt-1 text-sm text-slate-400">Choose a voice, paste a script, listen, then download a genuine MP3 narration.</p>
      </header>

      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-700/60 bg-rose-950/30 px-4 py-3 text-xs text-rose-200"><span>{error}</span><button type="button" onClick={() => setError(null)} className="underline">Dismiss</button></div>}

      <div className="space-y-5 rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6">
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-slate-300">Voice</span>
          <select value={selectedVoice?.id || ''} onChange={(event) => { stop(); clearMp3(); setSelectedId(event.target.value); }} className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-white outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400">
            <optgroup label="Original voices">
              {voices.filter((voice) => !voice.isCustom).map((voice) => <option key={voice.id} value={voice.id}>{voice.flag} {voice.name}{voice.renderMode === 'source-clip-only' ? ' — original reference only' : ''}</option>)}
            </optgroup>
            {voices.some((voice) => voice.isCustom) && <optgroup label="New voices">
              {voices.filter((voice) => voice.isCustom).map((voice) => <option key={voice.id} value={voice.id}>{voice.flag} {voice.name}{voice.renderMode === 'source-clip-only' ? ' — finite clip only' : ''}</option>)}
            </optgroup>}
          </select>
        </label>

        {!scriptReady && <p className="rounded-xl border border-amber-500/35 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-100"><strong>{selectedVoice?.name}</strong> is available as an original listening reference, but it has no matching voice bank for new words. Choose a script-capable voice to narrate text.</p>}

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-slate-300">Script</span>
          <textarea value={script} onChange={(event) => { clearMp3(); setScript(event.target.value); }} disabled={!scriptReady} rows={9} placeholder="Paste the narration script here…" className="w-full rounded-2xl border border-slate-700 bg-slate-950 p-3 text-sm leading-relaxed text-white placeholder:text-slate-500 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50" />
        </label>

        <div className="flex flex-wrap gap-3 border-t border-slate-800 pt-4">
          <button type="button" onClick={() => void testScript()} disabled={!scriptReady || isCreating} className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 ${isPlaying ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-100 hover:bg-slate-700'}`}>
            {isPlaying ? <><Square className="h-3.5 w-3.5 fill-current" /> Stop</> : <><Play className="h-3.5 w-3.5 fill-current text-indigo-300" /> Test script</>}
          </button>
          <button type="button" onClick={() => void createMp3()} disabled={!scriptReady || isCreating} className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> {isCreating ? 'Creating MP3…' : 'Create MP3'}
          </button>
          {mp3Url && <a href={mp3Url} download={`${(selectedVoice?.name || 'vocalis').toLowerCase().replace(/\s+/g, '-')}-narration.mp3`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-500"><Download className="h-3.5 w-3.5" /> Download MP3</a>}
        </div>
      </div>
    </section>
  );
}
