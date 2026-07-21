'use client';

import { useEffect, useRef } from 'react';

const BAR_COUNT = 24;

/**
 * Canvas bar visualizer driven by a live AnalyserNode — the bars move with the
 * actual audio (mic input while recording, Polly playback while the AI talks).
 * Color comes from `currentColor`, so Tailwind text classes style it with the
 * design tokens. Honors prefers-reduced-motion with a static render.
 */
export function VoiceVisualizer({
  analyser,
  className,
}: {
  analyser: AnalyserNode | null;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = getComputedStyle(canvas).color;

    const barWidth = width / BAR_COUNT / 2;
    const gap = width / BAR_COUNT / 2;

    const drawBars = (levels: number[]) => {
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < BAR_COUNT; i++) {
        const barHeight = Math.max(2, (levels[i] ?? 0) * height);
        const x = i * (barWidth + gap) + gap / 2;
        const y = (height - barHeight) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
        ctx.fill();
      }
    };

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!analyser || reducedMotion) {
      // Static idle/reduced-motion state: gentle fixed bars.
      drawBars(Array.from({ length: BAR_COUNT }, (_, i) => 0.12 + 0.08 * Math.sin(i / 2)));
      return;
    }

    const bins = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    const loop = () => {
      analyser.getByteFrequencyData(bins);
      // Group bins into bars, skipping the near-DC bottom end.
      const usable = Math.floor(bins.length * 0.7);
      const perBar = Math.max(1, Math.floor(usable / BAR_COUNT));
      const levels: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let j = 0; j < perBar; j++) sum += bins[i * perBar + j] ?? 0;
        levels.push(Math.min(1, (sum / perBar / 255) * 1.4));
      }
      drawBars(levels);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [analyser]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
