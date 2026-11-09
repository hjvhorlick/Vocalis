import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecordingQuality } from '../types/recording';
import { MAX_RECORDING_SECONDS, prepareRecording } from '../utils/recordingAudio';

export type RecordingDraft = { audio: Blob; quality: RecordingQuality };
type Phase = 'idle' | 'requesting' | 'recording' | 'processing' | 'review';

export function useSentenceRecorder() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [draft, setDraft] = useState<RecordingDraft | null>(null);
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const generation = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const animation = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const release = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    cancelAnimationFrame(animation.current);
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    void context.current?.close().catch(() => {});
    context.current = null;
  }, []);

  const cancel = useCallback(() => {
    generation.current++;
    if (recorder.current) {
      recorder.current.onstop = null;
      recorder.current.onerror = null;
      if (recorder.current.state !== 'inactive') recorder.current.stop();
    }
    recorder.current = null;
    release();
    setDraft(null); setLevel(0); setSeconds(0); setPhase('idle'); setError('');
  }, [release]);

  useEffect(() => () => {
    generation.current++;
    if (recorder.current) {
      recorder.current.onstop = null;
      recorder.current.onerror = null;
      if (recorder.current.state !== 'inactive') recorder.current.stop();
    }
    release();
  }, [release]);

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') {
      setPhase('processing');
      recorder.current.stop();
      release();
      setLevel(0);
    }
  }, [release]);

  const start = async () => {
    cancel();
    const token = generation.current;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Recording needs a supported browser on HTTPS. Open the preview in a new tab if microphone access is blocked.');
      return;
    }
    setPhase('requesting');
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      if (generation.current !== token) { input.getTracks().forEach(track => track.stop()); return; }
      stream.current = input;
      const ctx = new AudioContext(); context.current = ctx;
      await ctx.resume();
      if (generation.current !== token) return;
      const analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
      ctx.createMediaStreamSource(input).connect(analyser); // No monitoring: avoids feedback.
      const preferredType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const capture = new MediaRecorder(input, preferredType ? { mimeType: preferredType } : undefined);
      recorder.current = capture;
      const chunks: Blob[] = [];
      capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      capture.onerror = () => {
        if (generation.current !== token) return;
        cancel(); setError('The microphone recording was interrupted. Please try again.');
      };
      capture.onstop = async () => {
        release();
        if (generation.current !== token) return;
        setPhase('processing'); setLevel(0);
        try {
          const result = await prepareRecording(new Blob(chunks, { type: capture.mimeType }));
          if (generation.current !== token) return;
          setDraft(result); setPhase('review');
        } catch {
          if (generation.current !== token) return;
          setError('Could not decode this recording. Try again, or use a current Chrome, Edge, Firefox, or Safari browser.');
          setPhase('idle');
        }
      };
      capture.start(200);
      setPhase('recording');
      const started = performance.now();
      const samples = new Float32Array(analyser.fftSize);
      const tick = () => {
        if (generation.current !== token) return;
        analyser.getFloatTimeDomainData(samples);
        let peak = 0;
        for (const value of samples) peak = Math.max(peak, Math.abs(value));
        setLevel(peak); setSeconds(Math.min(MAX_RECORDING_SECONDS, (performance.now() - started) / 1000));
        animation.current = requestAnimationFrame(tick);
      };
      tick();
      timeout.current = setTimeout(stop, MAX_RECORDING_SECONDS * 1000);
    } catch (cause) {
      if (generation.current !== token) return;
      cancel();
      const name = cause instanceof DOMException ? cause.name : '';
      setError(name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow it in your browser settings. If the embedded preview blocks it, open the preview in a new tab.'
        : name === 'NotFoundError' ? 'No microphone found. Connect a microphone and try again.'
        : name === 'NotReadableError' ? 'The microphone is busy. Close other apps using it and try again.'
        : 'Could not start the microphone. Check your device and browser permissions, then try again.');
    }
  };

  const loadAudio = async (file: File) => {
    cancel();
    if (file.size > 20 * 1024 * 1024) { setError('Choose an audio take under 20 MiB and 30 seconds.'); return; }
    const token = generation.current;
    setPhase('processing');
    try {
      const result = await prepareRecording(file);
      if (token !== generation.current) return;
      setDraft(result); setPhase('review');
    } catch (cause) {
      if (token !== generation.current) return;
      setPhase('idle'); setError(cause instanceof Error ? cause.message : 'Could not decode that audio file.');
    }
  };

  return { phase, draft, error, level, seconds, start, stop, cancel, loadAudio };
}
