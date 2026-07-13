import { WaterBackground } from './water-background';

/**
 * Full-bleed looping video behind everything — the layer the frosted-glass
 * surfaces refract against. Rendered through a WebGL water shader that ripples
 * on mouse move (falls back to the plain video when WebGL/motion is unavailable).
 */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas">
      <WaterBackground src="/background.mp4" className="absolute inset-0 h-full w-full object-cover" />
      {/* Scrim to soften the video so the dark text/glass stays legible. */}
      <div className="absolute inset-0 bg-canvas/75" />
    </div>
  );
}
