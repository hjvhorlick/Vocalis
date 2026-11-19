import React from 'react';
import { auditionSourceRecording, stopSpeaking, VoiceModelConfig } from '../utils/naturalVoiceEngine';
import { speakerForModel } from '../utils/cmuDiphoneSynthesizer';
import { downloadVerifiedOriginalSource } from '../utils/voiceProvenance';

export function VoiceSourceNote({ model }: { model: VoiceModelConfig }) {
  const userBank = model.synthesisMethod === 'recorded-units';
  return <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-slate-300 space-y-2">
    <p>{model.renderMode === 'source-clip-only' && model.sourceType === 'derived'
      ? 'Variant mode: this is a finite derived WAV of the protected source clip. It uses a decoded working copy and never claims to speak new text or become a reusable voice bank.'
      : model.renderMode === 'source-clip-only'
      ? 'Original source mode: this protected short recording is available for unprocessed reference playback/download only. There is no matching packaged voice bank, so it cannot truthfully narrate arbitrary new text.'
      : userBank
      ? 'Speech source: your recorded sound bank. New text uses only its labelled units. Missing sounds or unknown pronunciations stop rendering. Derived pitch/rate renders use bounded resampling plus WSOLA duration correction; the stored recordings are never overwritten.'
      : model.synthesisMethod === 'formant'
        ? 'Speech source: experimental mathematical formant synthesis. This is not a human recording.'
        : `Script source: packaged CMU ARCTIC ${speakerForModel(model).toUpperCase()} recorded units. The separately listed original clip remains an unprocessed reference; this profile does not claim a new recorded speaker. Missing units may use mathematical sounds.`}</p>
    {!userBank && <div className="flex flex-wrap gap-4"><button type="button" onClick={() => void auditionSourceRecording(model)} className="text-amber-200 underline underline-offset-2">Listen to original recording — unprocessed</button><button type="button" onClick={() => void downloadVerifiedOriginalSource(model).catch(error => window.dispatchEvent(new CustomEvent('vocalis-speech-error', { detail: error instanceof Error ? error.message : 'Original source download failed.' })))} className="text-amber-200 underline underline-offset-2">Download verified original</button><button type="button" onClick={stopSpeaking} className="text-slate-400 underline underline-offset-2">Stop audio</button></div>}
  </div>;
}
