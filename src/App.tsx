import React, { useEffect, useState } from 'react';
import { initializeLocalSpeechEngine, VoiceModelConfig, PRESET_VOICE_MODELS } from './utils/naturalVoiceEngine';
import { GeneratedTake } from './types/voice';
import { VoiceNavbar, AppNavTab } from './components/VoiceNavbar';
import { VoiceHub } from './components/VoiceHub';
import { VoiceCreator } from './components/VoiceCreator';
import { DialogueStudio } from './components/DialogueStudio';
import { VoiceLibrary } from './components/VoiceLibrary';
import { GitHubSyncModal } from './components/GitHubSyncModal';
import { VoiceCredits } from './components/VoiceCredits';

export function App() {
  // Voice Hub is the main page default
  const [activeTab, setActiveTab] = useState<AppNavTab>('hub');
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);

  // Load models from localStorage
  const [models, setModels] = useState<VoiceModelConfig[]>(() => {
    try {
      const saved = localStorage.getItem('vocalis_natural_models');
      if (saved) {
        const parsed = JSON.parse(saved);
        const customOnly = Array.isArray(parsed) ? parsed.filter((m: VoiceModelConfig) => m.isCustom) : [];
        return [...PRESET_VOICE_MODELS, ...customOnly];
      }
    } catch {
      // ignore
    }
    return PRESET_VOICE_MODELS;
  });

  const [activeModel, setActiveModel] = useState<VoiceModelConfig>(models[0]);

  useEffect(() => {
    initializeLocalSpeechEngine(activeModel);
  }, [activeModel.gender, activeModel.baseVoiceId, activeModel.synthesisMethod]);

  // Saved audio takes vault
  const [savedTakes, setSavedTakes] = useState<GeneratedTake[]>(() => {
    try {
      const saved = localStorage.getItem('vocalis_saved_takes');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });

  // Save custom voice model
  const handleSaveModel = (newModel: VoiceModelConfig) => {
    const toSave: VoiceModelConfig = {
      ...newModel,
      isCustom: true,
    };

    setModels((prev) => {
      const idx = prev.findIndex((m) => m.id === toSave.id);
      let updated: VoiceModelConfig[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = toSave;
      } else {
        updated = [toSave, ...prev];
      }
      const customOnly = updated.filter((m) => m.isCustom);
      try {
        localStorage.setItem('vocalis_natural_models', JSON.stringify(customOnly));
      } catch {
        // ignore
      }
      return updated;
    });

    setActiveModel(toSave);
  };

  const handleDeleteCustomModel = (id: string) => {
    setModels((prev) => {
      const updated = prev.filter((m) => m.id !== id);
      const customOnly = updated.filter((m) => m.isCustom);
      try {
        localStorage.setItem('vocalis_natural_models', JSON.stringify(customOnly));
      } catch {
        // ignore
      }
      return updated;
    });
    if (activeModel.id === id) {
      setActiveModel(PRESET_VOICE_MODELS[0]);
    }
  };

  // Save generated take
  const handleSaveTake = (take: GeneratedTake) => {
    setSavedTakes((prev) => {
      const updated = [take, ...prev];
      try {
        localStorage.setItem('vocalis_saved_takes', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  const handleDeleteTake = (id: string) => {
    setSavedTakes((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      try {
        localStorage.setItem('vocalis_saved_takes', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Header with Unified Buttons */}
      <VoiceNavbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        savedVoicesCount={models.filter((m) => m.isCustom).length}
        onOpenGitHubModal={() => setIsGitHubModalOpen(true)}
      />

      {/* GitHub Sync & Code Download Modal */}
      <GitHubSyncModal
        isOpen={isGitHubModalOpen}
        onClose={() => setIsGitHubModalOpen(false)}
      />

      {/* Main Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* 1. Voice Hub (Main Page) */}
        {activeTab === 'hub' && (
          <VoiceHub
            voices={models}
            activeVoice={activeModel}
            onSelectVoice={(v) => setActiveModel(v)}
            onUpdateActiveVoice={setActiveModel}
            onSaveTake={handleSaveTake}
            onOpenVoiceCreator={(baseVoice) => {
              if (baseVoice) setActiveModel(baseVoice);
              setActiveTab('creator');
            }}
          />
        )}

        {/* 2. Merged Voice Creator Studio */}
        {activeTab === 'creator' && (
          <VoiceCreator
            voices={models}
            activeVoice={activeModel}
            onSaveModel={handleSaveModel}
            onSaveTake={handleSaveTake}
            onGoToHub={(model) => {
              if (model) setActiveModel(model);
              setActiveTab('hub');
            }}
          />
        )}

        {/* 3. Dialogue Screenplay Studio */}
        {activeTab === 'dialogue' && <DialogueStudio models={models} />}

        {/* 4. Takes Vault (Audio Archive) */}
        {activeTab === 'library' && (
          <VoiceLibrary
            models={models}
            savedTakes={savedTakes}
            onSelectModelForShaper={(m) => {
              setActiveModel(m);
              setActiveTab('creator');
            }}
            onSelectModelForStudio={(m) => {
              setActiveModel(m);
              setActiveTab('hub');
            }}
            onDeleteCustomModel={handleDeleteCustomModel}
            onDeleteTake={handleDeleteTake}
            onGoToNewModel={() => setActiveTab('creator')}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950/80 py-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-400">Vocalis</span>
            <span>&bull;</span>
            <span>Voice Creation & Spoken Word Synthesizer</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span>60 Real Human Speakers · 100% Genuine Studio Recordings</span>
            <span>&bull;</span>
            <span>Zero AI</span>
            <span>&bull;</span>
            <span>Real-time Waveform Oscilloscope</span>
            <span>&bull;</span>
            <span>WAV Audio Export</span>
            <span>&bull;</span>
            <VoiceCredits />
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
