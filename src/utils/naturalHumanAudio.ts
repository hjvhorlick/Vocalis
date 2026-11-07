export interface HumanVoiceSample {
  id: string;
  name: string;
  speaker: string;
  gender: 'Female' | 'Male';
  accent: 'US' | 'UK' | 'CA' | 'IN' | 'Global';
  transcript: string;
  url: string;
  attribution: string;
  license: string;
  duration: number; // approximate seconds
  category: 'CMU ARCTIC (Speech Science)' | 'Open Speech Repository (Harvard Sentences)';
}

export const ATTRIBUTION_DETAILS = {
  project: 'CMU ARCTIC & Open Speech Repositories',
  institution: 'Carnegie Mellon University & Open Speech Repository',
  authors: 'John Kominek, Alan W. Black (CMU), Telchemy OSR',
  license: 'Free Open Data / BSD Permissive License (Attribution Only)',
  description:
    'Real human studio voice recordings of phonetically balanced sentences spoken by distinct professional speakers with diverse natural accents.',
  ruleCompliance: '100% Non-AI. Recorded by real human speakers in acoustic recording chambers.',
};

export const NATURAL_HUMAN_SAMPLES: HumanVoiceSample[] = [
  // 1. SLT - US Female (Silicon Valley / California)
  {
    id: 'cmu-slt-1',
    name: 'Aria / SLT (US Female - California)',
    speaker: 'Real Human Female (US California)',
    gender: 'Female',
    accent: 'US',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_slt_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker SLT)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.3,
    category: 'CMU ARCTIC (Speech Science)',
  },
  {
    id: 'cmu-slt-2',
    name: 'Aria / SLT (US Female - Sentence 2)',
    speaker: 'Real Human Female (US California)',
    gender: 'Female',
    accent: 'US',
    transcript: 'For the twentieth time that evening the two men shook hands.',
    url: '/samples/cmu_slt_arctic_a0003.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker SLT)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.3,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 2. RMS - US Male (Deep Resonant Baritone)
  {
    id: 'cmu-rms-1',
    name: 'Marcus / RMS (Deep American Baritone)',
    speaker: 'Real Human Male (Deep Baritone, Robert M. Smith)',
    gender: 'Male',
    accent: 'US',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_rms_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker RMS)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.0,
    category: 'CMU ARCTIC (Speech Science)',
  },
  {
    id: 'cmu-rms-2',
    name: 'Marcus / RMS (Deep American Baritone - Sentence 2)',
    speaker: 'Real Human Male (Deep Baritone, Robert M. Smith)',
    gender: 'Male',
    accent: 'US',
    transcript: 'For the twentieth time that evening the two men shook hands.',
    url: '/samples/cmu_rms_arctic_a0003.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker RMS)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.2,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 3. AWB - Scottish Male (Alan W Black)
  {
    id: 'cmu-awb-1',
    name: 'Oliver / AWB (Scottish English Male)',
    speaker: 'Real Human Male (Alan W. Black, Edinburgh Scotland)',
    gender: 'Male',
    accent: 'UK',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_awb_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker AWB)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.9,
    category: 'CMU ARCTIC (Speech Science)',
  },
  {
    id: 'cmu-awb-2',
    name: 'Oliver / AWB (Scottish English Male - Sentence 2)',
    speaker: 'Real Human Male (Alan W. Black, Edinburgh Scotland)',
    gender: 'Male',
    accent: 'UK',
    transcript: 'For the twentieth time that evening the two men shook hands.',
    url: '/samples/cmu_awb_arctic_a0003.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker AWB)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 4.8,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 4. CLB - US Female (Boston Massachusetts)
  {
    id: 'cmu-clb-1',
    name: 'Charlotte / CLB (US Female - Boston)',
    speaker: 'Real Human Female (US Boston, Massachusetts)',
    gender: 'Female',
    accent: 'US',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_clb_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker CLB)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.6,
    category: 'CMU ARCTIC (Speech Science)',
  },
  {
    id: 'cmu-clb-2',
    name: 'Charlotte / CLB (US Female - Sentence 2)',
    speaker: 'Real Human Female (US Boston, Massachusetts)',
    gender: 'Female',
    accent: 'US',
    transcript: 'For the twentieth time that evening the two men shook hands.',
    url: '/samples/cmu_clb_arctic_a0003.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker CLB)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.6,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 5. BDL - US Male (Boston Massachusetts)
  {
    id: 'cmu-bdl-1',
    name: 'David / BDL (US Male - Boston)',
    speaker: 'Real Human Male (US Boston, Massachusetts)',
    gender: 'Male',
    accent: 'US',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_bdl_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker BDL)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.2,
    category: 'CMU ARCTIC (Speech Science)',
  },
  {
    id: 'cmu-bdl-2',
    name: 'David / BDL (US Male - Sentence 2)',
    speaker: 'Real Human Male (US Boston, Massachusetts)',
    gender: 'Male',
    accent: 'US',
    transcript: 'For the twentieth time that evening the two men shook hands.',
    url: '/samples/cmu_bdl_arctic_a0003.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker BDL)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.3,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 6. JMK - Canadian Male (John M Kominek)
  {
    id: 'cmu-jmk-1',
    name: 'John / JMK (Canadian English Male)',
    speaker: 'Real Human Male (John M. Kominek, Canada)',
    gender: 'Male',
    accent: 'CA',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_jmk_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker JMK)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.8,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 7. KSP - Indian English Male
  {
    id: 'cmu-ksp-1',
    name: 'Dev / KSP (Indian English Male)',
    speaker: 'Real Human Male (Indian English Cadence)',
    gender: 'Male',
    accent: 'IN',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_ksp_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker KSP)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.2,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 8. OSR Harvard Sentences - Female
  {
    id: 'osr-harvard-female',
    name: 'Elena / OSR (Harvard Sentences Female)',
    speaker: 'Real Human Female (Open Speech Repository Studio)',
    gender: 'Female',
    accent: 'US',
    transcript: 'The birch canoe slid on the smooth planks. Glue the sheet to the dark blue background.',
    url: '/samples/osr_harvard_female.wav',
    attribution: 'Open Speech Repository (OSR IEEE Harvard Sentences)',
    license: 'Free Open License (Credit to Open Speech Repository)',
    duration: 33.6,
    category: 'Open Speech Repository (Harvard Sentences)',
  },

  // 9. OSR Harvard Sentences - Male
  {
    id: 'osr-harvard-male',
    name: 'Michael / OSR (Harvard Sentences Male)',
    speaker: 'Real Human Male (Open Speech Repository Studio)',
    gender: 'Male',
    accent: 'US',
    transcript: 'The birch canoe slid on the smooth planks. Glue the sheet to the dark blue background.',
    url: '/samples/osr_harvard_male.wav',
    attribution: 'Open Speech Repository (OSR IEEE Harvard Sentences)',
    license: 'Free Open License (Credit to Open Speech Repository)',
    duration: 46.9,
    category: 'Open Speech Repository (Harvard Sentences)',
  },
];

// In-memory AudioBuffer cache
const audioBufferCache = new Map<string, AudioBuffer>();

let sharedAudioContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioContext = new AudioCtx();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

/**
 * Fetch and decode a human voice sample into an AudioBuffer
 */
export async function loadHumanVoiceBuffer(sampleUrl: string): Promise<AudioBuffer> {
  const cached = audioBufferCache.get(sampleUrl);
  if (cached) return cached;

  const ctx = getSharedAudioContext();
  const response = await fetch(sampleUrl);
  if (!response.ok) {
    throw new Error(`Failed to load voice sample from ${sampleUrl}: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  audioBufferCache.set(sampleUrl, decoded);
  return decoded;
}

/**
 * Decode custom user uploaded audio file (or recorded mic blob)
 */
export async function decodeCustomAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const ctx = getSharedAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuffer);
}
