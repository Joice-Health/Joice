import { Eyebrow } from '@/components/ui/eyebrow';

export function WhoThisIsFor() {
  return (
    <section className="border-t border-line/60 py-16 sm:py-20">
      <Eyebrow>Who this is for</Eyebrow>
      <p className="mt-6 max-w-3xl text-balance text-2xl leading-snug tracking-[-0.01em] text-ink sm:text-4xl">
        For people who feel the body drifting from the person inside it — and want a clinical
        path back, <span className="italic text-muted">without the hype.</span>
      </p>
    </section>
  );
}
