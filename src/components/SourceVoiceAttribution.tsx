import React, { useState } from 'react';
import { ATTRIBUTION_DETAILS } from '../utils/naturalHumanAudio';
import { ShieldCheck, Copy, Check } from 'lucide-react';

export const SourceVoiceAttribution: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const citationText = `Acoustic voice source: CMU ARCTIC Speech Databases, Language Technologies Institute, Carnegie Mellon University (John Kominek & Alan W Black). Publicly available under BSD permissive license. Transformed and synthesized via Vocalis Web Audio DSP engine.`;

  const handleCopyCitation = () => {
    navigator.clipboard.writeText(citationText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="bg-slate-900/90 border border-emerald-500/30 rounded-3xl p-5 shadow-xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                100% Non-AI Human Voice Verification
              </span>
              <span className="text-[10px] bg-emerald-950/60 text-emerald-300 font-mono px-2 py-0.5 rounded-full border border-emerald-500/30">
                Permissive BSD License
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-normal">
              Foundational audio source: <strong className="text-white">{ATTRIBUTION_DETAILS.project}</strong> &bull;{' '}
              {ATTRIBUTION_DETAILS.institution}.
            </p>
            <p className="text-[11px] text-slate-400">
              Recorded in an acoustic studio by real human speakers. Used with standard attribution to convert into custom vocal personas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopyCitation}
            className="px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Copy citation for attribution"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied Attribution!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" /> Copy Attribution
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
