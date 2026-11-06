import React from 'react';
import { Sliders, Mic2, Users, BookmarkCheck, Plus, Sparkles, Volume2 } from 'lucide-react';

interface VoiceNavbarProps {
  activeTab: 'studio' | 'dialogue' | 'library';
  onSelectTab: (tab: 'studio' | 'dialogue' | 'library') => void;
  savedVoicesCount: number;
  onNewVoice: () => void;
}

export const VoiceNavbar: React.FC<VoiceNavbarProps> = ({
  activeTab,
  onSelectTab,
  savedVoicesCount,
  onNewVoice,
}) => {
  const tabs = [
    { id: 'studio', label: 'Voice Hub & Studio', icon: Sliders, desc: 'Predefined Voices & Live Synthesizer' },
    { id: 'dialogue', label: 'Dialogue Screenplay', icon: Users, desc: 'Two Voices in Conversation' },
    { id: 'library', label: 'Takes Vault', icon: BookmarkCheck, desc: 'Generated Audio Archive' },
  ] as const;

  return (
    <header className="sticky top-0 z-50 bg-slate-950/85 backdrop-blur-xl border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-fuchsia-500 p-0.5 shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Volume2 className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-transparent">
                  Vocalis
                </span>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Voice Creation Studio
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Custom Voice Design & Spoken Word Synthesizer
              </p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900/70 p-1 rounded-xl border border-slate-800/60">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  {tab.label}
                  {tab.id === 'library' && savedVoicesCount > 0 && (
                    <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/30 text-indigo-200 font-mono">
                      {savedVoicesCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Action */}
          <div className="flex items-center gap-2">
            <button
              onClick={onNewVoice}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 text-white shadow-lg shadow-indigo-500/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 text-white" />
              <span className="tracking-wide">Create New Voice</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="flex md:hidden overflow-x-auto py-2 gap-1 border-t border-slate-800/40 -mx-4 px-4 scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 bg-slate-900/50 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
