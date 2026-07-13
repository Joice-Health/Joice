import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';

/** The page's one dark, high-contrast moment. */
export function ClosingCta() {
  return (
    <section className="relative overflow-hidden rounded-card bg-ink px-6 py-16 text-center sm:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          background:
            'radial-gradient(60% 80% at 50% 120%, var(--color-card-from) 0%, transparent 70%)',
        }}
      />
      <div className="relative">
        <Eyebrow className="text-card-to">Ready when you are</Eyebrow>
        <p className="mx-auto mt-4 max-w-xl text-balance text-3xl leading-snug tracking-[-0.02em] text-canvas sm:text-4xl">
          The new standard of you.
        </p>
        <CtaLink href="/get-started" variant="inverted" size="lg" className="mt-8">
          Get Started
        </CtaLink>
      </div>
    </section>
  );
}
