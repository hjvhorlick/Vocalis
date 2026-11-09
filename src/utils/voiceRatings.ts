export const RATINGS_STORAGE_KEY = 'vocalis_voice_ratings_v1';
export type VoiceRatings = Record<string, number>;

/** Treat malformed storage as unrated; never display invalid grades. */
export function parseVoiceRatings(raw: string | null): VoiceRatings {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) =>
      typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
    ));
  } catch {
    return {};
  }
}
