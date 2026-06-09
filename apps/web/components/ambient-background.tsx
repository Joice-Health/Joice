/**
 * The soft light field that lives behind everything — three blurred color auras
 * over the canvas, plus a faint grain layer. This is what gives the frosted-glass
 * surfaces something to refract, so they read as glass rather than flat panels.
 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas">
      <div
        className="absolute left-1/2 top-[-12%] h-[44rem] w-[44rem] -translate-x-1/2 rounded-full opacity-70 blur-[130px] animate-drift"
        style={{
          background:
            'radial-gradient(circle at center, var(--color-aura-warm) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute left-[-12%] top-[28%] h-[34rem] w-[34rem] rounded-full opacity-60 blur-[130px] animate-drift [animation-delay:-6s]"
        style={{
          background:
            'radial-gradient(circle at center, var(--color-aura-sage) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute right-[-14%] bottom-[-12%] h-[38rem] w-[38rem] rounded-full opacity-50 blur-[130px] animate-drift [animation-delay:-12s]"
        style={{
          background:
            'radial-gradient(circle at center, var(--color-aura-cool) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-soft-light"
        style={{ backgroundImage: GRAIN, backgroundRepeat: 'repeat' }}
      />
    </div>
  );
}
