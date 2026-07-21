'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Writes the live audio amplitude (0–1) to a `--level` CSS custom property on
 * the given element, so the sun's corona and the horizon glow are driven by the
 * member's actual voice — or the assistant's — rather than a canned animation.
 *
 * One rAF loop feeds every dependent style, since custom properties inherit.
 */
export function useAudioLevel(
  ref: RefObject<HTMLElement | null>,
  analyser: AnalyserNode | null,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!analyser) {
      el.style.setProperty('--level', '0');
      return;
    }

    const bins = new Uint8Array(analyser.frequencyBinCount);
    let smoothed = 0;
    let frame = requestAnimationFrame(function loop() {
      analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (let i = 0; i < bins.length; i++) sum += bins[i]!;
      const level = Math.min(1, (sum / bins.length / 255) * 2.4);
      // Ease toward the target so the light swells rather than flickers.
      smoothed += (level - smoothed) * 0.22;
      el.style.setProperty('--level', smoothed.toFixed(3));
      frame = requestAnimationFrame(loop);
    });

    return () => {
      cancelAnimationFrame(frame);
      el.style.setProperty('--level', '0');
    };
  }, [ref, analyser]);
}
