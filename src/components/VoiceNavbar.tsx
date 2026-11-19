import React from 'react';
import { AudioLines, BookOpen, FolderPlus, Sparkles } from 'lucide-react';

export type AppNavTab = 'originals' | 'creator' | 'variants' | 'narrate';

interface VoiceNavbarProps {
  activeTab: AppNavTab;
  onSelectTab: (tab: AppNavTab) => void;
}

/** Four screens in the order a customer uses them. */
export const VoiceNavbar: React.FC<VoiceNavbarProps> = ({ activeTab, onSelectTab }) => {
  const tabs: { id: AppNavTab; label: string; icon: React.ElementType }[] = [
    { id: 'originals', label: '1. Original Voices', icon: BookOpen },
    { id: 'creator', label: '2. Voice Creator', icon: Sparkles },
    { id: 'variants', label: '3. New Voice Library', icon: FolderPlus },
    { id: 'narrate', label: '4. Script to MP3', icon: AudioLines },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center gap-3">
          <div className="flex shrink-0 items-center" aria-label="Vocalis">
            <img src="/brand/vocalis-mark.png" alt="" width={30} height={30} className="h-[30px] w-[30px] object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]" />
            <span className="-ml-[3px] bg-gradient-to-b from-[#fef5bd] via-[#eccb85] to-[#c39b52] bg-clip-text text-[26px] font-extrabold leading-none tracking-[-0.03em] text-transparent">ocalis</span>
          </div>
          <div className="hidden min-w-0 lg:block">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#e8c981]">Voice creation studio</p>
            <p className="truncate text-xs text-slate-400">Test originals → create a variant → save it → narrate a script</p>
          </div>
        </div>

        <nav aria-label="Vocalis workflow" className="-mx-4 flex gap-1.5 overflow-x-auto border-t border-slate-800/40 px-4 py-2 scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return <button key={tab.id} type="button" onClick={() => onSelectTab(tab.id)} aria-current={active ? 'page' : undefined} className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-xs font-semibold transition-colors ${active ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm' : 'border-slate-800 bg-slate-900/90 text-slate-400 hover:bg-slate-800 hover:text-white'}`}><Icon className="h-3.5 w-3.5" />{tab.label}</button>;
          })}
        </nav>
      </div>
    </header>
  );
};
