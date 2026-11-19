import { analysePcm, type AcousticAnalysis } from '../utils/voiceAnalysis';

type AnalysisRequest = { id: string; samples: ArrayBuffer; sampleRate: number };

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const { id, samples, sampleRate } = event.data;
  try {
    const analysis = analysePcm(new Float32Array(samples), sampleRate);
    self.postMessage({ id, analysis } satisfies { id: string; analysis: AcousticAnalysis });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'Acoustic analysis failed.' });
  }
};
