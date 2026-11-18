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
import { saveDerivedAsset, updateVoiceAssetReview } from '../utils/voiceAssetStorage';

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
    `A distinct custom voice sculpted from ${activeVoice.name} with custom pitch transposition and formant EQ.`
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
    baseVoiceId: voices.find((v) => v.id === selectedBaseId)?.baseVoiceId || 'slt',
    realSpeakerName: voices.find((v) => v.id === selectedBaseId)?.realSpeakerName || 'Original Speaker',
    accent,
    flag,
    pitch,
    rate,
    volume,
    throatWarmth,
    oralClarity,
    airPresence,
    toneStyle,
    samplePhrase: samplePhrase.trim() || 'Hello, I am a newly created voice in Vocalis.',
    avatarColor,
    isCustom: true,
    sourceType: 'derived',
    parentVoiceDefinitionId: selectedBaseId,
    sourceId: voices.find(v => v.id === selectedBaseId)?.sourceId || voices.find(v => v.id === selectedBaseId)?.baseSampleId,
    originalSourceHash: voices.find(v => v.id === selectedBaseId)?.originalSourceHash,
    recipeId: `derived-local-v1:${selectedBaseId}:p${pitch.toFixed(2)}:r${rate.toFixed(2)}:tw${throatWarmth.toFixed(1)}:oc${oralClarity.toFixed(1)}:ap${airPresence.toFixed(1)}:${toneStyle}`,
    reviewState: 'candidate',
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
    setToneStyle('natural');
  };

  // Create a separate reviewable candidate. The base/original definition is never
  // overwritten, and the mandatory validation take is a pinned dry contract render.
  const handleSaveNewVoiceAndSample = async () => {
    setIsSavingAndExporting(true);
    try {
      const finalModel: VoiceModelConfig = {
        ...currentDraftModel,
        id: `custom-voice-${Date.now()}`,
        reviewState: 'candidate',
      };
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
      await saveDerivedAsset({
        id: `asset-${finalModel.id}`,
        role: 'dsp-variant',
        profileId: finalModel.id,
        parentAssetId: result.manifest.voice.sourceId ? `original-source-${result.manifest.voice.sourceId}` : undefined,
        sourceId: result.manifest.voice.sourceId,
        sourceHash: result.manifest.voice.sourceHash,
        audioHash: result.manifest.outputHash || '',
        createdAt: result.manifest.createdAt,
        reviewState: 'candidate',
        immutableOriginal: false,
        disclosure: 'Derived local DSP candidate; separate from its protected original source.',
        rendererManifest: result.manifest,
      });
      await onSaveTake(renderResultToGeneratedTake(result, `take-${Date.now()}`));

      setSavedTakeUrl(result.audioUrl);
      setSavedTakeDuration(result.duration);
      setSaveSuccess(true);
    } catch (err) {
      console.error('Failed to create voice candidate and validation take:', err);
    } finally {
      setIsSavingAndExporting(false);
    }
  };

  const handleApproveCandidate = async () => {
    if (!createdModel || !validationResult || validationResult.manifest.request.voiceRecipeId !== createdModel.recipeId) return;
    const approved = {
      ...createdModel,
      reviewState: 'approved' as const,
      validatedRecipeId: validationResult.manifest.request.voiceRecipeId,
      approvedEnvironmentRecipeIds: [...new Set([...(createdModel.approvedEnvironmentRecipeIds || []), validationResult.manifest.environment.recipeId])],
    };
    try {
      await updateVoiceAssetReview(`asset-${createdModel.id}`, 'approved');
      onSaveModel(approved);
      setCreatedModel(approved);
    } catch (error) {
      console.error('Could not record candidate approval:', error);
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

          <p className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-[11px] leading-relaxed text-slate-400">Pitch is a bounded resample plus WSOLA duration correction; pace sets the independent target duration. The spectral controls below are fixed-frequency EQ, not measured vocal-tract or speaker-identity modelling. Device effects are delivery colour, not a claim of a new human speaker.</p>

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
                min="0.5"
                max="1.8"
                step="0.05"
                value={pitch}
                onChange={(e) => setPitch(parseFloat(e.target.value))}
                className="w-full accent-cyan-400 h-1.5 bg-slate-950 rounded cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>0.5x (Deep Baritone)</span>
                <span>1.0x</span>
                <span>1.8x (Bright Soprano)</span>
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
                min="0.5"
                max="1.6"
                step="0.05"
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value))}
                className="w-full accent-indigo-400 h-1.5 bg-slate-950 rounded cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>0.5x (Slow/Thoughtful)</span>
                <span>1.0x</span>
                <span>1.6x (Rapid Delivery)</span>
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

        <div className="rounded-2xl border border-slate-700 bg-slate-950/55 p-4 text-xs text-slate-400">
          <div className="flex items-center gap-2 font-bold text-slate-200"><ShieldCheck className="h-4 w-4 text-slate-400" /> AI-created file boundary — disabled in this local build</div>
          <p className="mt-1.5 leading-relaxed">No cloud or neural voice service runs from this studio. A future AI-created WAV workflow must show the exact source hash, rights/release, model version, retention period, intended use and AI disclosure, then require explicit confirmation before any provider receives data. It can only create a separately labelled candidate file and can never replace an original.</p>
        </div>

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
              Vocalis Audition Script (Spoken Text Sample)
            </label>
            <textarea
              value={samplePhrase}
              onChange={(e) => setSamplePhrase(e.target.value)}
              rows={2}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <RoomEnvironmentStudio
          environmentId={environmentId}
          wet={roomWet}
          onEnvironmentChange={setEnvironmentId}
          onWetChange={setRoomWet}
          compact
        />

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
          <span className="font-bold">Required validation route:</span> saving creates a separate <span className="font-mono">candidate</span> and renders this fixed script in <span className="font-semibold">Dry Reference</span> with the same locked voice definition/recipe used by exports. Room tests remain separate delivery treatments.
          <p className="mt-1.5 italic text-amber-200/80">“{VOICE_VALIDATION_SCRIPT}”</p>
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
                <span>Create Candidate &amp; Dry Validation Take</span>
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
                    A pinned Dry Reference validation take is in the vault. Review it before relying on this derived candidate for final work.
                  </p>
                  {validationResult && <div className="mt-1.5 space-y-1"><p className="font-mono text-[10px] text-emerald-400/80">{validationResult.manifest.request.voiceDefinitionId} · {validationResult.manifest.environment.recipeId}</p><audio controls src={validationResult.audioUrl} className="h-8 w-full max-w-sm" /></div>}
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
                  <button
                    onClick={handleApproveCandidate}
                    className="h-9 px-4 rounded-xl border border-amber-400/60 bg-amber-500/15 hover:bg-amber-500/25 text-amber-100 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Confirm you listened to the Dry Reference validation take and approve this candidate version"
                  >
                    <Check className="w-3.5 h-3.5" /> Approve after review
                  </button>
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
            <div className="border-t border-emerald-500/20 pt-4">
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
