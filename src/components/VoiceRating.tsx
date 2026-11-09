import React, { useId, useState } from 'react';
import { Star } from 'lucide-react';
import { useVoiceRatings } from './VoiceRatingsProvider';

/** Personal grades, keyed by stable voice ID rather than the voice's name. */
export function VoiceRating({ voiceId, voiceName }: { voiceId: string; voiceName: string }) {
  const { ratings, setRating, storageError } = useVoiceRatings();
  const groupId = useId();
  const [preview, setPreview] = useState<number | null>(null);
  const rating = Object.hasOwn(ratings, voiceId) ? ratings[voiceId] : 0;

  return (
    <div className="space-y-1 cursor-default" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <fieldset className="min-w-0" onMouseLeave={() => setPreview(null)}>
        <legend className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">Your rating</legend>
        <span className="sr-only">Rate {voiceName} out of 5 stars</span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <div className="flex items-center" role="radiogroup" aria-label={`Your rating for ${voiceName}`}>
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value} className="relative cursor-pointer" title={`${value} ${value === 1 ? 'star' : 'stars'}`} onMouseEnter={() => setPreview(value)}>
                <input
                  className="peer sr-only"
                  type="radio"
                  name={`voice-rating-${groupId}`}
                  value={value}
                  checked={rating === value}
                  aria-label={`${value} ${value === 1 ? 'star' : 'stars'} for ${voiceName}`}
                  onChange={() => { setRating(voiceId, value); setPreview(null); }}
                  onFocus={() => setPreview(null)}
                />
                <span className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-amber-400/10 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber-300">
                  <Star aria-hidden="true" className={`h-5 w-5 transition-colors ${(preview ?? rating) >= value ? 'fill-amber-400 text-amber-400' : 'text-slate-500'}`} />
                </span>
              </label>
            ))}
          </div>
          <span className="text-[11px] text-slate-400 tabular-nums" aria-live="polite">{rating ? `${rating}/5` : 'Not rated'}</span>
          {rating > 0 && (
            <button type="button" onClick={() => { setRating(voiceId, 0); setPreview(null); }} aria-label={`Clear rating for ${voiceName}`} className="text-[11px] text-slate-400 hover:text-white underline underline-offset-2 rounded px-1 py-2 focus-visible:outline-2 focus-visible:outline-amber-300">
              Clear
            </button>
          )}
        </div>
      </fieldset>
      {storageError && <p role="status" className="text-[11px] text-amber-300">Browser storage unavailable. Ratings are only kept for this session.</p>}
    </div>
  );
}
