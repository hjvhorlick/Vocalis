import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { parseVoiceRatings, RATINGS_STORAGE_KEY, VoiceRatings } from '../utils/voiceRatings';

interface RatingsContextValue {
  ratings: VoiceRatings;
  setRating: (voiceId: string, rating: number) => void;
  storageError: boolean;
}

const RatingsContext = createContext<RatingsContextValue | null>(null);

export function VoiceRatingsProvider({ children }: { children: React.ReactNode }) {
  const [storageError, setStorageError] = useState(false);
  const [ratings, setRatings] = useState<VoiceRatings>(() => {
    try {
      return parseVoiceRatings(localStorage.getItem(RATINGS_STORAGE_KEY));
    } catch {
      return {};
    }
  });
  const ratingsRef = useRef(ratings);

  // Keep other open tabs in sync, including when browser storage is cleared.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== RATINGS_STORAGE_KEY && event.key !== null) return;
      const next = parseVoiceRatings(event.newValue);
      ratingsRef.current = next;
      setRatings(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setRating = (voiceId: string, rating: number) => {
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) return;
    const next = { ...ratingsRef.current };
    if (rating === 0) delete next[voiceId];
    else Object.defineProperty(next, voiceId, { value: rating, enumerable: true, configurable: true, writable: true });
    ratingsRef.current = next;
    setRatings(next);
    try {
      localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  };

  return <RatingsContext.Provider value={{ ratings, setRating, storageError }}>{children}</RatingsContext.Provider>;
}

export function useVoiceRatings() {
  const context = useContext(RatingsContext);
  if (!context) throw new Error('Voice ratings require VoiceRatingsProvider');
  return context;
}
