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
                <strong className="text-white">CMU ARCTIC Multi-Speaker Speech Corpus</strong> &mdash; Carnegie Mellon University,
                John Kominek, and Alan W. Black; Copyright &copy; 2003. Includes clean acoustic recordings from real human speakers:
                <strong> SLT</strong> (US Female - California), <strong>RMS</strong> (US Male - Deep Baritone), <strong>AWB</strong> (Scottish Male - Edinburgh), 
                <strong> CLB</strong> (US Female - Boston), <strong>BDL</strong> (US Male - Boston), <strong>JMK</strong> (Canadian Male), and <strong>KSP</strong> (Indian English Male).
                100% genuine human speech recordings, zero AI.
              </p>
              <p>
                <strong className="text-white">Open Speech Repository (OSR)</strong> &mdash; Telchemy Open Speech Repository.
                Includes standardized IEEE Harvard benchmark sentences read by professional British English and American male and female human speakers.
                Check the original source terms for your intended use; availability does not itself clear commercial or redistribution rights.
              </p>
              <p className="text-xs text-slate-400">
                The CMU ARCTIC license requires copyright notices and conditions to be retained. All speech samples in Vocalis are non-AI human recordings.
              </p>
              <p className="text-xs text-slate-400">New-text synthesis uses the packaged BDL/SLT diphone banks or your own installed sound bank. Preset names and portraits are delivery profiles, not evidence of distinct trained speakers. User-recorded banks retain their own recording and speaker rights.</p>
              <div className="flex flex-wrap gap-3 text-xs"><a href="/voicepacks/cmu-arctic/bdl/LICENSE.txt" target="_blank" rel="noreferrer" className="text-cyan-300">BDL notice</a><a href="/voicepacks/cmu-arctic/slt/LICENSE.txt" target="_blank" rel="noreferrer" className="text-cyan-300">SLT notice</a><a href="/CMUDICT-LICENSE.txt" target="_blank" rel="noreferrer" className="text-cyan-300">Pronunciation dictionary notice</a></div>
              <div className="flex flex-wrap gap-3 border-t border-slate-800 pt-4 text-xs">
                <a className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200" href="http://festvox.org/cmu_arctic/" target="_blank" rel="noreferrer">
                  CMU ARCTIC Project <ExternalLink className="h-3 w-3" />
                </a>
                <a className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200" href="http://www.voiptroubleshooter.com/open_speech/" target="_blank" rel="noreferrer">
                  Open Speech Repository <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
};
