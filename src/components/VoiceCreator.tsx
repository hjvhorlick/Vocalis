import React, { useState, useEffect } from 'react';
import {
  VoiceModelConfig,
  NATURAL_HUMAN_SAMPLES,
  PRESET_VOICE_MODELS,
} from '../utils/naturalVoiceEngine';
import {
  createVoiceRenderRequest,
  playRenderedVoice,
  renderResultToGeneratedTake,
  renderVoiceRequest,
  type VoiceRenderResult,
} from '../utils/voiceRenderContract';
import type { RoomEnvironmentId } from '../utils/roomEnvironment';
import { GeneratedTake } from '../types/voice';
import { VoiceVisualizer } from './VoiceVisualizer';
import { SourceVoiceAttribution } from './SourceVoiceAttribution';
import {
  Sliders,
  Volume2,
  Square,
  Play,
  RotateCcw,
  Sparkles,
  Check,
  Waves,
  Download,
  BookmarkCheck,
  Palette,
  Activity,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { VoiceAvatar } from './VoiceAvatar';
import { VoiceSourceNote } from './VoiceSourceNote';
import { VoiceRating } from './VoiceRating';
import { RoomEnvironmentStudio } from './RoomEnvironmentStudio';
import { AcousticAnalysisPanel } from './AcousticAnalysisPanel';
import { getSharedAudioContext } from '../utils/naturalHumanAudio';
import { renderTransformedWav } from '../utils/audioDspEngine';
import { sha256Hex } from '../utils/voiceRenderContract';
import { originalSourceHash, originalSourceRecord, sha256Blob, verifiedOriginalSourceBlob } from '../utils/voiceProvenance';
import { inspectAudioBufferQuality } from '../utils/voiceQuality';
import { prepareAiVoiceCreationJob, type AiVoiceCreationJob, type AiConsentRecord } from '../utils/aiVoiceCreation';
import type { VoiceAsset } from '../types/voiceAsset';
import { saveDerivedAsset } from '../utils/voiceAssetStorage';

interface VoiceCreatorProps {
  voices: VoiceModelConfig[];
  activeVoice: VoiceModelConfig;
  onSaveModel: (newModel: VoiceModelConfig) => void;
  onSaveTake: (take: GeneratedTake) => Promise<void>;
  onGoToHub: (voice?: VoiceModelConfig) => void;
}

export const VOICE_VALIDATION_SCRIPT = 'The morning train arrives at quarter past eight. Clear speech, warm vowels, and careful consonants should remain steady from the first sentence to the last.';

const COLOR_SWATCHES = [
  '#3b82f6', // Blue
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#f97316', // Orange
  '#e11d48', // Rose
  '#6366f1', // Indigo
  '#14b8a6', // Teal
];

const FLAG_OPTIONS: { flag: string; label: string; accent: 'US' | 'UK' | 'AU' | 'Global' | 'CA' | 'IN' | 'EU' }[] = [
  { flag: '🇺🇸', label: 'US American', accent: 'US' },
  { flag: '🇬🇧', label: 'UK English', accent: 'UK' },
  { flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', label: 'Scottish', accent: 'UK' },
  { flag: '🇨🇦', label: 'Canadian', accent: 'CA' },
  { flag: '🇮🇳', label: 'Indian English', accent: 'IN' },
  { flag: '🇪🇺', label: 'European', accent: 'EU' },
  { flag: '🇩🇪', label: 'German Accented', accent: 'EU' },
  { flag: '✨', label: 'Custom / Global', accent: 'Global' },
];

export const VoiceCreator: React.FC<VoiceCreatorProps> = ({
  voices,
  activeVoice,
  onSaveModel,
  onSaveTake,
  onGoToHub,
}) => {
  // Base profile selection; originals remain protected source references.
  const [selectedBaseId, setSelectedBaseId] = useState<string>(activeVoice.id);

  // Editable voice parameters
  const [name, setName] = useState<string>(`${activeVoice.name} (Custom)`);
  const [archetype, setArchetype] = useState<string>(activeVoice.archetype || 'Custom Speaker');
  const [description, setDescription] = useState<string>(
    `A distinct derived voice candidate sculpted from ${activeVoice.name} with bounded pitch, spectral-envelope and delivery controls.`
  );
  const [accent, setAccent] = useState<'US' | 'UK' | 'AU' | 'Global' | 'CA' | 'IN' | 'EU'>(
    activeVoice.accent || 'US'
  );
  const [flag, setFlag] = useState<string>(activeVoice.flag || '✨');
  const [gender, setGender] = useState<'Female' | 'Male' | 'Neutral'>(activeVoice.gender || 'Neutral');
  const [avatarColor, setAvatarColor] = useState<string>(activeVoice.avatarColor || '#6366f1');
  const [samplePhrase, setSamplePhrase] = useState<string>(activeVoice.samplePhrase);

  // Acoustic DSP controls
  const [pitch, setPitch] = useState<number>(activeVoice.pitch || 1.0);
  const [rate, setRate] = useState<number>(activeVoice.rate || 1.0);
  const [volume, setVolume] = useState<number>(activeVoice.volume ?? 1.0);
  const [throatWarmth, setThroatWarmth] = useState<number>(activeVoice.throatWarmth ?? 0);
  const [oralClarity, setOralClarity] = useState<number>(activeVoice.oralClarity ?? 0);
  const [airPresence, setAirPresence] = useState<number>(activeVoice.airPresence ?? 0);
  const [spectralTilt, setSpectralTilt] = useState<number>(activeVoice.spectralTilt ?? 0);
  const [formantShift, setFormantShift] = useState<number>(activeVoice.formantShift ?? 1);
  const [toneStyle, setToneStyle] = useState<
    'natural' | 'deep' | 'energetic' | 'whisper' | 'radio' | 'robot'
  >(activeVoice.toneStyle || 'natural');

  // Audition state
  const [isAuditioning, setIsAuditioning] = useState<boolean>(false);

  // Save & Export state
  const [isSavingAndExporting, setIsSavingAndExporting] = useState<boolean>(false);
  const [createdModel, setCreatedModel] = useState<VoiceModelConfig | null>(null);
  const [savedTakeUrl, setSavedTakeUrl] = useState<string | null>(null);
  const [savedTakeDuration, setSavedTakeDuration] = useState<number>(0);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [aiIntent, setAiIntent] = useState<AiVoiceCreationJob | null>(null);
  const [aiSourceMode, setAiSourceMode] = useState<'packaged' | 'own-file'>('packaged');
  const [aiOwnReference, setAiOwnReference] = useState<File | null>(null);
  const [aiOwnReferenceHash, setAiOwnReferenceHash] = useState<string | null>(null);
  const [aiIntentError, setAiIntentError] = useState<string | null>(null);
  const [aiConsentHolder, setAiConsentHolder] = useState('');
  const [aiConsentEvidence, setAiConsentEvidence] = useState('');
  const [aiScript, setAiScript] = useState('');
  const [aiProvider, setAiProvider] = useState('');
  const [aiModelVersion, setAiModelVersion] = useState('');
  const [aiPermitsDerived, setAiPermitsDerived] = useState(false);
  const [aiPermitsFreeLibrary, setAiPermitsFreeLibrary] = useState(false);
  const [aiRetentionEndsAt, setAiRetentionEndsAt] = useState('');
  const [environmentId, setEnvironmentId] = useState<RoomEnvironmentId>('dry-reference');
  const [roomWet, setRoomWet] = useState(0);
  const [validationResult, setValidationResult] = useState<VoiceRenderResult | null>(null);
  const [roomValidationResult, setRoomValidationResult] = useState<VoiceRenderResult | null>(null);
  const [isRenderingRoomValidation, setIsRenderingRoomValidation] = useState(false);
  const auditionPlayerRef = React.useRef<HTMLAudioElement | null>(null);

  // Sync when activeVoice prop changes or base selection changes
  const handleSelectBaseVoice = (voiceId: string) => {
    setSelectedBaseId(voiceId);
    const found = voices.find((v) => v.id === voiceId) || PRESET_VOICE_MODELS[0];
    setName(`${found.name} Crafted`);
    setArchetype(`Adapted ${found.archetype}`);
    setDescription(`Custom transformed voice crafted from original speaker ${found.name}.`);
    setAccent(found.accent || 'US');
    setFlag(found.flag || '✨');
    setGender(found.gender || 'Neutral');
    setAvatarColor(found.avatarColor || '#6366f1');
    setSamplePhrase(found.samplePhrase);
    setPitch(found.pitch || 1.0);
    setRate(found.rate || 1.0);
    setVolume(found.volume ?? 1.0);
    setThroatWarmth(found.throatWarmth ?? 0);
    setOralClarity(found.oralClarity ?? 0);
    setAirPresence(found.airPresence ?? 0);
    setSpectralTilt(found.spectralTilt ?? 0);
    setFormantShift(found.formantShift ?? 1);
    setToneStyle(found.toneStyle || 'natural');
  };

  // Build the current draft model
  const currentDraftModel: VoiceModelConfig = {
    id: createdModel ? createdModel.id : `custom-voice-${Date.now()}`,
    name: name.trim() || 'Custom Crafted Voice',
    archetype: archetype.trim() || 'Custom Speaker',
    description: description.trim() || 'A custom crafted vocal model.',
    gender,
    synthesisMethod: voices.find(v => v.id === selectedBaseId)?.synthesisMethod || 'cmu-arctic',
    unitVoiceId: voices.find(v => v.id === selectedBaseId)?.unitVoiceId,
    baseSampleId: voices.find((v) => v.id === selectedBaseId)?.baseSampleId || 'cmu-slt-1',
    baseVoiceId: voices.find((v) => v.id === selectedBaseId)?.baseVoiceId,
    realSpeakerName: voices.find((v) => v.id === selectedBaseId)?.realSpeakerName || 'Original Speaker',
    accent,
    flag,
    pitch,
    rate,
    volume,
    throatWarmth,
    oralClarity,
    airPresence,
    spectralTilt,
    formantShift,
    toneStyle,
    samplePhrase: samplePhrase.trim() || 'Hello, I am a newly created voice in Vocalis.',
    avatarColor,
    isCustom: true,
    sourceType: 'derived',
    parentVoiceDefinitionId: selectedBaseId,
    sourceId: voices.find(v => v.id === selectedBaseId)?.sourceId || voices.find(v => v.id === selectedBaseId)?.baseSampleId,
    originalSourceHash: voices.find(v => v.id === selectedBaseId)?.originalSourceHash,
    recipeId: `derived-local-v2:${selectedBaseId}:p${pitch.toFixed(2)}:r${rate.toFixed(2)}:fs${formantShift.toFixed(2)}:st${spectralTilt.toFixed(1)}:tw${throatWarmth.toFixed(1)}:oc${oralClarity.toFixed(1)}:ap${airPresence.toFixed(1)}:${toneStyle}`,
    reviewState: 'candidate',
    renderMode: voices.find(voice => voice.id === selectedBaseId)?.renderMode === 'script-renderable' || voices.find(voice => voice.id === selectedBaseId)?.synthesisMethod === 'recorded-units' ? 'script-renderable' : 'source-clip-only',
  };

  const stopAudition = () => {
    auditionPlayerRef.current?.pause();
    auditionPlayerRef.current = null;
    setIsAuditioning(false);
  };

  // A creator audition is a contract render too; no source clip is substituted.
  const handleAudition = async () => {
    if (isAuditioning) { stopAudition(); return; }
    setIsAuditioning(true);
    try {
      if (currentDraftModel.renderMode === 'source-clip-only') {
        const source = NATURAL_HUMAN_SAMPLES.find(sample => sample.id === (currentDraftModel.sourceId || currentDraftModel.baseSampleId));
        if (!source) throw new Error('No protected source clip is available for this source-clip variant preview.');
        const verified = await verifiedOriginalSourceBlob(currentDraftModel);
        const originalBuffer = await getSharedAudioContext().decodeAudioData(await verified.blob.arrayBuffer());
        const rendered = await renderTransformedWav(originalBuffer, currentDraftModel);
        const player = new Audio(rendered.wavUrl);
        player.onended = () => { URL.revokeObjectURL(rendered.wavUrl); if (auditionPlayerRef.current === player) stopAudition(); };
        player.onerror = () => { URL.revokeObjectURL(rendered.wavUrl); if (auditionPlayerRef.current === player) stopAudition(); };
        auditionPlayerRef.current = player;
        await player.play();
        return;
      }
      const request = createVoiceRenderRequest(currentDraftModel, currentDraftModel.samplePhrase, {
        environmentId,
        roomWet,
        purpose: 'audition',
      });
      const result = await renderVoiceRequest(currentDraftModel, request);
      let player: HTMLAudioElement;
      player = playRenderedVoice(result, {
        onEnd: () => { if (auditionPlayerRef.current === player) stopAudition(); },
        onError: () => { if (auditionPlayerRef.current === player) stopAudition(); },
      });
      auditionPlayerRef.current = player;
    } catch (error) {
      console.error('Could not render candidate audition:', error);
      setIsAuditioning(false);
    }
  };

  // Reset to original settings of chosen base voice
  const handleResetToSource = () => {
    const original = voices.find((v) => v.id === selectedBaseId);
    if (!original) return;
    setPitch(original.pitch || 1.0);
    setRate(original.rate || 1.0);
    setVolume(original.volume ?? 1.0);
    setThroatWarmth(0);
    setOralClarity(0);
    setAirPresence(0);
    setSpectralTilt(0);
    setFormantShift(1);
    setToneStyle('natural');
  };

  const prepareAiIntent = async () => {
    setAiIntent(null); setAiIntentError(null);
    try {
      const sourceProfile = voices.find(voice => voice.id === selectedBaseId);
      const packagedHash = sourceProfile && originalSourceHash(sourceProfile);
      const packagedId = sourceProfile?.sourceId || sourceProfile?.baseSampleId;
      const packagedRecord = originalSourceRecord(packagedId);
      if (!aiRetentionEndsAt) throw new Error('Set the consent retention end date.');
      const source: VoiceAsset = aiSourceMode === 'own-file'
        ? (() => {
            if (!aiOwnReference || !aiOwnReferenceHash) throw new Error('Choose your own voice reference file so its SHA-256 can be bound to the consent record.');
            return {
              id: `user-ai-reference-${aiOwnReferenceHash.slice(0, 16)}`, role: 'original' as const, profileId: 'user-own-voice-reference', sourceId: 'user-own-voice-reference',
              sourceHash: aiOwnReferenceHash, audioHash: aiOwnReferenceHash, createdAt: new Date().toISOString(), reviewState: 'locked' as const, immutableOriginal: true,
              disclosure: 'User-supplied own-voice reference; hashed locally for an explicit AI creation intent only.',
            };
          })()
        : (() => {
            if (!sourceProfile || !packagedHash || !packagedId) throw new Error('Select a protected source with registered provenance before preparing an AI intent.');
            if (packagedRecord?.aiCreationStatus !== 'eligible') throw new Error('This packaged source is not on the AI-creation rights allowlist. A performer/licence review must approve it before an intent can be prepared.');
            return {
              id: `original-source-${packagedId}`, role: 'original' as const, profileId: sourceProfile.id, sourceId: packagedId,
              sourceHash: packagedHash, audioHash: packagedHash, createdAt: packagedRecord.importedAt, reviewState: 'locked' as const, immutableOriginal: true,
              disclosure: 'Immutable original import; source-only audition and provenance reference.',
            };
          })();
      const sourceHash = source.sourceHash!;
      if (!aiPermitsDerived || !aiPermitsFreeLibrary) throw new Error('Explicitly confirm AI-derived audio and free-library distribution permissions on the consent record.');
      const consent: AiConsentRecord = {
        id: `consent-${source.sourceId}-${sourceHash.slice(0, 12)}`, sourceAssetId: source.id, sourceHash,
        speakerOrRightsHolder: aiConsentHolder.trim(), releaseScope: aiSourceMode === 'own-file' ? 'own-voice' : 'reviewed-package-license',
        permitsAiDerivedAudio: aiPermitsDerived, permitsFreeLibraryDistribution: aiPermitsFreeLibrary, evidenceNote: aiConsentEvidence.trim(),
        retentionEndsAt: new Date(`${aiRetentionEndsAt}T23:59:59.999Z`).toISOString(), revocable: true,
        confirmedAt: new Date().toISOString(),
      };
      if (!consent.speakerOrRightsHolder) throw new Error('Name the speaker or rights holder on the consent record.');
      setAiIntent(await prepareAiVoiceCreationJob(source, consent, {
        text: aiScript, provider: aiProvider, modelVersion: aiModelVersion, intendedUse: 'Free-library review candidate only',
      }));
    } catch (error) { setAiIntentError(error instanceof Error ? error.message : 'Could not prepare the AI creation intent.'); }
  };

  const createSourceClipCandidate = async (finalModel: VoiceModelConfig) => {
    const sourceProfile = voices.find(voice => voice.id === selectedBaseId);
    const source = NATURAL_HUMAN_SAMPLES.find(sample => sample.id === (sourceProfile?.sourceId || sourceProfile?.baseSampleId));
    if (!sourceProfile || !source) throw new Error('This profile has no protected source recording available for a source-clip variant.');
    // This branch works only from a decoded copy and emits a finite WAV. It does
    // not pretend that a short source clip can speak new text.
    const verifiedSource = await verifiedOriginalSourceBlob(sourceProfile);
    const originalBuffer = await getSharedAudioContext().decodeAudioData(await verifiedSource.blob.arrayBuffer());
    const transformed = await renderTransformedWav(originalBuffer, finalModel);
    const renderedBuffer = await getSharedAudioContext().decodeAudioData(await transformed.wavBlob.arrayBuffer());
    const quality = inspectAudioBufferQuality(renderedBuffer);
    const parentHash = originalSourceHash(sourceProfile);
    if (!parentHash) throw new Error('The selected source does not have a protected SHA-256 record.');
    const outputHash = await sha256Hex(transformed.wavBlob);
    const manifest = {
      contractVersion: 'source-clip-variant/v1' as const,
      createdAt: new Date().toISOString(),
      parentSourceId: source.id,
      parentSourceHash: parentHash,
      engine: 'bounded-local-dsp' as const,
      engineVersion: 'spectral-envelope-warp-v1' as const,
      parameters: { pitch, rate, formantShift, spectralTilt, throatWarmth, oralClarity, airPresence, toneStyle, volume },
      outputHash,
      outputFormat: 'wav' as const,
      quality,
      disclosure: 'Derived source-clip WAV. It is based on one protected original recording and is not a reusable text voice.',
    };
    const candidate: VoiceModelConfig = { ...finalModel, renderMode: 'source-clip-only', reviewState: 'candidate', validatedRecipeId: undefined, approvedEnvironmentRecipeIds: [] };
    const takeId = `take-source-variant-${Date.now()}`;
    onSaveModel(candidate);
    setCreatedModel(candidate);
    await saveDerivedAsset({
      id: `asset-${candidate.id}`, role: 'dsp-variant', profileId: candidate.id,
      parentAssetId: `original-source-${source.id}`, sourceId: source.id, sourceHash: parentHash,
      audioHash: outputHash, takeId, sampleRate: renderedBuffer.sampleRate, bitDepth: 16,
      createdAt: manifest.createdAt, reviewState: 'candidate', review: { status: 'candidate' }, immutableOriginal: false,
      disclosure: manifest.disclosure, attribution: source.attribution, license: source.license,
      licenceNotices: [source.attribution, source.license, 'Modification: bounded local DSP source-clip variant.'],
      supportedUse: 'Finite reviewed clip only; not a reusable arbitrary-text voice.', quality, sourceVariantManifest: manifest,
    });
    await onSaveTake({
      id: takeId, title: `${candidate.name} - Source Clip Variant`, audioUrl: transformed.wavUrl, voiceName: candidate.name,
      durationSeconds: Math.round(transformed.duration), createdAt: Date.now(), textSnippet: source.transcript,
      sourceVariantManifest: manifest,
    });
    setValidationResult(null);
    setSavedTakeUrl(transformed.wavUrl);
    setSavedTakeDuration(transformed.duration);
    setSaveSuccess(true);
  };

  // Create a separate reviewable candidate. The base/original definition is never
  // overwritten. Full script candidates require a real recorded-unit bank; a
  // packaged source clip instead creates only a finite source-clip variant.
  const handleSaveNewVoiceAndSample = async () => {
    setIsSavingAndExporting(true);
    try {
      const finalModel: VoiceModelConfig = {
        ...currentDraftModel,
        id: `custom-voice-${Date.now()}`,
        reviewState: 'candidate',
      };
      if (finalModel.renderMode === 'source-clip-only') {
        await createSourceClipCandidate(finalModel);
        return;
      }
      const dryValidationRequest = createVoiceRenderRequest(finalModel, VOICE_VALIDATION_SCRIPT, {
        environmentId: 'dry-reference',
        roomWet: 0,
        purpose: 'validation',
      });
      const result = await renderVoiceRequest(finalModel, dryValidationRequest);
      const candidateWithValidation: VoiceModelConfig = {
        ...finalModel,
        validatedRecipeId: result.manifest.request.voiceRecipeId,
        approvedEnvironmentRecipeIds: [],
      };
      onSaveModel(candidateWithValidation);
      setCreatedModel(candidateWithValidation);
      setValidationResult(result);
      const validationTakeId = `take-${Date.now()}`;
      const sourceReference = NATURAL_HUMAN_SAMPLES.find(sample => sample.id === (finalModel.sourceId || finalModel.baseSampleId));
      await saveDerivedAsset({
        id: `asset-${finalModel.id}`,
        role: 'dsp-variant',
        profileId: finalModel.id,
        parentAssetId: result.manifest.voice.sourceId ? `original-source-${result.manifest.voice.sourceId}` : undefined,
        sourceId: result.manifest.voice.sourceId,
        sourceHash: result.manifest.voice.sourceHash,
        audioHash: result.manifest.outputHash || '',
        takeId: validationTakeId,
        sampleRate: 24_000,
        bitDepth: 16,
        createdAt: result.manifest.createdAt,
        reviewState: 'candidate',
        review: { status: 'candidate' },
        quality: result.manifest.quality,
        attribution: sourceReference?.attribution,
        license: sourceReference?.license,
        licenceNotices: [sourceReference?.attribution || 'Parent source attribution required.', sourceReference?.license || 'Parent source licence notice required.', 'Modification: local bounded DSP/render recipe; see manifest.'],
        supportedUse: 'Approved script-renderable candidate only after matching voice/room review; see manifest.',
        immutableOriginal: false,
        disclosure: 'Derived local DSP candidate; separate from its protected original source.',
        rendererManifest: result.manifest,
      });
      await onSaveTake(renderResultToGeneratedTake(result, validationTakeId));

      setSavedTakeUrl(result.audioUrl);
      setSavedTakeDuration(result.duration);
      setSaveSuccess(true);
    } catch (err) {
      console.error('Failed to create voice candidate and validation take:', err);
    } finally {
      setIsSavingAndExporting(false);
    }
  };

  const handleRenderRoomValidation = async () => {
    const candidate = createdModel || currentDraftModel;
    setIsRenderingRoomValidation(true);
    try {
      const request = createVoiceRenderRequest(candidate, VOICE_VALIDATION_SCRIPT, { environmentId, roomWet, purpose: 'validation' });
      const result = await renderVoiceRequest(candidate, request);
      setRoomValidationResult(result);
      await onSaveTake(renderResultToGeneratedTake(result, `take-room-validation-${Date.now()}`));
    } catch (error) {
      console.error('Could not render room validation take:', error);
    } finally {
      setIsRenderingRoomValidation(false);
    }
  };

  const handleApproveRoom = () => {
    if (!createdModel || !roomValidationResult || roomValidationResult.manifest.request.voiceRecipeId !== createdModel.recipeId) return;
    const withApprovedRoom = {
      ...createdModel,
      approvedEnvironmentRecipeIds: [...new Set([...(createdModel.approvedEnvironmentRecipeIds || []), roomValidationResult.manifest.environment.recipeId])],
    };
    onSaveModel(withApprovedRoom);
    setCreatedModel(withApprovedRoom);
  };

  const selectedBaseVoice = voices.find((v) => v.id === selectedBaseId) || voices[0];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <SourceVoiceAttribution />

      {/* Main Studio Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-500 text-white shadow-md">
                <Sparkles className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Voice Creation Studio
                </h2>
                <p className="text-xs text-slate-400">
                  Create separately labelled, reviewable DSP candidates from protected source profiles
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs bg-emerald-950/50 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Local non-neural synthesis
            </span>
          </div>
        </div>

        <VoiceSourceNote model={currentDraftModel} />
        <AcousticAnalysisPanel model={voices.find(voice => voice.id === selectedBaseId) || currentDraftModel} />

        {/* STEP 1: Select Original Base Voice (Out of 60) */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">
                1
              </span>
              Select Original Base Voice to Adapt (Voice Profiles Available):
            </label>
            <span className="text-[11px] font-mono text-indigo-400">
              Selected: {selectedBaseVoice.name} &bull; {selectedBaseVoice.gender} &bull; {selectedBaseVoice.accent}
            </span>
          </div>

          <p className={`rounded-xl border p-3 text-[11px] leading-relaxed ${selectedBaseVoice.renderMode === 'script-renderable' || selectedBaseVoice.synthesisMethod === 'recorded-units' ? 'border-emerald-500/25 bg-emerald-950/15 text-emerald-100' : 'border-amber-500/25 bg-amber-950/15 text-amber-100'}`}>
            {selectedBaseVoice.renderMode === 'script-renderable' || selectedBaseVoice.synthesisMethod === 'recorded-units'
              ? 'This source has a packaged recorded-unit bank, so its derived candidate can render a fixed Dry Reference script for validation.'
              : 'This source is a protected short reference recording without a packaged voice bank. The workshop can create a finite derived version of that exact clip only; it cannot honestly render arbitrary new text.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-56 overflow-y-auto p-1 border border-slate-800/80 rounded-xl bg-slate-900/40">
            {voices.map((v) => {
              const isChosen = v.id === selectedBaseId;
              return (
                <div key={v.id} className="rounded-xl border border-slate-800 p-2 space-y-2">
                  <button
                    type="button"
                    onClick={() => handleSelectBaseVoice(v.id)}
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                      isChosen
                        ? 'bg-indigo-950/70 border-indigo-500 text-white shadow-md ring-1 ring-indigo-500'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <VoiceAvatar
                        id={v.id}
                        name={v.name}
                        color={v.avatarColor}
                        size="sm"
                      />
                      {v.flag && (
                        <span className="absolute -bottom-1 -right-1 text-[9px] bg-slate-900 rounded border border-slate-700 px-0.5 leading-none">
                          {v.flag}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-xs truncate text-white">{v.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {v.archetype} &bull; {v.gender}
                      </div>
                    </div>
                    {isChosen && <Check className="w-4 h-4 text-indigo-400 shrink-0" />}
                  </button>
                  <VoiceRating voiceId={v.id} voiceName={v.name} />
                </div>
              );
            })}
          </div>
        </div>

        {/* STEP 2: Acoustic Sound Shaping & Transformation */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[10px] font-bold">
                2
              </span>
              Create a Separate Derived Candidate (bounded DSP, never edits the original):
            </label>
            <button
              onClick={handleResetToSource}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" /> Reset Knobs
            </button>
          </div>

          <p className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-[11px] leading-relaxed text-slate-400">Pitch is a bounded resample plus WSOLA duration correction; pace sets the independent target duration. The envelope control is a bounded STFT spectral-envelope warp; the remaining spectral controls are fixed-frequency EQ. Neither is a claim of a new human speaker or accent. Device effects are delivery colour.</p>

          {/* Core Controls: Pitch, Cadence, Volume */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Pitch Transposition */}
            <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-xl space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-300">Vocal Pitch Height</span>
                <span className="font-mono text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 text-[11px]">
                  {pitch.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min="0.75"
                max="1.30"
                step="0.05"
                value={pitch}
                onChange={(e) => setPitch(parseFloat(e.target.value))}
                className="w-full accent-cyan-400 h-1.5 bg-slate-950 rounded cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>0.75× (lower)</span>
                <span>1.0×</span>
                <span>1.30× (higher)</span>
              </div>
            </div>

            {/* Speaking Pace */}
            <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-xl space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-300">Speaking Pace &amp; Cadence</span>
                <span className="font-mono text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 text-[11px]">
                  {rate.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min="0.70"
                max="1.30"
                step="0.05"
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value))}
                className="w-full accent-indigo-400 h-1.5 bg-slate-950 rounded cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>0.70× (slower)</span>
                <span>1.0×</span>
                <span>1.30× (faster)</span>
              </div>
            </div>

            {/* Volume Gain */}
            <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-xl space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-300">Volume Output Gain</span>
                <span className="font-mono text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 text-[11px]">
                  {Math.round(volume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.05"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full accent-amber-400 h-1.5 bg-slate-950 rounded cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>20% (Subdued)</span>
                <span>100% (Full Level)</span>
              </div>
            </div>
          </div>

          {/* Formant EQ Shaping */}
          <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <Waves className="w-3.5 h-3.5 text-cyan-400" />
                Spectral EQ Shaping (delivery colour, not formant estimation)
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Biquad Peaking DSP</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]"><span className="text-slate-400">Vocal-tract envelope shift</span><span className="font-mono text-emerald-300 font-bold">{formantShift.toFixed(2)}×</span></div>
                <input type="range" min="0.85" max="1.15" step="0.01" value={formantShift} onChange={(event) => setFormantShift(parseFloat(event.target.value))} className="w-full accent-emerald-400 h-1 bg-slate-950 rounded cursor-pointer" />
                <p className="text-[9px] leading-relaxed text-slate-500">Bounded STFT spectral-envelope warp. It moves broad resonance regions; it is not a new speaker or accent.</p>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]"><span className="text-slate-400">Broadband spectral tilt</span><span className="font-mono text-emerald-300 font-bold">{spectralTilt > 0 ? `+${spectralTilt}` : spectralTilt} dB</span></div>
                <input type="range" min="-8" max="8" step="0.5" value={spectralTilt} onChange={(event) => setSpectralTilt(parseFloat(event.target.value))} className="w-full accent-emerald-400 h-1 bg-slate-950 rounded cursor-pointer" />
                <p className="text-[9px] leading-relaxed text-slate-500">Complementary low/high shelves change low-to-high balance, not vocal identity.</p>
              </div>
              {/* F1 */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Low-mid warmth (450 Hz EQ)</span>
                  <span className="font-mono text-cyan-300 font-bold">
                    {throatWarmth > 0 ? `+${throatWarmth}` : throatWarmth} dB
                  </span>
                </div>
                <input
                  type="range"
                  min="-10"
                  max="10"
                  step="1"
                  value={throatWarmth}
                  onChange={(e) => setThroatWarmth(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 h-1 bg-slate-950 rounded cursor-pointer"
                />
              </div>

              {/* F2 */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Presence clarity (1.8 kHz EQ)</span>
                  <span className="font-mono text-indigo-300 font-bold">
                    {oralClarity > 0 ? `+${oralClarity}` : oralClarity} dB
                  </span>
                </div>
                <input
                  type="range"
                  min="-10"
                  max="10"
                  step="1"
                  value={oralClarity}
                  onChange={(e) => setOralClarity(parseFloat(e.target.value))}
                  className="w-full accent-indigo-400 h-1 bg-slate-950 rounded cursor-pointer"
                />
              </div>

              {/* F3 */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">High-frequency air (4.2 kHz EQ)</span>
                  <span className="font-mono text-purple-300 font-bold">
                    {airPresence > 0 ? `+${airPresence}` : airPresence} dB
                  </span>
                </div>
                <input
                  type="range"
                  min="-10"
                  max="10"
                  step="1"
                  value={airPresence}
                  onChange={(e) => setAirPresence(parseFloat(e.target.value))}
                  className="w-full accent-purple-400 h-1 bg-slate-950 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Delivery Tone Modes */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
              Tone Delivery &amp; Timbre Style:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              {[
                { id: 'natural', label: 'Natural Clean' },
                { id: 'deep', label: 'Deep Cinema' },
                { id: 'energetic', label: 'High Energy' },
                { id: 'whisper', label: 'Soft Whisper' },
                { id: 'radio', label: '1930s Radio' },
                { id: 'robot', label: 'Cyber Droid' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setToneStyle(t.id as any)}
                  className={`py-2 px-2 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                    toneStyle === t.id
                      ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800/80 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-700 bg-slate-950/55 p-4 text-xs text-slate-400 space-y-3" aria-label="AI-created file intent preparation">
          <div className="flex items-center gap-2 font-bold text-slate-200"><ShieldCheck className="h-4 w-4 text-slate-400" /> AI-created-file intent — prepare locally, provider submission disabled</div>
          <p className="leading-relaxed">This creates an auditable, source-hash-bound intent only. No cloud/neural service is called and no audio or consent data leaves this browser. A reviewed server adapter, revocation/deletion controls, and a further explicit confirmation are required before any provider submission.</p>
          <p className="rounded-lg border border-slate-700 bg-slate-900/70 p-2 text-[11px] text-slate-200"><strong>Required output disclosure:</strong> AI-created candidate file — requires listening review; never replaces the source. Any future output is a separately labelled derived WAV, not an original recording or reusable voice model. Estimated cost: unavailable until a provider review; no provider is called here.</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="AI intent source type">
            <button type="button" onClick={() => setAiSourceMode('packaged')} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${aiSourceMode === 'packaged' ? 'border-amber-400 bg-amber-500/15 text-amber-100' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>Packaged source</button>
            <button type="button" onClick={() => setAiSourceMode('own-file')} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${aiSourceMode === 'own-file' ? 'border-emerald-400 bg-emerald-500/15 text-emerald-100' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>My own voice reference</button>
          </div>
          {aiSourceMode === 'packaged' ? <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2 text-[11px] text-amber-100">Selected packaged-source AI status: <strong>{originalSourceRecord(selectedBaseVoice.sourceId || selectedBaseVoice.baseSampleId)?.aiCreationStatus || 'not eligible'}</strong>. All bundled sources are deny-by-default until a documented performer/licence review allowlists the exact source hash.</p> : <label className="block rounded-lg border border-emerald-500/30 bg-emerald-950/15 p-2 text-[11px] text-emerald-100">Choose an audio file of your own voice. It is hashed locally for the consent-bound intent and is not uploaded or stored by this screen.<input type="file" accept="audio/*" className="mt-2 block w-full text-[11px] text-slate-300" onChange={event => { const file = event.target.files?.[0] || null; setAiOwnReference(file); setAiOwnReferenceHash(null); if (file) void sha256Blob(file).then(setAiOwnReferenceHash).catch(() => setAiIntentError('Could not hash the selected own-voice reference.')); }} />{aiOwnReference && <span className="mt-1 block font-mono text-[10px]">{aiOwnReference.name} · {aiOwnReferenceHash ? `SHA-256 ${aiOwnReferenceHash}` : 'hashing…'}</span>}</label>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <input aria-label="Speaker or rights holder" value={aiConsentHolder} onChange={event => setAiConsentHolder(event.target.value)} placeholder="Speaker or rights holder" className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white" />
            <input aria-label="Consent evidence" value={aiConsentEvidence} onChange={event => setAiConsentEvidence(event.target.value)} placeholder="Consent/release evidence reference" className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white" />
            <input aria-label="Retention end date" type="date" value={aiRetentionEndsAt} onChange={event => setAiRetentionEndsAt(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white" />
            <input aria-label="Proposed provider" value={aiProvider} onChange={event => setAiProvider(event.target.value)} placeholder="Reviewed provider name" className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white" />
            <input aria-label="Proposed model version" value={aiModelVersion} onChange={event => setAiModelVersion(event.target.value)} placeholder="Model version" className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white" />
            <input aria-label="Proposed script" value={aiScript} onChange={event => setAiScript(event.target.value)} placeholder="Requested script" className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white" />
          </div>
          <div className="flex flex-col gap-1 text-[11px] text-slate-300"><label className="flex items-start gap-2"><input type="checkbox" checked={aiPermitsDerived} onChange={event => setAiPermitsDerived(event.target.checked)} className="mt-0.5 accent-emerald-400" />I have an explicit release permitting AI-derived audio from this exact SHA-256 source.</label><label className="flex items-start gap-2"><input type="checkbox" checked={aiPermitsFreeLibrary} onChange={event => setAiPermitsFreeLibrary(event.target.checked)} className="mt-0.5 accent-emerald-400" />I have an explicit release permitting the stated free-library distribution.</label></div>
          <button type="button" onClick={() => void prepareAiIntent()} disabled={aiSourceMode === 'packaged' && originalSourceRecord(selectedBaseVoice.sourceId || selectedBaseVoice.baseSampleId)?.aiCreationStatus !== 'eligible'} className="rounded-lg border border-slate-500 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Create voice file with AI — prepare intent</button>
          {aiIntentError && <p role="alert" className="text-rose-300">{aiIntentError}</p>}
          {aiIntent && <div className="rounded-xl border border-amber-400/30 bg-amber-950/20 p-3 space-y-1 text-[11px] text-amber-100"><p className="font-bold">Prepared locally — state: {aiIntent.state}</p><p className="font-mono break-all">source SHA-256: {aiIntent.sourceHash}</p><p>{aiIntent.provider} · {aiIntent.modelVersion} · retention until {aiIntent.retentionEndsAt}</p><p>{aiIntent.disclosure}</p></div>}
        </section>

        {/* STEP 3: Voice Identity & Profile Customization */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-4">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">
              3
            </span>
            Customize Voice Identity &amp; Metadata:
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Name */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400">New Voice Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Liam Deep Cinema"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Archetype */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400">Vocal Archetype</label>
              <input
                type="text"
                value={archetype}
                onChange={(e) => setArchetype(e.target.value)}
                placeholder="e.g. Master Narrator"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Accent / Flag */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400">Accent &amp; Flag</label>
              <select
                value={flag}
                onChange={(e) => {
                  const selectedFlag = e.target.value;
                  setFlag(selectedFlag);
                  const opt = FLAG_OPTIONS.find((f) => f.flag === selectedFlag);
                  if (opt) setAccent(opt.accent);
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {FLAG_OPTIONS.map((f) => (
                  <option key={f.flag} value={f.flag}>
                    {f.flag} {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400">
              Personality &amp; Mood Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe personality, timbre, and mood..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Avatar Color Swatches */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-semibold text-slate-400 mr-2 flex items-center gap-1">
              <Palette className="w-3.5 h-3.5" /> Avatar Color:
            </span>
            {COLOR_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setAvatarColor(color)}
                className={`w-6 h-6 rounded-lg transition-transform cursor-pointer ${
                  avatarColor === color ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-950' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          {/* Audition Script */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400">
              {selectedBaseVoice.renderMode === 'source-clip-only' ? 'Profile script (not used by this finite source-clip variant)' : 'Vocalis Audition Script (Spoken Text Sample)'}
            </label>
            <textarea
              value={samplePhrase}
              onChange={(e) => setSamplePhrase(e.target.value)}
              disabled={selectedBaseVoice.renderMode === 'source-clip-only'}
              rows={2}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>

        {(selectedBaseVoice.renderMode === 'script-renderable' || selectedBaseVoice.synthesisMethod === 'recorded-units') ? <RoomEnvironmentStudio
          environmentId={environmentId}
          wet={roomWet}
          onEnvironmentChange={setEnvironmentId}
          onWetChange={setRoomWet}
          compact
        /> : <div className="rounded-xl border border-cyan-800/60 bg-cyan-950/15 p-3 text-xs text-cyan-100">Room Environment Studio is intentionally deferred for this source-clip candidate. First review the dry finite DSP variant against its protected original; room delivery is a separate rendered-file step, not part of reusable voice identity.</div>}

        {/* Real-time Oscilloscope Waveform Visualizer */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              Live Waveform Visualizer (Acoustic Output)
            </span>
            <span className="font-mono text-[10px]">
              {isAuditioning ? 'Auditioning shaped voice' : 'Ready'}
            </span>
          </div>
          <VoiceVisualizer isPlaying={isAuditioning} avatarColor={avatarColor} />
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-100">
          {selectedBaseVoice.renderMode === 'script-renderable' || selectedBaseVoice.synthesisMethod === 'recorded-units' ? <><span className="font-bold">Required validation route:</span> saving creates a separate <span className="font-mono">candidate</span> and renders this fixed script in <span className="font-semibold">Dry Reference</span> with the same locked voice definition/recipe used by exports. Room tests remain separate delivery treatments.<p className="mt-1.5 italic text-amber-200/80">“{VOICE_VALIDATION_SCRIPT}”</p></> : <><span className="font-bold">Finite source-clip route:</span> saving creates a separate dry WAV from the selected protected source recording. It cannot use this typed script or claim a reusable voice; review compares that finite variant directly against the original.</>}
        </div>

        {/* Action Controls: Audition & Save As New Voice & Sample */}
        <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <button
            onClick={handleAudition}
            className={`h-10 px-5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer ${
              isAuditioning
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 animate-pulse'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700'
            }`}
          >
            {isAuditioning ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" /> Stop Audition
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current text-indigo-400" /> Audition Sound Now
              </>
            )}
          </button>

          {/* Single Primary Merged Button: Save New Voice & Create Audio Sample */}
          <button
            onClick={handleSaveNewVoiceAndSample}
            disabled={isSavingAndExporting}
            className="h-10 px-6 rounded-xl font-bold text-xs bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 hover:brightness-110 text-white shadow-lg shadow-indigo-500/25 flex items-center gap-2 transition-all cursor-pointer"
          >
            {isSavingAndExporting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Creating Candidate &amp; Validation WAV...</span>
              </>
            ) : (
              <>
                <BookmarkCheck className="w-4 h-4" />
                <span>{selectedBaseVoice.renderMode === 'script-renderable' || selectedBaseVoice.synthesisMethod === 'recorded-units' ? 'Create Script Candidate & Dry Validation' : 'Create Source-Clip Variant'}</span>
              </>
            )}
          </button>
        </div>

        {/* Success Confirmation & WAV Download Card */}
        {saveSuccess && (
          <div className="p-5 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 space-y-4 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    Candidate "{name}" Created — Review Required
                  </h4>
                  <p className="text-xs text-emerald-300">
                    {createdModel?.renderMode === 'source-clip-only'
                      ? 'A finite derived source-clip WAV is in the vault. It is not eligible for arbitrary-text rendering.'
                      : 'A pinned Dry Reference validation take is in the vault. Review it before relying on this derived candidate for final work.'}
                  </p>
                  {validationResult && <div className="mt-1.5 space-y-1"><p className="font-mono text-[10px] text-emerald-400/80">{validationResult.manifest.request.voiceDefinitionId} · {validationResult.manifest.environment.recipeId}</p><audio controls src={validationResult.audioUrl} className="h-8 w-full max-w-sm" />{validationResult.manifest.quality.warnings.length > 0 && <p className="text-[10px] text-amber-200">Quality guard: {validationResult.manifest.quality.warnings.join(' ')}</p>}</div>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {savedTakeUrl && (
                  <a
                    href={savedTakeUrl}
                    download={`${name.toLowerCase().replace(/\s+/g, '-')}-sample.wav`}
                    className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Audio File (.wav)
                  </a>
                )}

                {createdModel?.reviewState !== 'approved' && (
                  <span className="max-w-44 text-[10px] leading-tight text-amber-100">Complete the seven listener ratings and notes in the Voice Library Review Queue before approval.</span>
                )}
                <button
                  onClick={() => onGoToHub(createdModel || currentDraftModel)}
                  className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow transition-colors cursor-pointer"
                >
                  <span>{createdModel?.reviewState === 'approved' ? 'Use Approved Voice' : 'Test Candidate'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {createdModel?.renderMode !== 'source-clip-only' && <div className="border-t border-emerald-500/20 pt-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h5 className="text-xs font-bold text-slate-100">Room treatment validation</h5>
                  <p className="mt-0.5 text-[11px] text-slate-400">Render the same fixed script using the Room Environment Studio selection, listen, then approve that exact room recipe independently.</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void handleRenderRoomValidation()} disabled={isRenderingRoomValidation} className="h-8 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 text-[11px] font-bold text-cyan-100 disabled:opacity-50">
                    {isRenderingRoomValidation ? 'Rendering…' : 'Render room validation'}
                  </button>
                  <button type="button" onClick={handleApproveRoom} disabled={!roomValidationResult || createdModel?.approvedEnvironmentRecipeIds?.includes(roomValidationResult.manifest.environment.recipeId)} className="h-8 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 text-[11px] font-bold text-emerald-100 disabled:opacity-40">
                    Approve room after review
                  </button>
                </div>
              </div>
              {roomValidationResult && <div className="mt-2 space-y-2"><p className="font-mono text-[10px] text-cyan-300">Validated room: {roomValidationResult.manifest.environment.recipeId}</p><audio controls src={roomValidationResult.audioUrl} className="h-8 w-full" /></div>}
            </div>}
          </div>
        )}
      </div>
    </div>
  );
};
