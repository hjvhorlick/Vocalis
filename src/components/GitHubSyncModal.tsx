import React, { useState } from 'react';
import {
  Download,
  Check,
  AlertCircle,
  ExternalLink,
  X,
  KeyRound,
  ShieldCheck,
  ArrowRight,
  FolderArchive,
  RefreshCw,
} from 'lucide-react';

const GitHubIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

interface GitHubSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GitHubSyncModal: React.FC<GitHubSyncModalProps> = ({ isOpen, onClose }) => {
  const [token, setToken] = useState('');
  const [isPushing, setIsPushing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | null;
    text: string;
  }>({ type: null, text: '' });
  const [isDownloading, setIsDownloading] = useState(false);

  if (!isOpen) return null;

  const handleDownloadZip = () => {
    setIsDownloading(true);
    // Trigger download
    const link = document.createElement('a');
    link.href = '/api/project/download-zip';
    link.setAttribute('download', 'vocalis-project.zip');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => setIsDownloading(false), 2000);
  };

  const handlePushToGitHub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Please paste your GitHub Personal Access Token.',
      });
      return;
    }

    setIsPushing(true);
    setStatusMessage({ type: null, text: '' });

    try {
      const res = await fetch('/api/project/push-github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to push to GitHub');
      }

      setStatusMessage({
        type: 'success',
        text: 'Successfully pushed all code files to https://github.com/hjvhorlick/Vocalis!',
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Error pushing to GitHub. Check token permissions.',
      });
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl relative space-y-6 text-slate-100">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Title */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <GitHubIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-white">Save / Push to GitHub</h3>
            <p className="text-xs text-slate-400">
              Target Repository:{' '}
              <span className="font-mono text-indigo-300 font-semibold">hjvhorlick/Vocalis</span>
            </p>
          </div>
        </div>

        {/* Option 1: 1-Click ZIP Download */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-bold text-xs uppercase tracking-wider">
              <FolderArchive className="w-4 h-4 text-emerald-400" />
              <span>Option 1: Instant ZIP Download (Guaranteed)</span>
            </div>
            <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
              1-Click
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Download the complete Vocalis codebase as a <span className="text-white font-medium">.zip</span> file directly to your computer. Then you can upload it or keep a permanent copy.
          </p>
          <button
            onClick={handleDownloadZip}
            className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {isDownloading ? 'Generating ZIP...' : 'Download Entire Project ZIP (.zip)'}
          </button>
        </div>

        {/* Option 2: Direct Push to GitHub with Token */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-bold text-xs uppercase tracking-wider">
              <KeyRound className="w-4 h-4 text-indigo-400" />
              <span>Option 2: Push Directly to GitHub</span>
            </div>
            <span className="text-[10px] text-indigo-400 bg-indigo-950/60 border border-indigo-500/30 px-2 py-0.5 rounded-full font-medium">
              Direct Sync
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            GitHub requires a Personal Access Token with <span className="text-white font-semibold">repo</span> permissions to push code.
          </p>

          <form onSubmit={handlePushToGitHub} className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1 text-[11px]">
                <label className="text-slate-400 font-medium">GitHub Personal Access Token</label>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=Vocalis+App"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 hover:underline"
                >
                  Generate Token on GitHub <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token (e.g. ghp_xxxxxxxxxxxxxxxxxxxx)"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={isPushing || !token.trim()}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.99] text-white flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
            >
              {isPushing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Pushing to hjvhorlick/Vocalis...
                </>
              ) : (
                <>
                  <GitHubIcon className="w-4 h-4" /> Push All Code to GitHub Now
                </>
              )}
            </button>
          </form>

          {/* Feedback messages */}
          {statusMessage.type === 'success' && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-start gap-2.5 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">{statusMessage.text}</p>
                <a
                  href="https://github.com/hjvhorlick/Vocalis"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-200 underline mt-1 font-medium"
                >
                  View your repository on GitHub <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {statusMessage.type === 'error' && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Push Failed</p>
                <p className="text-rose-200 mt-0.5">{statusMessage.text}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800">
          <span>Target: main branch</span>
          <span>Zero external cloud TTS files</span>
        </div>
      </div>
    </div>
  );
};
