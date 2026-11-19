import type { AcousticAnalysis } from './voiceAnalysis';

/** Runs frame analysis off the UI thread; the source AudioBuffer remains untouched. */
export function analyseAudioBufferInWorker(buffer: AudioBuffer): Promise<AcousticAnalysis> {
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    for (let index = 0; index < mono.length; index++) mono[index] += source[index] / buffer.numberOfChannels;
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/voiceAnalysisWorker.ts', import.meta.url), { type: 'module' });
    const id = crypto.randomUUID();
    worker.onmessage = (event: MessageEvent<{ id: string; analysis?: AcousticAnalysis; error?: string }>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.analysis) resolve(event.data.analysis);
      else reject(new Error('The analysis worker returned no result.'));
    };
    worker.onerror = () => { worker.terminate(); reject(new Error('The acoustic analysis worker failed.')); };
    worker.postMessage({ id, samples: mono.buffer, sampleRate: buffer.sampleRate }, [mono.buffer]);
  });
}
