import React, { useEffect, useState } from 'react';
import {
  initializeLocalSpeechEngine,
  VoiceModelConfig,
  PRESET_VOICE_MODELS,
  ADAPTED_VOICE_MODELS,
} from './utils/naturalVoiceEngine';
import { GeneratedTake } from './types/voice';
import { VoiceNavbar } from './components/VoiceNavbar';
import { PredefinedVoiceList } from './components/PredefinedVoiceList';
import { VoiceManipulator } from './components/VoiceManipulator';
import { SpeechStudio } from './components/SpeechStudio';
import { DialogueStudio } from './components/DialogueStudio';
import { VoiceLibrary } from './components/VoiceLibrary';
import { GitHubSyncModal } from './components/GitHubSyncModal';
import { VoiceCredits } from './components/VoiceCredits';

export function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'dialogue' | 'library'>('studio');
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);

  // Load models from localStorage
  const [models, setModels] = useState<VoiceModelConfig[]>(() => {
    try {
      const saved = localStorage.getItem('vocalis_natural_models');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Predefined voices first, then the adapted ones, then anything saved. The
        // saved list is only ever custom voices (see handleSaveModel), so it cannot
        // shadow a predefined entry.
        return [...PRESET_VOICE_MODELS, ...ADAPTED_VOICE_MODELS, ...parsed];
      }
    } catch {
      // ignore
    }
    return [...PRESET_VOICE_MODELS, ...ADAPTED_VOICE_MODELS];
  });

  const [activeModel, setActiveModel] = useState<VoiceModelConfig>(models[0]);

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

  /**
   * Put the voice back to the recording.
   *
   * Every field the effects screen can move is set to the value that changes nothing:
   * pitch, pace and volume to 1, the character and the accent to neutral, the three
   * resonance bands to 0 dB, and the timing to the recorded one. The old version
   * cleared four of them and left resonance and accent where they were, so "Reset"
   * quietly kept a filter the person had already decided they did not want.
   *
   * A custom voice keeps its own identity (name, colour, speaker) and goes back to the
   * recording it was built from; a predefined voice is the recording already.
   */
  const handleResetActiveVoice = () => {
    const originalPreset = PRESET_VOICE_MODELS.find(
      (p) => p.id === activeModel.id || p.baseVoiceId === activeModel.baseVoiceId,
    );
    const speaker = activeModel.baseVoiceId ?? originalPreset?.baseVoiceId ?? 'slt';
    const recorded = PRESET_VOICE_MODELS.find((p) => p.baseVoiceId === speaker) ?? PRESET_VOICE_MODELS[0];
    setActiveModel((prev) => ({
      ...prev,
      ...(prev.id === recorded.id ? {} : { baseSampleId: recorded.baseSampleId, baseVoiceId: recorded.baseVoiceId }),
      synthesisMethod: 'cmu-arctic',
      pitch: 1.0,
      rate: 1.0,
      volume: 1.0,
      toneStyle: 'natural',
      accent: 'US',
      throatWarmth: 0,
      oralClarity: 0,
      airPresence: 0,
      referenceRaw: true,
    }));
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
      samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
      // A new voice starts as the recording, with every adjustment at the value that
      // changes nothing, so the first thing anyone hears from it is the original.
      referenceRaw: true,
      throatWarmth: 0,
      oralClarity: 0,
      airPresence: 0,
      avatarColor: '#3b82f6',
      isCustom: true,
    };
    handleSaveModel(fresh);
    setActiveModel(fresh);
    setActiveTab('studio');
  };

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
            {/* 1. Predefined Voices List (Select to Manipulate) */}
            <PredefinedVoiceList
              voices={models}
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

        {activeTab === 'dialogue' && <DialogueStudio models={models} />}

        {activeTab === 'library' && (
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
