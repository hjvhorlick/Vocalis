import React from 'react';
import { X } from 'lucide-react';

// Kept under the original component name to preserve the app's navigation API.
// Publishing must be done with authenticated git/gh tooling, never browser tokens.
export function GitHubSyncModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 bg-slate-950/80 p-4 flex items-center justify-center" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="handoff-title" className="max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-300 space-y-4">
      <div className="flex justify-between gap-4"><h2 id="handoff-title" className="font-bold text-white">Move Vocalis to another environment</h2><button type="button" onClick={onClose} aria-label="Close handoff information"><X size={20} /></button></div>
      <p className="text-sm">Use the repository or the development-only Download Code button to transfer the application. Read <code>docs/DEPLOYMENT.md</code> for the build and microphone requirements.</p>
      <p className="text-sm">Your recording projects, voice banks and ratings live in this browser—not in the source ZIP. Export your .vproject and .vvoice files separately before moving to another URL.</p>
      <p className="text-sm text-amber-200">Do not enter GitHub tokens in this application. Publish using your authenticated development tools. Server-side repository push and credential collection have been removed.</p>
      <p className="text-xs text-slate-500">Dependencies: Node.js 22+, npm, and HTTPS for microphone access. Python 3 is needed only for the development source-ZIP export, not for recording or speech synthesis.</p>
    </section>
  </div>;
}
