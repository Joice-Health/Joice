import { Eyebrow } from '@/components/ui/eyebrow';

export function Standards() {
  return (
    <section className="border-t border-line/60 py-16 sm:py-20">
      <Eyebrow>What the board determines</Eyebrow>
      <p className="mt-6 max-w-3xl text-balance text-2xl leading-snug tracking-[-0.01em] text-ink sm:text-4xl">
        Protocols, sourcing standards, dosing guardrails —{' '}
        <span className="italic text-muted">and when the answer is no.</span>
      </p>
      <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted">
        Every care area follows written standards the board owns: what we offer, how it&apos;s
        sourced and tested, how it&apos;s dosed, and who it isn&apos;t for.
      </p>
    </section>
  );
}
