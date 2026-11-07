import React, { useEffect, useState } from 'react';
import { initializeLocalSpeechEngine, VoiceModelConfig, PRESET_VOICE_MODELS } from './utils/naturalVoiceEngine';
import { GeneratedTake } from './types/voice';
import { VoiceNavbar } from './components/VoiceNavbar';
import { PredefinedVoiceList } from './components/PredefinedVoiceList';
import { VoiceManipulator } from './components/VoiceManipulator';
import { SpeechStudio } from './components/SpeechStudio';
import { DialogueStudio } from './components/DialogueStudio';
import { VoiceLibrary } from './components/VoiceLibrary';
import { GitHubSyncModal } from './components/GitHubSyncModal';
import { VoiceCredits } from './components/VoiceCredits';
import { RecordedVoiceLibrary } from './components/RecordedVoiceLibrary';
import { VoiceFileCreator } from './components/VoiceFileCreator';
import { VOICE_CATALOGUE } from './data/voiceCatalogue';

export function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'voicefile' | 'dialogue' | 'library'>('studio');
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);

  // Load models from localStorage
  const [models, setModels] = useState<VoiceModelConfig[]>(() => {
    try {
      const saved = localStorage.getItem('vocalis_natural_models');
      if (saved) {
        const parsed = JSON.parse(saved);
        return [...PRESET_VOICE_MODELS, ...parsed];
      }
    } catch {
      // ignore
    }
    return PRESET_VOICE_MODELS;
  });

  const [activeModel, setActiveModel] = useState<VoiceModelConfig>(models[0]);

  /**
   * The two pages own their own settings, and this is where that is enforced.
   *
   * Text to Speech works from `models` — the factory voices and whatever has been
   * **saved**. It deliberately does not pull in installed library packs: a recording
   * enters the studio only after it has been saved as a voice or exported as a
   * `.vls` file, so nothing from the workbench can leak into a spoken session.
   */
  const studioModels = models;

  useEffect(() => {
    initializeLocalSpeechEngine(activeModel);
  }, [activeModel.gender, activeModel.baseVoiceId, activeModel.synthesisMethod]);

  // Saved audio takes
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

  const handleResetActiveVoice = () => {
    const originalPreset = PRESET_VOICE_MODELS.find((p) => p.id === activeModel.id);
    if (originalPreset) {
      setActiveModel({ ...originalPreset });
    } else {
      setActiveModel((prev) => ({
        ...prev,
        pitch: 1.0,
        rate: 1.0,
        volume: 1.0,
        toneStyle: 'natural',
      }));
    }
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

  const handleNewVoice = () => {
    const fresh: VoiceModelConfig = {
      id: 'custom-' + Date.now(),
      name: 'Custom Crafted Voice',
      archetype: 'Articulate Speaker',
      description: 'Custom tuned vocal pitch, pacing, and tone.',
      gender: 'Neutral',
      synthesisMethod: 'cmu-arctic',
      baseSampleId: 'cmu-slt-1',
      baseVoiceId: 'slt',
      accent: 'US',
      flag: '✨',
      pitch: 1.0,
      rate: 1.0,
      volume: 1.0,
      toneStyle: 'natural',
      samplePhrase: 'Hello! I am your custom voice model speaking real intelligible words.',
      avatarColor: '#3b82f6',
      isCustom: true,
    };
    handleSaveModel(fresh);
    setActiveModel(fresh);
    setActiveTab('studio');
  };

  const installableVoiceCount = VOICE_CATALOGUE.filter((voice) => voice.install).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Header */}
      <VoiceNavbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        savedVoicesCount={models.filter((m) => m.isCustom).length}
        onNewVoice={handleNewVoice}
        onOpenGitHubModal={() => setIsGitHubModalOpen(true)}
      />

      {/* GitHub Sync & Code Download Modal */}
      <GitHubSyncModal
        isOpen={isGitHubModalOpen}
        onClose={() => setIsGitHubModalOpen(false)}
      />

      {/* Main Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {activeTab === 'studio' && (
          <div className="space-y-6">
            {/* The library is the reason this app has more than two people in it,
                and it lives behind a tab. Point at it from here. */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-500/25 bg-indigo-500/5 px-4 py-3">
              <p className="text-xs text-slate-300">
                <span className="font-semibold text-slate-100">
                  {VOICE_CATALOGUE.length} recorded voice databases
                </span>{' '}
                were investigated. {installableVoiceCount} can be installed on this machine and
                spoken as recorded; the rest are listed with the reason they cannot be used.
              </p>
              <button
                onClick={() => setActiveTab('library')}
                className="shrink-0 rounded-xl border border-indigo-500/40 bg-indigo-600/20 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-all hover:bg-indigo-600/30 hover:text-white"
              >
                Open the voice library →
              </button>
            </div>

            {/* 1. Predefined Voices List (Select to Manipulate) */}
            <PredefinedVoiceList
              voices={studioModels}
              activeVoice={activeModel}
              onSelectVoice={(v) => setActiveModel(v)}
              onNewVoice={handleNewVoice}
            />

            {/* 2. Voice Manipulator Panel for the Active Voice */}
            <VoiceManipulator
              voice={activeModel}
              onUpdateVoice={setActiveModel}
              onSaveAsCustom={handleSaveModel}
              onResetToDefault={handleResetActiveVoice}
            />

            {/* 3. Spoken Word Studio & Real-time Synthesizer */}
            <SpeechStudio
              models={models}
              activeModel={activeModel}
              onSelectModel={setActiveModel}
              onUpdateActiveModel={setActiveModel}
              onSaveTake={handleSaveTake}
            />
          </div>
        )}

        {activeTab === 'voicefile' && <VoiceFileCreator onOpenLibrary={() => setActiveTab('library')} />}

        {activeTab === 'dialogue' && <DialogueStudio models={models} />}

        {activeTab === 'library' && (
          <div className="space-y-6">
            <RecordedVoiceLibrary
              activeVoiceId={
                activeModel.baseVoiceId && !['slt', 'bdl'].includes(activeModel.baseVoiceId)
                  ? activeModel.baseVoiceId
                  : undefined
              }
              onSelectVoice={(model) => {
                // A recorded voice enters Text to Speech by being saved first, and
                // only then; the studio never borrows a library pack directly.
                handleSaveModel({ ...model, isCustom: true });
                setActiveModel({ ...model, isCustom: true });
                setActiveTab('studio');
              }}
            />
            <VoiceLibrary
              models={models}
              savedTakes={savedTakes}
              onSelectModelForShaper={(m) => {
                setActiveModel(m);
                setActiveTab('studio');
              }}
              onSelectModelForStudio={(m) => {
                setActiveModel(m);
                setActiveTab('studio');
              }}
              onDeleteCustomModel={handleDeleteCustomModel}
              onDeleteTake={handleDeleteTake}
              onGoToNewModel={handleNewVoice}
            />
          </div>
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
            <span>CMU ARCTIC Recorded Speech Units · No AI</span>
            <span>&bull;</span>
            <span>Custom Pitch & Cadence Knobs</span>
            <span>&bull;</span>
            <span>Dual-Speaker Dialogue</span>
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
