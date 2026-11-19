import React, { useRef, useState } from 'react';
import { Square, Volume2 } from 'lucide-react';
import { auditionSourceRecording, stopSpeaking, type VoiceModelConfig } from '../utils/naturalVoiceEngine';
import { VoiceAvatar } from './VoiceAvatar';
import { VoiceRating } from './VoiceRating';

interface OriginalVoiceSetProps {
  voices: VoiceModelConfig[];
}

/** The only catalogue of protected originals. It is intentionally separate from created variants. */
export function OriginalVoiceSet({ voices }: OriginalVoiceSetProps) {
  const originals = voices.filter((voice) => voice.sourceType === 'original');
  const [auditioningId, setAuditioningId] = useState<string | null>(null);
  const currentId = useRef<string | null>(null);

  const audition = (voice: VoiceModelConfig) => {
    if (currentId.current === voice.id) {
      stopSpeaking();
      currentId.current = null;
      setAuditioningId(null);
      return;
    }
    stopSpeaking();
    currentId.current = voice.id;
    setAuditioningId(voice.id);
    void auditionSourceRecording(voice, {
      onEnd: () => {
        if (currentId.current === voice.id) {
          currentId.current = null;
          setAuditioningId(null);
        }
      },
      onError: () => {
        if (currentId.current === voice.id) {
          currentId.current = null;
          setAuditioningId(null);
        }
      },
    });
  };

  return (
    <section className="mx-auto max-w-7xl space-y-5">
      <header className="border-b border-slate-800 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-300">Section 1 of 4</p>
        <h1 className="mt-0.5 text-xl font-extrabold text-white">Original Voices</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">Listen to each protected original recording and rate how natural it sounds. These are unchanged imports, so each Test voice button plays its own recorded words rather than pretending every speaker can read a new script.</p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {originals.map((voice) => {
          const playing = auditioningId === voice.id;
          return (
            <article key={voice.id} className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <VoiceAvatar id={voice.id} name={voice.name} color={voice.avatarColor} size="sm" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-bold text-white">{voice.flag} {voice.name}</h2>
                  <p className="truncate text-[11px] text-indigo-300">{voice.archetype}</p>
                </div>
              </div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-amber-200">Original recording — unprocessed</p>
              <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-3">
                <button type="button" onClick={() => audition(voice)} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${playing ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}>
                  {playing ? <><Square className="h-3.5 w-3.5 fill-current" /> Stop</> : <><Volume2 className="h-3.5 w-3.5" /> Test voice</>}
                </button>
                <VoiceRating voiceId={voice.id} voiceName={voice.name} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
