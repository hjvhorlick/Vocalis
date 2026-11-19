import React from 'react';
import {
  Sliders,
  Mic,
  Sparkles,
  Users,
  BookmarkCheck,
} from 'lucide-react';

const GitHubIcon = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

export type AppNavTab = 'hub' | 'creator' | 'dialogue' | 'library' | 'recording';

interface VoiceNavbarProps {
  activeTab: AppNavTab;
  onSelectTab: (tab: AppNavTab) => void;
  savedVoicesCount: number;
  onOpenGitHubModal: () => void;
}

export const VoiceNavbar: React.FC<VoiceNavbarProps> = ({
  activeTab,
  onSelectTab,
  savedVoicesCount,
  onOpenGitHubModal,
}) => {
  // Five steps, ordered by the normal workflow. Each screen has one job.
  const tabs: { id: AppNavTab; label: string; icon: React.ElementType }[] = [
    { id: 'library', label: '1. Voices', icon: BookmarkCheck },
    { id: 'recording', label: '2. Record', icon: Mic },
    { id: 'creator', label: '3. Create Variant', icon: Sparkles },
    { id: 'hub', label: '4. Narrate', icon: Sliders },
    { id: 'dialogue', label: '5. Dialogue', icon: Users },
  ];

  return (
    <header className="sticky top-0 z-50 bg-slate-950/85 backdrop-blur-xl border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="sr-only">Vocalis</span>
            {/* Lockup: the logo V stands in for the "V", "ocalis" continues the word in the V's own gold */}
            <div className="flex items-center" aria-hidden="true">
              <img
                src="/brand/vocalis-mark.png"
                alt=""
                width={30}
                height={30}
                className="h-[30px] w-[30px] object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]"
              />
              <span className="-ml-[3px] font-extrabold text-[26px] leading-none tracking-[-0.03em] bg-gradient-to-b from-[#fef5bd] via-[#eccb85] to-[#c39b52] bg-clip-text text-transparent">
                ocalis
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-[#e8c981]/10 text-[#e8c981] border border-[#e8c981]/25 hidden sm:inline-block">
                  Voice Creation Studio
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden lg:block">
                Browse &rarr; Record &rarr; Create &rarr; Narrate &rarr; Dialogue
              </p>
            </div>
          </div>

          {/* Right Action Buttons (Styled identically with exact same h-9 px-3.5 rounded-xl border) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Optional transfer action; the five workflow sections stay focused on voice work. */}
            <button
              onClick={onOpenGitHubModal}
              className="h-9 px-3.5 rounded-xl border border-indigo-500/40 bg-slate-900/90 hover:bg-slate-800/90 hover:border-indigo-400 text-indigo-300 hover:text-indigo-100 text-xs font-semibold inline-flex items-center gap-2 transition-all duration-150 cursor-pointer shadow-sm"
              title="Transfer the application and your voice files"
            >
              <GitHubIcon className="w-3.5 h-3.5 text-indigo-400" />
              <span>Transfer app</span>
            </button>
          </div>
        </div>

        {/* Scrollable navigation stays usable on desktop, tablet and mobile. */}
        <nav aria-label="Vocalis sections" className="flex overflow-x-auto py-2 gap-1.5 border-t border-slate-800/40 -mx-4 px-4 scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`h-9 px-3 rounded-xl border text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                    : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.id === 'library' && savedVoicesCount > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200">{savedVoicesCount}</span>}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
