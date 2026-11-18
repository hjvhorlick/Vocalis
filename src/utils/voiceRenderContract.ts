import type { GeneratedTake } from '../types/voice';
import { type VoiceModelConfig, generateSpokenAudioWav, type WordTiming } from './naturalVoiceEngine';
import { originalSourceHash } from './voiceProvenance';
import {
  type RoomEnvironmentId,
  roomEnvironmentForId,
  roomEnvironmentWithWet,
  roomRecipeId,
  renderRoomEnvironment,
} from './roomEnvironment';

export const VOICE_RENDER_CONTRACT_VERSION = 'voice-render-request/v1';

export type VoiceRenderRequest = {
  contractVersion: typeof VOICE_RENDER_CONTRACT_VERSION;
  text: string;
  voiceDefinitionId: string;
  voiceRecipeId: string;
  environmentId: RoomEnvironmentId;
  environmentRecipeId?: string;
  roomWet?: number;
  format: 'wav';
  purpose: 'audition' | 'validation' | 'final' | 'dialogue';
};

export type VoiceRenderManifest = {
  contractVersion: typeof VOICE_RENDER_CONTRACT_VERSION;
  createdAt: string;
  request: VoiceRenderRequest;
  voice: {
    definitionId: string;
    name: string;
    sourceType: NonNullable<VoiceModelConfig['sourceType']>;
    isOriginal: boolean;
    sourceId?: string;
    sourceHash?: string;
    parentVoiceDefinitionId?: string;
    recipeId: string;
  };
  environment: {
    id: RoomEnvironmentId;
    name: string;
    kind: 'dry' | 'modelled';
    recipeId: string;
    disclosure: string;
  };
  renderer: {
    engine: 'naturalVoiceEngine';
    engineVersion: 'local-unit-selection-v1';
    roomRenderer: 'Web Audio OfflineAudioContext ConvolverNode';
    roomRendererVersion: 'modelled-ir-v1';
  };
  inputTextHash: string;
  outputHash?: string;
};

export type VoiceRenderResult = {
  audio: Blob;
  audioUrl: string;
  duration: number;
  wordTimings: WordTiming[];
  manifest: VoiceRenderManifest;
};

/**
 * This is an immutable request snapshot: profile changes made after an audition
 * cannot alter its identity or room recipe in metadata.
 */
export function createVoiceRenderRequest(
  profile: VoiceModelConfig,
  text: string,
  options: Partial<Pick<VoiceRenderRequest, 'environmentId' | 'roomWet' | 'format' | 'purpose'>> = {},
): VoiceRenderRequest {
  const environment = roomEnvironmentWithWet(options.environmentId || 'dry-reference', options.roomWet);
  return Object.freeze({
    contractVersion: VOICE_RENDER_CONTRACT_VERSION,
    text: text.trim(),
    voiceDefinitionId: profile.id,
    voiceRecipeId: profile.recipeId || `${profile.sourceType}:${profile.sourceId || profile.id}:original-v1`,
    environmentId: environment.id,
    environmentRecipeId: roomRecipeId(environment),
    roomWet: environment.wet,
    format: options.format || 'wav',
    purpose: options.purpose || 'audition',
  });
}

export async function sha256Hex(value: Blob | string): Promise<string> {
  const bytes = typeof value === 'string'
    ? new TextEncoder().encode(value)
    : new Uint8Array(await value.arrayBuffer());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function configForLockedRequest(profile: VoiceModelConfig, request: VoiceRenderRequest): VoiceModelConfig {
  if (profile.id !== request.voiceDefinitionId) {
    throw new Error('The selected voice definition changed before rendering. Choose the voice again and create a new request.');
  }
  const actualRecipe = profile.recipeId || `${profile.sourceType}:${profile.sourceId || profile.id}:original-v1`;
  if (actualRecipe !== request.voiceRecipeId) {
    throw new Error('The selected voice recipe changed before rendering. Create a new audition or validation request.');
  }
  return { ...profile };
}

export function assertVoiceRenderEligibility(profile: VoiceModelConfig, request: VoiceRenderRequest): VoiceModelConfig {
  if (!request.text) throw new Error('Enter text before rendering.');
  const lockedProfile = configForLockedRequest(profile, request);
  if (request.purpose === 'final' && lockedProfile.sourceType !== 'original') {
    if (lockedProfile.reviewState !== 'approved' || lockedProfile.validatedRecipeId !== request.voiceRecipeId) {
      throw new Error('This derived voice is still a review candidate. Listen to and approve its matching Dry Reference validation take before creating a final render.');
    }
    const approvedRooms = lockedProfile.approvedEnvironmentRecipeIds || [];
    if (!approvedRooms.includes(request.environmentRecipeId || '')) {
      throw new Error('This room treatment has not been reviewed for this approved voice recipe. Render and approve its validation script before final export.');
    }
  }
  return lockedProfile;
}

export async function renderVoiceRequest(
  profile: VoiceModelConfig,
  request: VoiceRenderRequest,
): Promise<VoiceRenderResult> {
  const lockedProfile = assertVoiceRenderEligibility(profile, request);
  // The voice engine always renders the dry voice first. Room processing is a
  // separate post-render delivery layer and never writes into original assets.
  const dry = await generateSpokenAudioWav(request.text, lockedProfile);
  const room = roomEnvironmentWithWet(request.environmentId, request.roomWet);
  const decoder = new OfflineAudioContext(1, 1, 24_000);
  const dryBuffer = await decoder.decodeAudioData(await dry.audio.arrayBuffer());
  const processed = await renderRoomEnvironment(dryBuffer, room);
  if (dry.audioUrl) URL.revokeObjectURL(dry.audioUrl);
  const textHash = await sha256Hex(request.text);
  const outputHash = await sha256Hex(processed.wavBlob);
  const sourceType = lockedProfile.sourceType || (lockedProfile.isCustom ? 'derived' : 'original');
  const isOriginal = sourceType === 'original';
  const verifiedSourceHash = await originalSourceHash(lockedProfile);
  const manifest: VoiceRenderManifest = {
    contractVersion: VOICE_RENDER_CONTRACT_VERSION,
    createdAt: new Date().toISOString(),
    request: { ...request, environmentRecipeId: roomRecipeId(room), roomWet: room.wet },
    voice: {
      definitionId: lockedProfile.id,
      name: lockedProfile.name,
      sourceType,
      isOriginal,
      sourceId: lockedProfile.sourceId,
      sourceHash: verifiedSourceHash,
      parentVoiceDefinitionId: lockedProfile.parentVoiceDefinitionId,
      recipeId: request.voiceRecipeId,
    },
    environment: {
      id: room.id,
      name: room.name,
      kind: room.kind,
      recipeId: roomRecipeId(room),
      disclosure: room.kind === 'dry'
        ? 'Dry reference output; no room processing applied.'
        : 'Modelled room treatment applied after dry voice rendering; not a recording of a named physical venue.',
    },
    renderer: {
      engine: 'naturalVoiceEngine',
      engineVersion: 'local-unit-selection-v1',
      roomRenderer: 'Web Audio OfflineAudioContext ConvolverNode',
      roomRendererVersion: 'modelled-ir-v1',
    },
    inputTextHash: textHash,
    outputHash,
  };
  return { audio: processed.wavBlob, audioUrl: processed.wavUrl, duration: processed.duration, wordTimings: dry.wordTimings, manifest };
}

export function playRenderedVoice(
  result: VoiceRenderResult,
  callbacks: { onStart?: () => void; onEnd?: () => void; onError?: (error: Error) => void } = {},
): HTMLAudioElement {
  const player = new Audio(result.audioUrl);
  player.onplaying = () => callbacks.onStart?.();
  player.onended = () => callbacks.onEnd?.();
  player.onerror = () => callbacks.onError?.(new Error('Rendered audio could not be played.'));
  void player.play().catch(error => callbacks.onError?.(error instanceof Error ? error : new Error('Rendered audio could not be played.')));
  return player;
}

export function renderResultToGeneratedTake(result: VoiceRenderResult, id: string): GeneratedTake {
  const text = result.manifest.request.text;
  return {
    id,
    title: `${result.manifest.voice.name} - ${text.slice(0, 32)}${text.length > 32 ? '…' : ''}`,
    createdAt: Date.parse(result.manifest.createdAt),
    textSnippet: text,
    voiceName: result.manifest.voice.name,
    audioUrl: result.audioUrl,
    durationSeconds: Math.round(result.duration),
    renderManifest: result.manifest,
  };
}

