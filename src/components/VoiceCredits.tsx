import React, { useState } from 'react';
import { ExternalLink, X } from 'lucide-react';

export const VoiceCredits: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-[11px] text-slate-500 underline decoration-slate-700 underline-offset-2 hover:text-slate-300"
      >
        Credits &amp; licenses
      </button>
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="voice-credits-title"
            className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="voice-credits-title" className="text-lg font-bold text-white">Voice data credits</h2>
                <p className="mt-1 text-xs text-slate-400">A compact attribution for the voice sources included with Vocalis.</p>
              </div>
              <button onClick={() => setIsOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close credits">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-sm leading-relaxed text-slate-300">
              <p>
                <strong className="text-white">CMU ARCTIC 0.95</strong> — Carnegie Mellon University,
                John Kominek, and Alan W. Black; Copyright © 2003. Vocalis uses labeled recordings from
                speaker BDL (US English male) and speaker SLT (US English female). The recordings were converted into compact,
                time-aligned diphone banks for local concatenative synthesis; the source is not a
                neural voice model.
              </p>
              <p className="text-xs text-slate-400">
                The CMU license requires its copyright notice, conditions and disclaimer to be retained;
                it also requires modifications to be marked and original author names to remain.
              </p>
              <div className="flex flex-wrap gap-3 border-t border-slate-800 pt-4 text-xs">
                <a className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200" href="/voicepacks/cmu-arctic/bdl/LICENSE.txt" target="_blank" rel="noreferrer">
                  BDL license <ExternalLink className="h-3 w-3" />
                </a>
                <a className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200" href="/voicepacks/cmu-arctic/slt/LICENSE.txt" target="_blank" rel="noreferrer">
                  SLT license <ExternalLink className="h-3 w-3" />
                </a>
                <a className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200" href="http://festvox.org/cmu_arctic/" target="_blank" rel="noreferrer">
                  CMU ARCTIC source <ExternalLink className="h-3 w-3" />
                </a>
                <a className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200" href="/CMUDICT-LICENSE.txt" target="_blank" rel="noreferrer">
                  Pronunciation dictionary license <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
};
