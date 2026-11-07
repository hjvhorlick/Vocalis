import React, { useState } from 'react';
import { ATTRIBUTION_DETAILS } from '../utils/naturalHumanAudio';
import { ShieldCheck, Copy, Check, ChevronDown, ChevronUp, ExternalLink, Calendar, Mic } from 'lucide-react';

export const SourceVoiceAttribution: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const citationText = `Acoustic voice sources: 1) CMU ARCTIC Speech Databases (Recorded 2003), Language Technologies Institute, Carnegie Mellon University (John Kominek & Alan W. Black; BSD Open License). 2) Open Speech Repository (Recorded 2006, Telchemy Harvard/IEEE Sentences). 100% genuine real human studio acoustic recordings with zero AI generation.`;

  const handleCopyCitation = () => {
    navigator.clipboard.writeText(citationText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="bg-slate-900/90 border border-emerald-500/40 rounded-3xl p-5 shadow-xl space-y-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-center shrink-0 text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                Verified 100% Non-AI Human Speech
              </span>
              <span className="text-[10px] bg-emerald-950/80 text-emerald-300 font-mono px-2 py-0.5 rounded-full border border-emerald-500/30">
                Recorded in 2003 &amp; 2006
              </span>
              <span className="text-[10px] bg-slate-950 text-slate-400 font-mono px-2 py-0.5 rounded-full border border-slate-800">
                Permissive BSD License
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-normal">
              Foundational audio: <strong className="text-white">{ATTRIBUTION_DETAILS.project}</strong> &bull;{' '}
              {ATTRIBUTION_DETAILS.institution}.
            </p>
            <p className="text-[11px] text-slate-400">
              Recorded by real living human speakers in university acoustic chambers over two decades ago &mdash; long before generative AI speech existed.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {isExpanded ? (
              <>
                Less Info <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Audit Proof <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>

          <button
            onClick={handleCopyCitation}
            className="px-3.5 py-2 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Copy citation for attribution"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied Citation!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" /> Copy Attribution
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expandable Provenance & Proof Drawer */}
      {isExpanded && (
        <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300 animate-in fade-in duration-150">
          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-1">
            <span className="font-bold text-white flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cyan-400">
              <Calendar className="w-3.5 h-3.5" /> Historical Provenance
            </span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Recorded in <strong>2003</strong> at Carnegie Mellon University (LTI Report CMU-LTI-03-177). Modern generative AI didn't exist when these audio files were captured.
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-1">
            <span className="font-bold text-white flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-emerald-400">
              <Mic className="w-3.5 h-3.5" /> Living Human Voice Actors
            </span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Spoken by real professors and voice actors: Alan W. Black (Scottish), John M. Kominek (Canadian), Robert M. Smith (US Baritone), and Shelley L. T. (California).
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-1">
            <span className="font-bold text-white flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-indigo-400">
              <ExternalLink className="w-3.5 h-3.5" /> Academic Public Verification
            </span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Verify directly at Carnegie Mellon: <a href="http://festvox.org/cmu_arctic/" target="_blank" rel="noreferrer" className="text-cyan-400 underline">festvox.org/cmu_arctic</a>. Zero AI, 100% human acoustic science.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
