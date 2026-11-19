import { audioBufferToWavBlob } from './audioDspEngine';

export type RoomEnvironmentId =
  | 'dry-reference'
  | 'narration-booth'
  | 'podcast-studio'
  | 'small-room'
  | 'office'
  | 'living-room'
  | 'classroom'
  | 'theatre-hall'
  | 'large-reverberant-space';

export type RoomEnvironment = {
  id: RoomEnvironmentId;
  name: string;
  description: string;
  kind: 'dry' | 'modelled';
  /** Time for the modelled late field to decay by 60 dB. */
  rt60: number;
  /** Delay before environmental reflections reach the listener. */
  preDelayMs: number;
  /** Default amount of room signal in the delivery mix, 0–1. */
  wet: number;
  /** Higher values represent a more distant source/listener relationship. */
  sourceDistanceM: number;
  /** Frequency where the late field begins to darken. */
  highFrequencyDampingHz: number;
  /** Relative amount of the modelled early reflection field. */
  earlyReflectionLevel: number;
  /** Delivery limiter ceiling, separate from voice identity. Defaults to -1 dBFS. */
  outputCeilingDbfs?: number;
};

/**
 * These are labelled modelled rooms. They are deterministic acoustic models, not
 * recordings of a named physical venue. A licensed measured impulse response can
 * later be represented by the same RoomEnvironment shape with `kind: 'measured'`
 * metadata in a persisted render manifest.
 */
export const ROOM_ENVIRONMENTS: readonly RoomEnvironment[] = [
  { id: 'dry-reference', name: 'Dry Reference', description: 'No room processing. Use this first when judging the voice itself.', kind: 'dry', rt60: 0, preDelayMs: 0, wet: 0, sourceDistanceM: 0.2, highFrequencyDampingHz: 20_000, earlyReflectionLevel: 0 },
  { id: 'narration-booth', name: 'Treated Narration Booth', description: 'Very short, controlled room response for clean narration.', kind: 'modelled', rt60: 0.16, preDelayMs: 3, wet: 0.08, sourceDistanceM: 0.35, highFrequencyDampingHz: 8_000, earlyReflectionLevel: 0.12 },
  { id: 'podcast-studio', name: 'Close Podcast Studio', description: 'Close-mic studio space with a subtle short reflection field.', kind: 'modelled', rt60: 0.28, preDelayMs: 7, wet: 0.12, sourceDistanceM: 0.45, highFrequencyDampingHz: 7_200, earlyReflectionLevel: 0.18 },
  { id: 'small-room', name: 'Small Room', description: 'Compact interior with early wall reflections.', kind: 'modelled', rt60: 0.42, preDelayMs: 11, wet: 0.18, sourceDistanceM: 1.1, highFrequencyDampingHz: 6_200, earlyReflectionLevel: 0.32 },
  { id: 'office', name: 'Office / Meeting Room', description: 'Moderate reflection and speech-focused decay.', kind: 'modelled', rt60: 0.56, preDelayMs: 16, wet: 0.22, sourceDistanceM: 1.6, highFrequencyDampingHz: 5_300, earlyReflectionLevel: 0.37 },
  { id: 'living-room', name: 'Living Room', description: 'Soft furnished-room ambience for conversational delivery.', kind: 'modelled', rt60: 0.48, preDelayMs: 14, wet: 0.2, sourceDistanceM: 1.35, highFrequencyDampingHz: 4_700, earlyReflectionLevel: 0.28 },
  { id: 'classroom', name: 'Classroom', description: 'Larger reflective teaching space with a clear direct voice.', kind: 'modelled', rt60: 0.78, preDelayMs: 22, wet: 0.28, sourceDistanceM: 2.2, highFrequencyDampingHz: 4_300, earlyReflectionLevel: 0.4 },
  { id: 'theatre-hall', name: 'Theatre / Hall', description: 'Stage-style presentation space with longer decaying reflections.', kind: 'modelled', rt60: 1.38, preDelayMs: 34, wet: 0.36, sourceDistanceM: 4.2, highFrequencyDampingHz: 3_800, earlyReflectionLevel: 0.46 },
  { id: 'large-reverberant-space', name: 'Large Reverberant Space', description: 'Longer, darker ambience for deliberate dramatic use.', kind: 'modelled', rt60: 2.35, preDelayMs: 48, wet: 0.42, sourceDistanceM: 7.5, highFrequencyDampingHz: 3_000, earlyReflectionLevel: 0.5 },
] as const;

export function roomEnvironmentForId(id: RoomEnvironmentId | string | undefined): RoomEnvironment {
  return ROOM_ENVIRONMENTS.find(room => room.id === id) || ROOM_ENVIRONMENTS[0];
}

export function roomEnvironmentWithWet(id: RoomEnvironmentId | string | undefined, wet?: number): RoomEnvironment {
  const base = roomEnvironmentForId(id);
  return { ...base, wet: wet === undefined ? base.wet : Math.max(0, Math.min(1, wet)) };
}

/** A stable, visible recipe identifier; it is not a cryptographic checksum. */
export function roomRecipeId(room: RoomEnvironment): string {
  return `${room.id}@modelled-v1:rt${room.rt60.toFixed(2)}:pd${room.preDelayMs}:wet${room.wet.toFixed(2)}:d${room.sourceDistanceM.toFixed(1)}:hf${room.highFrequencyDampingHz}:er${room.earlyReflectionLevel.toFixed(2)}:ceil${(room.outputCeilingDbfs ?? -1).toFixed(1)}`;
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashRoomId(id: string): number {
  return [...id].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261);
}

/**
 * Create a deterministic stereo impulse response for a declared modelled room.
 * The sparse first part is an image-source style early-reflection field; the
 * decaying, progressively darker late field models diffuse reverberation. It is
 * deliberately called modelled rather than a recording of a real venue.
 */
export function buildModelledRoomImpulse(context: BaseAudioContext, room: RoomEnvironment): AudioBuffer {
  const tailSeconds = Math.max(0.08, Math.min(4.5, room.rt60 * 1.35));
  const length = Math.max(1, Math.ceil((room.preDelayMs / 1000 + tailSeconds) * context.sampleRate));
  const impulse = context.createBuffer(2, length, context.sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);
  const offset = Math.round(room.preDelayMs / 1000 * context.sampleRate);
  const random = seededRandom(hashRoomId(room.id));

  // First-order image sources for a compact rectangular room. The amplitudes
  // attenuate with distance, while the left/right imbalance gives spatial cues.
  const earlyTimes = [0.007, 0.013, 0.019, 0.028, 0.041, 0.057, 0.079];
  earlyTimes.forEach((seconds, index) => {
    const position = offset + Math.round(seconds * context.sampleRate * (0.78 + room.sourceDistanceM * 0.09));
    if (position >= length) return;
    const amplitude = room.earlyReflectionLevel * 0.34 / (1 + index * 0.5);
    const pan = (random() * 2 - 1) * 0.8;
    left[position] += amplitude * Math.sqrt((1 - pan) * 0.5);
    right[position] += amplitude * Math.sqrt((1 + pan) * 0.5);
  });

  if (room.rt60 <= 0) return impulse;
  const decay = Math.log(1000) / Math.max(0.05, room.rt60 * context.sampleRate);
  // A simple one-pole filter gives a late field whose high frequencies decay
  // faster than its lows. This is a room model, not an identity transformation.
  const smoothing = Math.exp(-2 * Math.PI * Math.max(500, room.highFrequencyDampingHz) / context.sampleRate);
  let filteredLeft = 0, filteredRight = 0;
  for (let index = offset; index < length; index++) {
    const age = index - offset;
    const envelope = Math.exp(-decay * age) * 0.095;
    const noiseLeft = random() * 2 - 1;
    const noiseRight = random() * 2 - 1;
    filteredLeft = (1 - smoothing) * noiseLeft + smoothing * filteredLeft;
    filteredRight = (1 - smoothing) * noiseRight + smoothing * filteredRight;
    left[index] += filteredLeft * envelope;
    right[index] += filteredRight * envelope;
  }
  return impulse;
}

export async function renderRoomEnvironment(
  sourceBuffer: AudioBuffer,
  room: RoomEnvironment,
): Promise<{ wavBlob: Blob; wavUrl: string; duration: number; recipeId: string; audioBuffer: AudioBuffer }> {
  if (room.kind === 'dry' || room.wet <= 0) {
    const wavBlob = audioBufferToWavBlob(sourceBuffer);
    return { wavBlob, wavUrl: URL.createObjectURL(wavBlob), duration: sourceBuffer.duration, recipeId: roomRecipeId(room), audioBuffer: sourceBuffer };
  }
  const sampleRate = sourceBuffer.sampleRate;
  const tail = Math.min(4.5, room.rt60 * 1.35 + room.preDelayMs / 1000);
  const length = Math.ceil((sourceBuffer.duration + tail + 0.05) * sampleRate);
  const context = new OfflineAudioContext(2, Math.max(1, length), sampleRate);
  const source = context.createBufferSource();
  source.buffer = sourceBuffer;
  const dry = context.createGain();
  dry.gain.value = Math.sqrt(1 - room.wet * 0.45);
  const send = context.createGain();
  send.gain.value = Math.sqrt(room.wet) * 0.9;
  const convolver = context.createConvolver();
  convolver.normalize = false;
  convolver.buffer = buildModelledRoomImpulse(context, room);
  const wet = context.createGain();
  wet.gain.value = 1;
  const master = context.createGain();
  master.gain.value = 0.92;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = room.outputCeilingDbfs ?? -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;

  source.connect(dry);
  dry.connect(master);
  source.connect(send);
  send.connect(convolver);
  convolver.connect(wet);
  wet.connect(master);
  master.connect(limiter);
  limiter.connect(context.destination);
  source.start(0);
  const rendered = await context.startRendering();
  const wavBlob = audioBufferToWavBlob(rendered);
  return { wavBlob, wavUrl: URL.createObjectURL(wavBlob), duration: rendered.duration, recipeId: roomRecipeId(room), audioBuffer: rendered };
}
