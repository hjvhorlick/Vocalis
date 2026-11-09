import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { VoiceCredits } from './VoiceCredits';

export const SourceVoiceAttribution: React.FC = () => (
  <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
    <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><ShieldCheck size={16} />Local, non-neural speech · experimental</h2>
    <p className="text-xs text-slate-400 leading-relaxed">Typed text is synthesized locally. The preset catalog uses two CMU ARCTIC synthesis bases (BDL and SLT), not sixty independent text-to-speech speakers. Original imported sample recordings remain separately auditionable. Your own installed sound banks use your labelled recordings.</p>
    <p className="text-xs text-slate-500">Voice quality and commercial rights must be evaluated separately. A source being downloadable is not a blanket license for every use.</p>
    <VoiceCredits />
  </div>
);
