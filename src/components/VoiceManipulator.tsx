import React, { useState } from 'react';
import {
  VoiceModelConfig,
  NATURAL_HUMAN_SAMPLES,
  playRecordedVoice,
  recordingFor,
  speakRealWords,
  stopSpeaking,
} from '../utils/naturalVoiceEngine';
import { VoiceVisualizer } from './VoiceVisualizer';
import {
  Sliders,
  Volume2,
  Square,
  Play,
  RotateCcw,
  BookmarkPlus,
  Check,
  Waves,
  User,
  Activity,
} from 'lucide-react';

/**
 * The settings that leave the recording untouched. A solo test is built on these,
 * not on whatever the sliders happen to say, so "pitch down" means pitch down and
 * nothing else.
 */
const NEUTRAL_SETTINGS: Partial<VoiceModelConfig> = {
  pitch: 1,
  rate: 1,
  volume: 1,
  toneStyle: 'natural',
  accent: 'US',
  throatWarmth: 0,
  oralClarity: 0,
  airPresence: 0,
  referenceRaw: true,
  synthesisMethod: 'cmu-arctic',
};

/**
 * Every adjustment the application can make, each one on its own, with the reason a
 * person would reach for it and what it costs. This list is the panel: if a control
 * is in the voice profile and not here, it is because it does nothing, and the note
 * at the bottom names those.
 *
 * The suite measures the direction each of these moves the audio
 * (`tests/renderSpeech.test.ts`, "changes the generated audio"), under both timings.
 */
interface SoloTest {
  id: string;
  control: string;
  setting: string;
  overrides: Partial<VoiceModelConfig>;
  /** What the listener is being asked to judge. */
  listenFor: string;
  verdict: string;
}

const SOLO_TESTS: SoloTest[] = [
  {
    id: 'pitch-down',
    control: 'Pitch',
    setting: '0.72×',
    overrides: { pitch: 0.72 },
    listenFor: 'a deeper speaker — and whether the vowels start to buzz',
    verdict: 'Drops the pitch without changing how long the words take. Below about 0.7 the voice cycle is stretched far enough that the sound thickens.',
  },
  {
    id: 'pitch-up',
    control: 'Pitch',
    setting: '1.40×',
    overrides: { pitch: 1.4 },
    listenFor: 'a higher speaker — and whether it turns thin or metallic',
    verdict: 'Raises the pitch at the same speed. The recordings are one voice, so this is the strongest test of whether the grain survives.',
  },
  {
    id: 'rate-down',
    control: 'Pace',
    setting: '0.70×',
    overrides: { rate: 0.7 },
    listenFor: 'a slower reader — and whether the sounds smear into each other',
    verdict: 'Stretches the render. Every sound is rebuilt by overlap-add, which is where a drawn-out vowel turns watery.',
  },
  {
    id: 'rate-up',
    control: 'Pace',
    setting: '1.40×',
    overrides: { rate: 1.4 },
    listenFor: 'a quicker reader — and whether consonants go missing',
    verdict: 'Compresses the render. This one usually survives better than 0.70×, because cutting is cleaner than stretching.',
  },
  {
    id: 'volume',
    control: 'Volume',
    setting: '35%',
    overrides: { volume: 0.35 },
    listenFor: 'the same voice, quieter — the timbre should not change at all',
    verdict: 'A gain, applied after everything else. If this one sounds different beyond level, the problem is not the gain.',
  },
  {
    id: 'deep',
    control: 'Character',
    setting: 'Deep Cinema',
    overrides: { toneStyle: 'deep' },
    listenFor: 'a lower, slower delivery',
    verdict: 'Pitch ×0.92 and pace ×0.92 on top of the recording. A character, not a different speaker.',
  },
  {
    id: 'energetic',
    control: 'Character',
    setting: 'High Energy',
    overrides: { toneStyle: 'energetic' },
    listenFor: 'a brighter, faster delivery',
    verdict: 'Pitch ×1.06 and pace ×1.10. The mildest of the six characters.',
  },
  {
    id: 'whisper',
    control: 'Character',
    setting: 'Soft Whisper',
    overrides: { toneStyle: 'whisper' },
    listenFor: 'a thinner, breathier version — it is a filter, not real whispering',
    verdict: 'A high-pass and a level cut before the output gain, so it ends up brighter and quieter rather than actually whispered.',
  },
  {
    id: 'radio',
    control: 'Character',
    setting: '1930s Radio',
    overrides: { toneStyle: 'radio' },
    listenFor: 'a narrow, gritty band — the most obviously altered setting here',
    verdict: 'High-pass, saturation and a level cut. The largest colour change on the panel and the easiest one to hear working.',
  },
  {
    id: 'robot',
    control: 'Character',
    setting: 'Cyber Droid',
    overrides: { toneStyle: 'robot' },
    listenFor: 'a ring-modulated version at 34 Hz',
    verdict: 'Multiplies the signal by a slow sine. Purely an effect; it does not pretend to be a droid voice.',
  },
  {
    id: 'throat',
    control: 'Resonance',
    setting: 'Throat +10 dB',
    overrides: { throatWarmth: 10 },
    listenFor: 'more weight in the chest register around 450 Hz',
    verdict: 'One peaking filter at 450 Hz. Measured to move the audio; whether it sounds better is the listener\'s call.',
  },
  {
    id: 'oral',
    control: 'Resonance',
    setting: 'Oral +10 dB',
    overrides: { oralClarity: 10 },
    listenFor: 'a more forward, present midrange around 1.8 kHz',
    verdict: 'One peaking filter at 1.8 kHz. On speech recorded close to the microphone this is the band that carries intelligibility.',
  },
  {
    id: 'air',
    control: 'Resonance',
    setting: 'Air +10 dB',
    overrides: { airPresence: 10 },
    listenFor: 'more hiss and breath above 4.2 kHz',
    verdict: 'One peaking filter at 4.2 kHz. The recording has very little energy up there, so this adds air rather than detail.',
  },
  {
    id: 'accent-uk',
    control: 'Accent',
    setting: 'British',
    overrides: { accent: 'UK' },
    listenFor: 'the R disappearing in “car” and “park”',
    verdict: 'A rule over the phone stream, not a filter. It only changes words that contain a post-vocalic R, so the sample sentence matters.',
  },
  {
    id: 'accent-au',
    control: 'Accent',
    setting: 'Australian',
    overrides: { accent: 'AU' },
    listenFor: 'the same R rule with the Australian vowel set',
    verdict: 'Same mechanism as British, with its own vowel table. Both run on American recordings, so this is a rule, not a regional speaker.',
  },
  {
    id: 'rhythm',
    control: 'Timing',
    setting: 'Rhythm engine',
    overrides: { referenceRaw: false },
    listenFor: 'the same words at a human pace — and whether the joins crackle',
    verdict: 'The unit timing model: faster, closer to a human reading, and the one setting that can introduce a mechanical edge at the joins.',
  },
];

/** One plain sentence for what a voice is currently set to. */
function describeSettings(model: VoiceModelConfig): string {
  const parts: string[] = [model.referenceRaw === false ? 'rhythm engine timing' : 'recorded timing'];
  if (Math.abs(model.pitch - 1) > 0.001) parts.push(`pitch ${model.pitch.toFixed(2)}×`);
  if (Math.abs(model.rate - 1) > 0.001) parts.push(`pace ${model.rate.toFixed(2)}×`);
  if (Math.abs(model.volume - 1) > 0.001) parts.push(`volume ${Math.round(model.volume * 100)}%`);
  if (model.toneStyle !== 'natural') parts.push(model.toneStyle);
  if (model.accent !== 'US') parts.push(model.accent);
  for (const [field, label] of [
    ['throatWarmth', 'throat'],
    ['oralClarity', 'oral'],
    ['airPresence', 'air'],
  ] as const) {
    const value = model[field] ?? 0;
    if (Math.abs(value) > 0.01) parts.push(`${label} ${value > 0 ? '+' : ''}${value} dB`);
  }
  return parts.length === 1 ? 'nothing applied' : parts.join(', ');
}

interface VoiceManipulatorProps {
  voice: VoiceModelConfig;
  onUpdateVoice: (updated: VoiceModelConfig) => void;
  onSaveAsCustom: (saved: VoiceModelConfig) => void;
  onResetToDefault: () => void;
}

export const VoiceManipulator: React.FC<VoiceManipulatorProps> = ({
  voice,
  onUpdateVoice,
  onSaveAsCustom,
  onResetToDefault,
}) => {
  const [isAuditioning, setIsAuditioning] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [soloId, setSoloId] = useState(SOLO_TESTS[0].id);
  const [lastHeard, setLastHeard] = useState<string | null>(null);

  const speak = (model: VoiceModelConfig, label: string) => {
    stopSpeaking();
    setIsAuditioning(true);
    setLastHeard(label);
    speakRealWords(model.samplePhrase, model, {
      onStart: () => setIsAuditioning(true),
      onEnd: () => setIsAuditioning(false),
      onError: () => setIsAuditioning(false),
    });
  };

  const handleAudition = () => {
    if (isAuditioning) {
      stopSpeaking();
      setIsAuditioning(false);
      setLastHeard(null);
      return;
    }
    speak(voice, `the voice as it is set now — ${describeSettings(voice)}`);
  };

  /**
   * The settings that change nothing, restated here so a solo test starts from the
   * recording whatever the sliders currently say. This is the whole point of the
   * panel: hear the original, then hear one control on top of it, and decide.
   */
  const original = (): VoiceModelConfig => ({ ...voice, ...NEUTRAL_SETTINGS });

  const hearOne = (overrides: Partial<VoiceModelConfig>, label: string) =>
    speak({ ...original(), ...overrides }, label);

  const handleSave = () => {
    const customCopy: VoiceModelConfig = {
      ...voice,
      id: voice.isCustom ? voice.id : `custom-${Date.now()}`,
      name: voice.isCustom ? voice.name : `${voice.name} (Custom DSP)`,
      isCustom: true,
    };
    onSaveAsCustom(customCopy);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5">
      {/* Manipulator Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg text-white shadow-md shrink-0"
            style={{ backgroundColor: voice.avatarColor }}
          >
            {voice.flag || voice.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-400">
                Manipulating Acoustic Voice:
              </span>
              <span className="text-base font-bold text-white">{voice.name}</span>
              {voice.isCustom && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Custom
                </span>
              )}
            </div>
            <p className="text-xs text-indigo-400 font-medium">
              {voice.archetype} &bull; Web Audio DSP Shaper &bull; {voice.gender}
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onResetToDefault}
            className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Reset sliders to default"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Voice
          </button>

          <button
            onClick={handleSave}
            className="text-xs font-semibold px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow transition-colors cursor-pointer"
          >
            {savedToast ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Saved to Predefined!
              </>
            ) : (
              <>
                <BookmarkPlus className="w-3.5 h-3.5" /> Save as Custom Voice
              </>
            )}
          </button>
        </div>
      </div>

      {/* Source Natural Voice Selection */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-indigo-400" />
            Base Human Voice Source (Clean Studio Acoustic Recording)
          </label>
          <span className="text-[10px] text-emerald-400 font-mono">100% Non-AI Human</span>
        </div>

        <select
          value={voice.baseSampleId}
          onChange={(e) => onUpdateVoice({ ...voice, baseSampleId: e.target.value })}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-medium focus:ring-1 focus:ring-indigo-500"
        >
          {NATURAL_HUMAN_SAMPLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.speaker}) &bull; "{s.transcript}"
            </option>
          ))}
        </select>
        <p className="text-[10px] text-slate-500">
          Source: CMU ARCTIC Speech Corpus (Carnegie Mellon University). Free open scientific data.
        </p>
      </div>

      {/* What this panel is, and the two structural switches */}
      <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-emerald-300">
              Effects panel — {voice.name}
            </span>
            <p className="text-[10px] text-slate-400 leading-relaxed mt-1 max-w-2xl">
              The voice you selected is the recording, and every control on this panel starts at the
              setting that changes nothing: pitch 1.00, pace 1.00, full volume, natural delivery,
              all three resonance bands at 0 dB, American English, recorded timing. Move one control
              and only that one is applied, so you can hear what it does to the recording on its own.
              Each of them is checked in the test suite to reach the audio; the ones that do not are
              listed at the bottom of this panel rather than left on it.
            </p>
          </div>
          <button
            type="button"
            onClick={onResetToDefault}
            className="shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-500 transition-colors cursor-pointer"
            title="Back to the recording with nothing applied"
          >
            Reset to the original
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1.5">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Timing
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => onUpdateVoice({ ...voice, referenceRaw: true })}
                className={`flex-1 py-1.5 px-2 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                  voice.referenceRaw === false
                    ? 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600'
                    : 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                }`}
              >
                Recorded
              </button>
              <button
                type="button"
                onClick={() => onUpdateVoice({ ...voice, referenceRaw: false })}
                className={`flex-1 py-1.5 px-2 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                  voice.referenceRaw === false
                    ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600'
                }`}
              >
                Rhythm engine
              </button>
            </div>
            <p className="text-[9px] text-slate-500 leading-relaxed">
              {voice.referenceRaw === false
                ? 'A duration model shortens and lengthens each sound and re-times it on the voice cycle. Faster, closer to the human reading, rougher.'
                : 'Each sound keeps the length it was recorded at and the recorded audio reaches the output verbatim. This is the default.'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1.5">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Where the sound comes from
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => onUpdateVoice({ ...voice, synthesisMethod: 'cmu-arctic' })}
                className={`flex-1 py-1.5 px-2 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                  (voice.synthesisMethod ?? 'cmu-arctic') === 'cmu-arctic'
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600'
                }`}
              >
                Recorded units
              </button>
              <button
                type="button"
                onClick={() => onUpdateVoice({ ...voice, synthesisMethod: 'formant' })}
                className={`flex-1 py-1.5 px-2 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                  voice.synthesisMethod === 'formant'
                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600'
                }`}
              >
                Formant experiment
              </button>
            </div>
            <p className="text-[9px] text-slate-500 leading-relaxed">
              {voice.synthesisMethod === 'formant'
                ? 'Generated from a glottal-pulse model, not from the recordings. Kept as a labelled experiment; it does not sound like the speaker.'
                : 'The licensed CMU ARCTIC recordings, cut into units and joined for your text. This is the product.'}
            </p>
          </div>
        </div>
      </div>

      {/* Hear one adjustment at a time, against the original ---------------- */}
      <div className="rounded-2xl border border-indigo-500/40 bg-indigo-500/5 p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-indigo-300">
              Hear each adjustment on its own
            </span>
            <p className="text-[10px] text-slate-400 leading-relaxed mt-1 max-w-2xl">
              Three different things, and they are not the same: <b className="text-emerald-300">The
              recording</b> is the licensed WAV played as it is. <b className="text-slate-300">Rebuilt,
              nothing applied</b> is what this application produces from that recording's pieces with
              every control neutral — same words, but assembled, normalised and joined, so it is
              already the application's version of the voice. <b className="text-indigo-300">With this
              one change</b> adds exactly one adjustment from the list. Use the first two to hear what
              the pipeline itself costs, then the third to judge individual effects against it.
            </p>
          </div>
          <span className="text-[10px] font-mono text-slate-500">
            {SOLO_TESTS.length} adjustments, each alone on the recording
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            value={soloId}
            onChange={(e) => setSoloId(e.target.value)}
            className="sm:col-span-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-medium focus:ring-1 focus:ring-indigo-500"
          >
            {SOLO_TESTS.map((test) => (
              <option key={test.id} value={test.id}>
                {test.control} — {test.setting}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={async () => {
              // The file itself, straight to the speakers: no pitch, no rate, no EQ,
              // no normalising gain, no graph. Everything else on this panel is built
              // from this recording's pieces, and on `slt a0001` a rebuilt render is
              // 4.94 s against the file's 3.36 s - so if the rebuilt version sounds
              // worse, this is how you hear where the loss comes in.
              stopSpeaking();
              setIsAuditioning(true);
              setLastHeard('the recording file, untouched');
              await playRecordedVoice(voice, {
                onEnd: () => setIsAuditioning(false),
                onError: () => setIsAuditioning(false),
              });
            }}
            className="py-2 px-3 rounded-xl text-xs font-semibold border border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
            title="The licensed WAV, played as it is"
          >
            ▶ The recording
          </button>

          <button
            type="button"
            onClick={() => speak(original(), 'rebuilt from the recording, nothing applied')}
            className="py-2 px-3 rounded-xl text-xs font-semibold border border-slate-600 bg-slate-800/60 text-slate-200 hover:bg-slate-700/60 transition-colors cursor-pointer"
            title="The pipeline's own output with every control neutral"
          >
            ▶ Rebuilt, nothing applied
          </button>

          <button
            type="button"
            onClick={() => {
              const test = SOLO_TESTS.find((t) => t.id === soloId);
              if (test) hearOne(test.overrides, `${test.control} ${test.setting} — one change on the original`);
            }}
            className="py-2 px-3 rounded-xl text-xs font-semibold border border-indigo-500/50 bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/25 transition-colors cursor-pointer"
          >
            ▶ With this one change
          </button>
        </div>

        {(() => {
          const test = SOLO_TESTS.find((t) => t.id === soloId) ?? SOLO_TESTS[0];
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] leading-relaxed">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <span className="block font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Listen for
                </span>
                <span className="text-slate-300">{test.listenFor}</span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <span className="block font-bold uppercase tracking-wider text-slate-400 mb-1">
                  What it is, honestly
                </span>
                <span className="text-slate-400">{test.verdict}</span>
              </div>
            </div>
          );
        })()}

        <p className="text-[10px] text-slate-500 leading-relaxed">
          The recording is <b className="text-slate-400">{recordingFor(voice).name}</b> — it says
          &ldquo;{recordingFor(voice).transcript}&rdquo;. That is the sentence, not your script, which
          is why the other two buttons use the same words for the comparison to mean anything.
        </p>
        <p className="text-[10px] text-slate-500">
          {isAuditioning
            ? `Playing: ${lastHeard ?? 'audio'}`
            : lastHeard
              ? `Last played: ${lastHeard}`
              : 'Nothing playing. The sentence is the recording\'s own transcript, so the comparison is like for like.'}
          {isAuditioning && (
            <button
              type="button"
              onClick={() => {
                stopSpeaking();
                setIsAuditioning(false);
              }}
              className="ml-2 text-rose-400 hover:text-rose-300 underline cursor-pointer"
            >
              stop
            </button>
          )}
        </p>
      </div>

      {/* Main Sliders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pitch Slider */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-300">Vocal Pitch Height</span>
            <span className="font-mono text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
              {voice.pitch.toFixed(2)}x
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="1.75"
            step="0.05"
            value={voice.pitch}
            onChange={(e) => onUpdateVoice({ ...voice, pitch: parseFloat(e.target.value) })}
            className="w-full accent-cyan-500 h-1.5 bg-slate-900 rounded cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-medium">
            <span>0.50x (Deep Bass)</span>
            <span>1.0x (Natural)</span>
            <span>1.75x (Soprano)</span>
          </div>
        </div>

        {/* Speed / Rate Slider */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-300">Speech Cadence Rate</span>
            <span className="font-mono text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
              {voice.rate.toFixed(2)}x
            </span>
          </div>
          <input
            type="range"
            min="0.6"
            max="1.5"
            step="0.05"
            value={voice.rate}
            onChange={(e) => onUpdateVoice({ ...voice, rate: parseFloat(e.target.value) })}
            className="w-full accent-indigo-500 h-1.5 bg-slate-900 rounded cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-medium">
            <span>0.60x (Deliberate)</span>
            <span>1.0x (Standard)</span>
            <span>1.50x (Brisk Pacing)</span>
          </div>
        </div>

        {/* Volume Output */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-300">Volume Output</span>
            <span className="font-mono text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              {Math.round(voice.volume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.2"
            max="1.0"
            step="0.05"
            value={voice.volume}
            onChange={(e) => onUpdateVoice({ ...voice, volume: parseFloat(e.target.value) })}
            className="w-full accent-amber-500 h-1.5 bg-slate-900 rounded cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-medium">
            <span>20% (Subtle)</span>
            <span>100% (Full Level)</span>
          </div>
        </div>
      </div>

      {/* Vocal Tract Formant Resonance Filters (F1, F2, F3) */}
      <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Waves className="w-3.5 h-3.5 text-cyan-400" />
            Resonance &amp; Timbre — applies to the source-recording audition
          </label>
          <span className="text-[10px] text-slate-500 font-mono">biquad EQ, audition path</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* F1 Throat Warmth */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Throat & Chest Warmth (F1 450Hz)</span>
              <span className="font-mono text-cyan-300 font-bold">
                {(voice.throatWarmth ?? 0) > 0 ? `+${voice.throatWarmth}` : voice.throatWarmth ?? 0} dB
              </span>
            </div>
            <input
              type="range"
              min="-10"
              max="10"
              step="1"
              value={voice.throatWarmth ?? 0}
              onChange={(e) =>
                onUpdateVoice({ ...voice, throatWarmth: parseFloat(e.target.value) })
              }
              className="w-full accent-cyan-400 h-1 bg-slate-900 rounded cursor-pointer"
            />
          </div>

          {/* F2 Oral Clarity */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Oral Cavity Clarity (F2 1.8kHz)</span>
              <span className="font-mono text-indigo-300 font-bold">
                {(voice.oralClarity ?? 0) > 0 ? `+${voice.oralClarity}` : voice.oralClarity ?? 0} dB
              </span>
            </div>
            <input
              type="range"
              min="-10"
              max="10"
              step="1"
              value={voice.oralClarity ?? 0}
              onChange={(e) =>
                onUpdateVoice({ ...voice, oralClarity: parseFloat(e.target.value) })
              }
              className="w-full accent-indigo-400 h-1 bg-slate-900 rounded cursor-pointer"
            />
          </div>

          {/* F3 Air Presence */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Air & Breath Presence (F3 4.2kHz)</span>
              <span className="font-mono text-purple-300 font-bold">
                {(voice.airPresence ?? 0) > 0 ? `+${voice.airPresence}` : voice.airPresence ?? 0} dB
              </span>
            </div>
            <input
              type="range"
              min="-10"
              max="10"
              step="1"
              value={voice.airPresence ?? 0}
              onChange={(e) =>
                onUpdateVoice({ ...voice, airPresence: parseFloat(e.target.value) })
              }
              className="w-full accent-purple-400 h-1 bg-slate-900 rounded cursor-pointer"
            />
          </div>
        </div>

        <p className="text-[10px] text-slate-500 leading-relaxed">
          Three peaking filters — 450 Hz, 1800 Hz and 4200 Hz — applied to generated speech and to
          the audition alike, at 0 dB by default, which is a pass-through: at zero they do not touch
          a single sample. They are fixed bands, not a vocal tract, so they colour the voice rather
          than change how it is made; the labels used to call them formants F1/F2/F3, which promised
          more than three EQs deliver (finding D10 in <code>docs/APPLICATION_AUDIT.md</code>).
        </p>
      </div>

      {/* Tone Style Mode */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
          Acoustic Tone & Delivery Mode
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
              onClick={() => onUpdateVoice({ ...voice, toneStyle: t.id as any })}
              className={`py-2 px-2 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                voice.toneStyle === t.id
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Accent: the only control that changes the words rather than the sound */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
          Regional rules over the text
        </label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: 'US', label: 'American', note: 'as recorded' },
            { id: 'UK', label: 'British', note: 'drops post-vocalic R, lengthens some vowels' },
            { id: 'AU', label: 'Australian', note: 'as British, plus its own vowel rules' },
          ] as const).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onUpdateVoice({ ...voice, accent: a.id })}
              title={a.note}
              className={`py-2 px-2 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                voice.accent === a.id
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800/60'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Both recordings are American, so <b>American changes nothing</b> — it is the default and
          the only setting that leaves the text alone. British and Australian rewrite the phone
          stream before it is looked up, which you hear only on words that carry a rule: “car park”
          loses its R, “dance” changes vowel. On a sentence with no such word the render is
          identical, and that is measured rather than assumed.
        </p>
      </div>

      {/* What is on this panel, and what is not */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-1.5">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
          What each control reaches
        </span>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Applied to generated speech, one at a time, and each one is asserted to change the output
          samples in <code>tests/renderSpeech.test.ts</code>: pitch, pace, volume, delivery
          character, the three resonance bands, the accent, the timing switch and the sound source.
        </p>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          <b className="text-slate-400">Not on this panel, because it does nothing:</b> the
          “Global” accent, which is a filter label in the voice list used by no synthesis rule, and
          per-voice “formant” modelling — three fixed EQ bands are not a vocal tract. Both are
          recorded in <code>docs/APPLICATION_AUDIT.md</code> rather than given a slider that lies.
        </p>
      </div>

      {/* Real-time Oscilloscope Waveform Visualizer */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            Live Acoustic Oscilloscope Output
          </span>
          <span className="font-mono text-[10px]">
            {isAuditioning ? 'Playing converted voice' : 'Idle'}
          </span>
        </div>
        <VoiceVisualizer isPlaying={isAuditioning} avatarColor={voice.avatarColor} />
      </div>

      {/* Audition Bar for the Manipulated Voice */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Spoken Sentence (Natural Human Voice):</span>
          </div>
          <p className="text-xs text-slate-200 font-medium">"{voice.samplePhrase}"</p>
        </div>

        <button
          onClick={handleAudition}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all shrink-0 cursor-pointer ${
            isAuditioning
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 animate-pulse'
              : 'bg-gradient-to-r from-indigo-500 to-cyan-500 hover:brightness-110 text-white shadow-indigo-500/25'
          }`}
        >
          {isAuditioning ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" /> Stop Audio
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" /> Hear Transformed Voice
            </>
          )}
        </button>
      </div>
    </div>
  );
};
