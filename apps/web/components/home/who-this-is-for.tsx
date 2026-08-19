import { Eyebrow } from '@/components/ui/eyebrow';

export function WhoThisIsFor() {
  return (
    <section className="py-16 text-center sm:py-24">
      <Eyebrow as="h2">Who this is for</Eyebrow>
      <p className="mx-auto mt-6 max-w-3xl text-balance text-2xl leading-snug text-ink sm:text-4xl">
        For people who feel the body drifting from the person inside it, and want a clinical
        path back, <span className="italic text-muted">without the hype.</span>
      </p>
    </section>
  );
}
