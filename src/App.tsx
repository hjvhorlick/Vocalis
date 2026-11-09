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
import { RecordingStudio } from './components/recording/RecordingStudio';
import { stopSpeaking } from './utils/naturalVoiceEngine';
import { saveVoiceBank, voiceModelForBank, deleteVoiceBank } from './utils/voiceBankStorage';
import type { VoiceBank } from './types/voiceBank';
import { readStoredTakes, storeTake, removeStoredTake } from './utils/takeStorage';

export function App() {
  // Voice Hub is the main page default
  const [activeTab, setActiveTab] = useState<AppNavTab>('hub');
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);
  const [recordingOpened, setRecordingOpened] = useState(false);
  const [recordingPending, setRecordingPending] = useState(false);
  const [speechError, setSpeechError] = useState('');
  useEffect(() => {
    const onError = (event: Event) => setSpeechError((event as CustomEvent<string>).detail);
    window.addEventListener('vocalis-speech-error', onError);
    return () => window.removeEventListener('vocalis-speech-error', onError);
  }, []);
  const navigateTo = (tab: AppNavTab) => {
    if (tab === activeTab) return;
    if (activeTab === 'recording' && recordingPending && !window.confirm('Leave this recording? An unkept take will be discarded. Kept recordings stay in your project.')) return;
    stopSpeaking(); setSpeechError('');
    if (tab === 'recording') setRecordingOpened(true);
    setActiveTab(tab);
  };

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
  const [savedTakes, setSavedTakes] = useState<GeneratedTake[]>([]);
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    readStoredTakes().then(stored => {
      if (cancelled) return;
      const restored = stored.map(({ audio, ...metadata }) => { const audioUrl = URL.createObjectURL(audio); urls.push(audioUrl); return { ...metadata, audioUrl }; });
      setSavedTakes(previous => [...new Map([...restored, ...previous].map(take => [take.id, take])).values()].sort((a, b) => b.createdAt - a.createdAt));
    }).catch(() => { if (!cancelled) setSpeechError('The audio vault could not open browser storage. Download WAV files to keep your audio.'); });
    return () => { cancelled = true; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, []);

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

  const handleDeleteCustomModel = async (id: string) => {
    const removed = models.find(model => model.id === id);
    const updated = models.filter(model => model.id !== id);
    try {
      localStorage.setItem('vocalis_natural_models', JSON.stringify(updated.filter(model => model.isCustom)));
      if (removed?.unitVoiceId && !updated.some(model => model.unitVoiceId === removed.unitVoiceId)) await deleteVoiceBank(removed.unitVoiceId);
      setModels(updated);
      if (activeModel.id === id) setActiveModel(PRESET_VOICE_MODELS[0]);
    } catch { setSpeechError('Could not completely remove this voice from browser storage. Try again before closing the app.'); }
  };

  const handleInstallBank = async (bank: VoiceBank) => {
    await saveVoiceBank(bank);
    const model = voiceModelForBank(bank);
    const custom = [...models.filter(item => item.isCustom && item.id !== model.id), model];
    try { localStorage.setItem('vocalis_natural_models', JSON.stringify(custom)); }
    catch { throw new Error('The bank could not be registered in browser storage. Export a .vvoice backup and try again after freeing storage.'); }
    handleSaveModel(model);
  };

  // Store actual audio, not ephemeral blob URLs, so the vault survives reloads.
  const handleSaveTake = async (take: GeneratedTake) => {
    try {
      await storeTake(take);
      setSavedTakes(previous => [take, ...previous.filter(item => item.id !== take.id)]);
    } catch (error) {
      setSpeechError('Could not save this audio to the vault. Download its WAV before leaving the page.');
      throw error;
    }
  };

  const handleDeleteTake = async (id: string) => {
    try {
      await removeStoredTake(id);
      setSavedTakes(previous => previous.filter(take => take.id !== id));
    } catch { setSpeechError('Could not delete this take from browser storage.'); }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Header with Unified Buttons */}
      <VoiceNavbar
        activeTab={activeTab}
        onSelectTab={navigateTo}
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
        {speechError && <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/30 p-4 text-sm text-rose-200 flex items-start justify-between gap-3"><span>{speechError}</span><button type="button" onClick={() => setSpeechError('')} className="underline shrink-0">Dismiss</button></div>}
        {/* Keep accepted recordings in memory when switching tabs, even if storage is blocked. */}
        {recordingOpened && (
          <div hidden={activeTab !== 'recording'}>
            <RecordingStudio active={activeTab === 'recording'} onPendingChange={setRecordingPending} onInstall={handleInstallBank} />
          </div>
        )}

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
            <img src="/brand/vocalis-mark.png" alt="" width={16} height={16} className="h-4 w-4 object-contain" />
            <span className="-ml-0.5 font-semibold bg-gradient-to-b from-[#fef5bd] to-[#c39b52] bg-clip-text text-transparent">ocalis</span>
            <span className="sr-only">Vocalis</span>
            <span>&bull;</span>
            <span>Voice Creation & Spoken Word Synthesizer</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span>Recorded sources · Local voice tools</span>
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
