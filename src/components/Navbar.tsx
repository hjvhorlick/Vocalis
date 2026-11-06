import React from 'react';
import { Mic, MicOff, Volume2, Sparkles, Sliders, Activity, Target, Music, Dumbbell, Piano } from 'lucide-react';

interface NavbarProps {
  isMicActive: boolean;
  onToggleMic: () => void;
  volumeLevel: number; // 0 to 1
  activeTab: 'tuner' | 'range' | 'scales' | 'gym' | 'keyboard';
  onSelectTab: (tab: 'tuner' | 'range' | 'scales' | 'gym' | 'keyboard') => void;
  micSensitivity: number;
  onSensitivityChange: (val: number) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  isMicActive,
  onToggleMic,
  volumeLevel,
  activeTab,
  onSelectTab,
  micSensitivity,
  onSensitivityChange,
}) => {
  const [showSettings, setShowSettings] = React.useState(false);

  const tabs = [
    { id: 'tuner', label: 'Live Studio', icon: Activity, desc: 'Tuner & Pitch Roll' },
    { id: 'range', label: 'Range Finder', icon: Target, desc: 'Voice Classification' },
    { id: 'scales', label: 'Scales & Exercises', icon: Music, desc: 'Sing-Along Warm-ups' },
    { id: 'gym', label: 'Vocal Gym', icon: Dumbbell, desc: 'Breath & Stability' },
    { id: 'keyboard', label: 'Pitch Pipe', icon: Piano, desc: 'Piano & Drones' },
  ] as const;

  return (
    <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-fuchsia-500 p-0.5 shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-transparent">
                  Vocalis
                </span>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Studio
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Vocal Acoustics & Pitch Mastery</p>
            </div>
          </div>

          {/* Navigation Tabs (Desktop) */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800/60">
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
                </button>
              );
            })}
          </nav>

          {/* Right Controls: Mic & Sensitivity */}
          <div className="flex items-center gap-3">
            {/* Live Audio Meter */}
            {isMicActive && (
              <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
                <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 via-yellow-500 to-rose-500 transition-all duration-75"
                    style={{ width: `${Math.min(100, Math.max(0, volumeLevel * 100 * 2))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Mic Toggle Button */}
            <button
              onClick={onToggleMic}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm ${
                isMicActive
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20'
                  : 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-indigo-500/20 hover:brightness-110 active:scale-95'
              }`}
            >
              {isMicActive ? (
                <>
                  <MicOff className="w-4 h-4 text-rose-400 animate-pulse" />
                  <span>Stop Mic</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  <span>Start Mic</span>
                </>
              )}
            </button>

            {/* Audio Settings Toggle */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Audio Sensitivity Settings"
            >
              <Sliders className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
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

        {/* Settings Dropdown Drawer */}
        {showSettings && (
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl mb-3 shadow-xl flex flex-wrap items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center gap-3">
              <Sliders className="w-5 h-5 text-indigo-400" />
              <div>
                <h4 className="text-sm font-semibold text-white">Microphone Sensitivity & Gate</h4>
                <p className="text-xs text-slate-400">
                  Adjust gain threshold to filter out background room noise
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="text-xs text-slate-400">Low</span>
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.1"
                value={micSensitivity}
                onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
                className="w-40 sm:w-56 accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <span className="text-xs text-slate-400">High ({micSensitivity.toFixed(1)}x)</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
