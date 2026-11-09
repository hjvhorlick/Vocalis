import React from 'react';
import { auditionSourceRecording, stopSpeaking, VoiceModelConfig } from '../utils/naturalVoiceEngine';
import { speakerForModel } from '../utils/cmuDiphoneSynthesizer';

export function VoiceSourceNote({ model }: { model: VoiceModelConfig }) {
  const userBank = model.synthesisMethod === 'recorded-units';
  return <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-slate-300 space-y-2">
    <p>{userBank
      ? 'Speech source: your recorded sound bank. New text uses only its labelled units. Missing sounds or unknown pronunciations stop rendering. Pitch/rate tuning currently uses coupled playback adjustments.'
      : model.synthesisMethod === 'formant'
        ? 'Speech source: experimental mathematical formant synthesis. This is not a human recording.'
        : `Speech source: CMU ARCTIC ${speakerForModel(model).toUpperCase()} recorded units. This profile adjusts a base voice; it is not a separate recorded speaker. Regional accents are approximate. Missing units may use mathematical sounds.`}</p>
    {!userBank && <div className="flex flex-wrap gap-4"><button type="button" onClick={() => void auditionSourceRecording(model)} className="text-amber-200 underline underline-offset-2">Listen to original source clip (not typed text)</button><button type="button" onClick={stopSpeaking} className="text-slate-400 underline underline-offset-2">Stop audio</button></div>}
  </div>;
}
