import React, { useEffect, useRef } from 'react';
import { getDspAnalyser, isDspPlaying } from '../utils/audioDspEngine';

interface VoiceVisualizerProps {
  isPlaying: boolean;
  avatarColor?: string;
}

export const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({ isPlaying, avatarColor = '#6366f1' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const render = () => {
      if (!running) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const analyser = getDspAnalyser();
      const active = isPlaying && isDspPlaying() && !!analyser;

      if (!active || !analyser) {
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(dataArray);

      ctx.lineWidth = 2.5;
      ctx.strokeStyle = avatarColor || '#818cf8';
      ctx.beginPath();

      const sliceWidth = (width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      running = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, avatarColor]);

  return (
    <div className="w-full h-16 bg-slate-950/80 rounded-2xl border border-slate-800/80 p-2 overflow-hidden flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={600}
        height={64}
        className="w-full h-full block"
      />
    </div>
  );
};
