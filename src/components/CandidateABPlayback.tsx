import React, { useEffect, useRef, useState } from 'react';
import type { VoiceModelConfig } from '../utils/naturalVoiceEngine';
import type { GeneratedTake } from '../types/voice';
import type { VoiceAsset, VoiceQualityReport } from '../types/voiceAsset';
import { getSharedAudioContext } from '../utils/naturalHumanAudio';
import { verifiedOriginalSourceBlob } from '../utils/voiceProvenance';
import { inspectAudioBufferQuality } from '../utils/voiceQuality';
import { Pause, Play, Scale } from 'lucide-react';

type Playing = 'original' | 'variant' | null;

function playbackVolume(report: VoiceQualityReport, targetRmsDbfs: number): number {
  // We only attenuate the louder source. The underlying bytes remain untouched.
  return Math.max(0, Math.min(1, 10 ** ((targetRmsDbfs - report.rmsDbfs) / 20)));
}

/**
 * A/B helper for review. It fetches and hashes the original before native
 * playback, then matches output level with HTMLAudioElement.volume only. No DSP
 * or modified original buffer is written or stored.
 */
export const CandidateABPlayback: React.FC<{
  asset: VoiceAsset;
  sourceProfile: VoiceModelConfig | undefined;
  variantTake: GeneratedTake | undefined;
}> = ({ asset, sourceProfile, variantTake }) => {
  const player = useRef<HTMLAudioElement | null>(null);
  const sourceUrl = useRef<string | null>(null);
  const [playing, setPlaying] = useState<Playing>(null);
  const [sourceQuality, setSourceQuality] = useState<VoiceQualityReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const release = () => {
    player.current?.pause(); player.current = null;
    if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
    sourceUrl.current = null; setPlaying(null);
  };
  useEffect(() => release, []);

  const play = async (kind: Exclude<Playing, null>) => {
    if (playing === kind) { release(); return; }
    release(); setError(null);
    try {
      if (!sourceProfile) throw new Error('The parent source profile is not available for this candidate.');
      const variantQuality = asset.quality;
      if (!variantTake || !variantQuality) throw new Error('A linked variant WAV and its technical quality report are required for A/B review.');
      let url: string;
      let originalQuality = sourceQuality;
      let originalBlob: Blob | undefined;
      if (kind === 'original' || !originalQuality) {
        const verified = await verifiedOriginalSourceBlob(sourceProfile);
        originalBlob = verified.blob;
        if (!originalQuality) {
          const workingCopy = await getSharedAudioContext().decodeAudioData(await verified.blob.arrayBuffer());
          originalQuality = inspectAudioBufferQuality(workingCopy);
          setSourceQuality(originalQuality);
        }
      }
      if (kind === 'original') {
        url = URL.createObjectURL(originalBlob!);
        sourceUrl.current = url;
      } else url = variantTake.audioUrl;
      const target = Math.min(originalQuality!.rmsDbfs, variantQuality.rmsDbfs);
      const report = kind === 'original' ? originalQuality : variantQuality;
      const audio = new Audio(url);
      audio.volume = playbackVolume(report, target);
      player.current = audio; setPlaying(kind);
      audio.onended = release;
      audio.onerror = () => { release(); setError('The selected A/B reference could not be played.'); };
      await audio.play();
    } catch (caught) {
      release(); setError(caught instanceof Error ? caught.message : 'Could not start matched A/B playback.');
    }
  };

  return <div className="rounded-xl border border-cyan-800/60 bg-cyan-950/15 p-3 space-y-2">
    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-cyan-200"><Scale className="h-3.5 w-3.5" /> Matched-level A/B listening</div>
    <p className="text-[10px] leading-relaxed text-slate-400">Original is SHA-256 verified before native playback. Playback only attenuates the louder side to the lower measured RMS; neither file is modified.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => void play('original')} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-bold text-cyan-100">{playing === 'original' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{playing === 'original' ? 'Stop original' : 'Play original'}</button>
      <button type="button" onClick={() => void play('variant')} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-100">{playing === 'variant' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{playing === 'variant' ? 'Stop variant' : 'Play variant'}</button>
    </div>
    {error && <p role="alert" className="text-[10px] text-rose-200">{error}</p>}
  </div>;
};
