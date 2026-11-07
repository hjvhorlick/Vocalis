export interface HumanVoiceSample {
  id: string;
  name: string;
  speaker: string;
  /** Which recorded CMU ARCTIC speaker this reference sentence belongs to. */
  voicePackId: 'slt' | 'bdl';
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
  license:
    "Free for any purpose, subject to CMU's conditions: retain the copyright notice, mark modifications clearly, keep the original authors' names (Copyright (c) 2003 Carnegie Mellon University)",
  description:
    'Phonetically balanced studio human speech recordings created for acoustic research, speech science, and voice transformation.',
  ruleCompliance: '100% Non-AI. Recorded by real human speakers in professional acoustic studios.',
};

export const NATURAL_HUMAN_SAMPLES: HumanVoiceSample[] = [
  {
    id: 'cmu-slt-1',
    voicePackId: 'slt',
    name: 'CMU ARCTIC SLT (Female Speaker - Sentence 1)',
    speaker: 'Real Human Female (CMU ARCTIC SLT, studio recording)',
    gender: 'Female',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_slt_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker SLT)',
    license: 'CMU ARCTIC permissive licence (Copyright (c) 2003 Carnegie Mellon University)',
    duration: 3.3,
  },
  {
    id: 'cmu-bdl-1',
    voicePackId: 'bdl',
    name: 'CMU ARCTIC BDL (Male Speaker - Sentence 1)',
    speaker: 'Real Human Male (CMU ARCTIC BDL, studio recording)',
    gender: 'Male',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_bdl_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker BDL)',
    license: 'CMU ARCTIC permissive licence (Copyright (c) 2003 Carnegie Mellon University)',
    duration: 3.2,
  },
  {
    id: 'cmu-slt-2',
    voicePackId: 'slt',
    name: 'CMU ARCTIC SLT (Female Speaker - Sentence 2)',
    speaker: 'Real Human Female (CMU ARCTIC SLT, studio recording)',
    gender: 'Female',
    transcript: 'For the twentieth time that evening the two men shook hands.',
    url: '/samples/cmu_slt_arctic_a0003.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker SLT)',
    license: 'CMU ARCTIC permissive licence (Copyright (c) 2003 Carnegie Mellon University)',
    duration: 3.3,
  },
  {
    id: 'cmu-bdl-2',
    voicePackId: 'bdl',
    name: 'CMU ARCTIC BDL (Male Speaker - Sentence 2)',
    speaker: 'Real Human Male (CMU ARCTIC BDL, studio recording)',
    gender: 'Male',
    transcript: 'For the twentieth time that evening the two men shook hands.',
    url: '/samples/cmu_bdl_arctic_a0003.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker BDL)',
    license: 'CMU ARCTIC permissive licence (Copyright (c) 2003 Carnegie Mellon University)',
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
/** The bytes of each sample, kept so an untouched voice can export the file itself. */
const sampleBytesCache = new Map<string, ArrayBuffer>();

export async function loadHumanVoiceBuffer(sampleUrl: string): Promise<AudioBuffer> {
  const cached = audioBufferCache.get(sampleUrl);
  if (cached) return cached;

  const ctx = getSharedAudioContext();
  const response = await fetch(sampleUrl);
  if (!response.ok) {
    throw new Error(`Failed to load voice sample from ${sampleUrl}: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  sampleBytesCache.set(sampleUrl, arrayBuffer);
  const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  audioBufferCache.set(sampleUrl, decoded);
  return decoded;
}

/**
 * The sample's own file bytes, or null if it has not been loaded yet.
 *
 * Used by the sound-file export: when a voice changes nothing, what should be
 * downloadable is the licensed file, not this application's re-encoding of it.
 */
export function loadedSampleBytes(sampleUrl: string): ArrayBuffer | null {
  return sampleBytesCache.get(sampleUrl) ?? null;
}

/**
 * Decode custom user uploaded audio file (or recorded mic blob)
 */
export async function decodeCustomAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const ctx = getSharedAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuffer);
}
