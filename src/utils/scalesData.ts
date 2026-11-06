import { ScaleExercise, VoiceClassification } from '../types/vocalis';

export const VOICE_CLASSIFICATIONS: VoiceClassification[] = [
  {
    type: 'Bass',
    lowNote: 'E2',
    highNote: 'E4',
    lowMidi: 40,
    highMidi: 64,
    description: 'Deep, resonant lowest male singing voice with rich low overtones.',
    color: '#3b82f6', // blue
  },
  {
    type: 'Baritone',
    lowNote: 'A2',
    highNote: 'A4',
    lowMidi: 45,
    highMidi: 69,
    description: 'The most common male vocal range; warm, powerful mid-range with expressive depth.',
    color: '#06b6d4', // cyan
  },
  {
    type: 'Tenor',
    lowNote: 'C3',
    highNote: 'C5',
    lowMidi: 48,
    highMidi: 72,
    description: 'High male voice; bright, ringing high notes with agility and clarity.',
    color: '#10b981', // emerald
  },
  {
    type: 'Contralto',
    lowNote: 'F3',
    highNote: 'F5',
    lowMidi: 53,
    highMidi: 77,
    description: 'Deepest female voice; dark, velvety and rare with soulful resonance.',
    color: '#8b5cf6', // purple
  },
  {
    type: 'Mezzo-Soprano',
    lowNote: 'A3',
    highNote: 'A5',
    lowMidi: 57,
    highMidi: 81,
    description: 'Rich, versatile mid female voice spanning warmth in the lower register and bright upper notes.',
    color: '#ec4899', // pink
  },
  {
    type: 'Soprano',
    lowNote: 'C4',
    highNote: 'C6',
    lowMidi: 60,
    highMidi: 84,
    description: 'Highest singing voice; brilliant, luminous high register with effortless agility.',
    color: '#f59e0b', // amber
  },
];

export function determineVoiceClassification(lowMidi: number, highMidi: number): VoiceClassification {
  // Compare center pitch and overlap
  const userCenter = (lowMidi + highMidi) / 2;
  let bestMatch = VOICE_CLASSIFICATIONS[1]; // default baritone
  let bestDist = Infinity;

  for (const vc of VOICE_CLASSIFICATIONS) {
    const vcCenter = (vc.lowMidi + vc.highMidi) / 2;
    const dist = Math.abs(userCenter - vcCenter);
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = vc;
    }
  }

  return bestMatch;
}

export const SCALE_EXERCISES: ScaleExercise[] = [
  {
    id: '5-tone-scale',
    name: '5-Tone Scale (1-2-3-4-5-4-3-2-1)',
    description: 'The classic foundation vocal warm-up. Builds smooth step-wise vocal agility and breath pacing.',
    category: 'beginner',
    intervals: [0, 2, 4, 5, 7, 5, 4, 2, 0],
    durations: [1, 1, 1, 1, 1, 1, 1, 1, 1.5],
    syllables: ['Yah', 'Yah', 'Yah', 'Yah', 'Yah', 'Yah', 'Yah', 'Yah', 'Yah'],
  },
  {
    id: 'major-arpeggio',
    name: 'Major Arpeggio (1-3-5-8-5-3-1)',
    description: 'Expands vocal range and trains muscle memory for pitch intervals across octaves.',
    category: 'intermediate',
    intervals: [0, 4, 7, 12, 7, 4, 0],
    durations: [1, 1, 1, 1.5, 1, 1, 2],
    syllables: ['Mah', 'Meh', 'Mee', 'Moh', 'Mee', 'Meh', 'Mah'],
  },
  {
    id: 'triad-steps',
    name: 'Triad Steps (Do-Mi-Sol-Mi-Do)',
    description: 'Fundamental harmony training to build core resonant cord closure.',
    category: 'beginner',
    intervals: [0, 4, 7, 4, 0],
    durations: [1, 1, 1.5, 1, 2],
    syllables: ['Noo', 'Noo', 'Noo', 'Noo', 'Noo'],
  },
  {
    id: 'octave-siren',
    name: 'Octave Glide / Siren (1 to 8)',
    description: 'Smooth glissando to blend chest voice, mixed voice, and head voice without breaks.',
    category: 'intermediate',
    intervals: [0, 2, 4, 7, 11, 12, 11, 7, 4, 2, 0],
    durations: [0.75, 0.75, 0.75, 0.75, 0.75, 1.5, 0.75, 0.75, 0.75, 0.75, 1.5],
    syllables: ['Woo', 'Woo', 'Woo', 'Woo', 'Woo', 'Woo', 'Woo', 'Woo', 'Woo', 'Woo', 'Woo'],
  },
  {
    id: 'pentatonic-flow',
    name: 'Pentatonic Agility Run',
    description: 'Modern pop and R&B riff training for rapid, accurate vocal runs.',
    category: 'advanced',
    intervals: [0, 2, 4, 7, 9, 12, 9, 7, 4, 2, 0],
    durations: [0.6, 0.6, 0.6, 0.6, 0.6, 1.2, 0.6, 0.6, 0.6, 0.6, 1.5],
    syllables: ['Hey', 'Hey', 'Hey', 'Hey', 'Hey', 'Hey', 'Hey', 'Hey', 'Hey', 'Hey', 'Hey'],
  },
  {
    id: 'sovte-lip-trill',
    name: 'SOVTE Lip Trill (3-Tone Repeat)',
    description: 'Semi-Occluded Vocal Tract exercise relieving strain and balancing air pressure.',
    category: 'beginner',
    intervals: [0, 2, 4, 2, 0, 2, 4, 2, 0],
    durations: [1, 1, 1, 1, 1, 1, 1, 1, 2],
    syllables: ['Brr', 'Brr', 'Brr', 'Brr', 'Brr', 'Brr', 'Brr', 'Brr', 'Brr'],
  },
];
