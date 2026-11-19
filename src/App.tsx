import React, { useEffect, useState } from 'react';
import { initializeLocalSpeechEngine, type VoiceModelConfig, PRESET_VOICE_MODELS } from './utils/naturalVoiceEngine';
import type { GeneratedTake } from './types/voice';
import { VoiceNavbar, type AppNavTab } from './components/VoiceNavbar';
import { VoiceCreator } from './components/VoiceCreator';
import { OriginalVoiceSet } from './components/OriginalVoiceSet';
import { VariantVoiceLibrary } from './components/VariantVoiceLibrary';
import { SimpleNarrationStudio } from './components/SimpleNarrationStudio';
import { stopSpeaking } from './utils/naturalVoiceEngine';
import { deleteVoiceBank } from './utils/voiceBankStorage';
import { readStoredTakes, storeTake, removeStoredTake } from './utils/takeStorage';
import { assertCanPersistVoiceDefinition } from './utils/voiceProvenance';
import { ensureOriginalAssetRecords } from './utils/voiceAssetStorage';

export function App() {
  const [activeTab, setActiveTab] = useState<AppNavTab>('originals');
  const [speechError, setSpeechError] = useState('');

  useEffect(() => {
    const onError = (event: Event) => setSpeechError((event as CustomEvent<string>).detail);
    window.addEventListener('vocalis-speech-error', onError);
    return () => window.removeEventListener('vocalis-speech-error', onError);
  }, []);

  const navigateTo = (tab: AppNavTab) => {
    stopSpeaking();
    setSpeechError('');
    setActiveTab(tab);
  };

  // Browser storage may contain old custom entries, but it can never reclassify
  // a protected imported definition as a mutable original.
  const [models, setModels] = useState<VoiceModelConfig[]>(() => {
    try {
      const saved = localStorage.getItem('vocalis_natural_models');
      const customOnly = saved && Array.isArray(JSON.parse(saved))
        ? JSON.parse(saved).filter((model: VoiceModelConfig) => model.isCustom).map((model: VoiceModelConfig) => ({
            ...model,
            sourceType: model.sourceType === 'original' ? 'derived' : (model.sourceType || 'derived'),
            isLockedOriginal: false,
            reviewState: model.reviewState || 'candidate',
          }))
        : [];
      return [...PRESET_VOICE_MODELS, ...customOnly];
    } catch {
      return PRESET_VOICE_MODELS;
    }
  });
  const [activeModel, setActiveModel] = useState<VoiceModelConfig>(models[0]);

  useEffect(() => {
    void ensureOriginalAssetRecords(PRESET_VOICE_MODELS).catch(() => {
      setSpeechError('Original source provenance metadata could not be opened in browser storage. Source audio remains read-only.');
    });
  }, []);

  useEffect(() => {
    initializeLocalSpeechEngine(activeModel);
  }, [activeModel.gender, activeModel.baseVoiceId, activeModel.synthesisMethod, activeModel.renderMode]);

  const [savedTakes, setSavedTakes] = useState<GeneratedTake[]>([]);
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    readStoredTakes().then((stored) => {
      if (cancelled) return;
      const restored = stored.map(({ audio, ...metadata }) => {
        const audioUrl = URL.createObjectURL(audio);
        urls.push(audioUrl);
        return { ...metadata, audioUrl };
      });
      setSavedTakes((previous) => [...new Map([...restored, ...previous].map((take) => [take.id, take])).values()].sort((a, b) => b.createdAt - a.createdAt));
    }).catch(() => {
      if (!cancelled) setSpeechError('The saved audio could not be opened in browser storage.');
    });
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const handleSaveModel = (newModel: VoiceModelConfig) => {
    try {
      assertCanPersistVoiceDefinition(newModel);
    } catch (error) {
      setSpeechError(error instanceof Error ? error.message : 'Original library definitions cannot be changed.');
      return;
    }
    const toSave: VoiceModelConfig = {
      ...newModel,
      isCustom: true,
      sourceType: newModel.sourceType || 'derived',
      reviewState: newModel.reviewState || 'candidate',
      isLockedOriginal: false,
    };
    setModels((previous) => {
      const index = previous.findIndex((model) => model.id === toSave.id);
      const next = index >= 0 ? previous.map((model, current) => current === index ? toSave : model) : [toSave, ...previous];
      try { localStorage.setItem('vocalis_natural_models', JSON.stringify(next.filter((model) => model.isCustom))); }
      catch { setSpeechError('This new voice could not be saved in browser storage.'); }
      return next;
    });
    setActiveModel(toSave);
  };

  const handleDeleteCustomModel = async (id: string) => {
    const removed = models.find((model) => model.id === id);
    const next = models.filter((model) => model.id !== id);
    try {
      localStorage.setItem('vocalis_natural_models', JSON.stringify(next.filter((model) => model.isCustom)));
      if (removed?.unitVoiceId && !next.some((model) => model.unitVoiceId === removed.unitVoiceId)) await deleteVoiceBank(removed.unitVoiceId);
      setModels(next);
      if (activeModel.id === id) setActiveModel(PRESET_VOICE_MODELS[0]);
    } catch {
      setSpeechError('This created voice could not be fully removed from browser storage.');
    }
  };

  const handleSaveTake = async (take: GeneratedTake) => {
    try {
      await storeTake(take);
      setSavedTakes((previous) => [take, ...previous.filter((item) => item.id !== take.id)]);
    } catch (error) {
      setSpeechError('The audio could not be saved locally. Download it before leaving this page.');
      throw error;
    }
  };

  const handleDeleteTake = async (id: string) => {
    try {
      await removeStoredTake(id);
      setSavedTakes((previous) => previous.filter((take) => take.id !== id));
    } catch {
      setSpeechError('The saved audio could not be removed from browser storage.');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 font-sans text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      <VoiceNavbar activeTab={activeTab} onSelectTab={navigateTo} />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {speechError && <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-800 bg-rose-950/30 p-4 text-sm text-rose-200"><span>{speechError}</span><button type="button" onClick={() => setSpeechError('')} className="shrink-0 underline">Dismiss</button></div>}
        {activeTab === 'originals' && <OriginalVoiceSet voices={models} />}
        {activeTab === 'creator' && <VoiceCreator voices={models} activeVoice={activeModel} onSaveModel={handleSaveModel} onSaveTake={handleSaveTake} onGoToHub={(model) => { if (model) setActiveModel(model); setActiveTab('variants'); }} />}
        {activeTab === 'variants' && <VariantVoiceLibrary voices={models} savedTakes={savedTakes} onDeleteCustomModel={handleDeleteCustomModel} onDeleteTake={handleDeleteTake} />}
        {activeTab === 'narrate' && <SimpleNarrationStudio voices={models} />}
      </main>
      <footer className="mt-auto border-t border-slate-900 bg-slate-950/80 py-4 text-xs text-slate-500"><div className="mx-auto flex max-w-7xl items-center gap-2 px-4"><span>Protected originals</span><span>•</span><span>Separate created variants</span><span>•</span><span>Local MP3 narration export</span></div></footer>
    </div>
  );
}

export default App;
