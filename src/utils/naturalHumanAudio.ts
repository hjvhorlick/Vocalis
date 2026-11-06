export interface HumanVoiceSample {
  id: string;
  name: string;
  speaker: string;
  gender: 'Female' | 'Male';
  transcript: string;
  url: string;
  attribution: string;
  license: string;
  duration: number; // approximate seconds
}

export const ATTRIBUTION_DETAILS = {
  project: 'CMU ARCTIC Speech Databases',
  institution: 'Language Technologies Institute, Carnegie Mellon University',
  authors: 'John Kominek & Alan W Black',
  license: 'Free Open Data / BSD Permissive License (Attribution Only)',
  description:
    'Phonetically balanced studio human speech recordings created for acoustic research, speech science, and voice transformation.',
  ruleCompliance: '100% Non-AI. Recorded by real human speakers in professional acoustic studios.',
};

export const NATURAL_HUMAN_SAMPLES: HumanVoiceSample[] = [
  {
    id: 'cmu-slt-1',
    name: 'CMU ARCTIC SLT (Female Speaker - Sentence 1)',
    speaker: 'Real Human Female (US California, Studio Clean)',
    gender: 'Female',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_slt_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker SLT)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.3,
  },
  {
    id: 'cmu-bdl-1',
    name: 'CMU ARCTIC BDL (Male Speaker - Sentence 1)',
    speaker: 'Real Human Male (US Boston, Studio Clean)',
    gender: 'Male',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_bdl_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker BDL)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.2,
  },
  {
    id: 'cmu-slt-2',
    name: 'CMU ARCTIC SLT (Female Speaker - Sentence 2)',
    speaker: 'Real Human Female (US California, Studio Clean)',
    gender: 'Female',
    transcript: 'For the twentieth time that evening the two men shook hands.',
    url: '/samples/cmu_slt_arctic_a0003.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker SLT)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.3,
  },
  {
    id: 'cmu-bdl-2',
    name: 'CMU ARCTIC BDL (Male Speaker - Sentence 2)',
    speaker: 'Real Human Male (US Boston, Studio Clean)',
    gender: 'Male',
    transcript: 'For the twentieth time that evening the two men shook hands.',
    url: '/samples/cmu_bdl_arctic_a0003.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker BDL)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.3,
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
