import type { Metadata } from 'next';
import { PageIntro } from '@/components/ui/page-intro';
import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';
import { GetStartedCta } from '@/components/ui/get-started-cta';

export const metadata: Metadata = {
  title: 'Our Story · Joice',
  description: 'Why we built Joice, what the name means, and the standard we hold.',
};

export default function StoryPage() {
  return (
    <>
      <PageIntro eyebrow="Our story" title="The body drifts. The person doesn’t.">
        Joice exists for the gap between how you feel and who you are, and for closing it
        with real medicine instead of hype.
      </PageIntro>

      {/* The promise */}
      <section className="border-t border-line py-16 text-center sm:py-20">
        <Eyebrow as="h2">The promise</Eyebrow>
        <p className="mx-auto mt-6 max-w-3xl text-balance text-2xl leading-snug text-ink sm:text-4xl">
          Clinician-guided peptide care, built to keep you{' '}
          <span className="italic text-muted">yourself.</span>
        </p>
      </section>

      {/* The name story + mission */}
      <div className="grid gap-x-16 gap-y-10 border-t border-line py-16 sm:py-20 lg:grid-cols-2">
        <section>
          <Eyebrow as="h2">The name</Eyebrow>
          <p className="mt-4 text-pretty text-xl italic leading-snug text-ink sm:text-2xl">
            Where the name comes from.
          </p>
          <p className="mt-3 text-base leading-relaxed text-muted">
            The story behind “Joice”, pending content pass.
          </p>
        </section>

        <section>
          <Eyebrow as="h2">Mission</Eyebrow>
          <p className="mt-4 text-pretty text-xl leading-snug text-ink sm:text-2xl">
            Make clinical-grade care the default, not the loophole.
          </p>
          <p className="mt-3 text-base leading-relaxed text-muted">
            Sourced and tested with proof. Priced near cost, on purpose. Prescribed only when
            it&apos;s right.
          </p>
        </section>
      </div>

      {/* People / clinical advisory */}
      <section className="border-t border-line py-12 sm:py-16">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Eyebrow as="h2">The people</Eyebrow>
            <p className="mt-3 max-w-md text-xl leading-snug text-ink sm:text-2xl">
              Built with a standing clinical board, not a logo wall.
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex -space-x-3">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="h-11 w-11 rounded-full border-2 border-canvas bg-stone/50"
                />
              ))}
            </div>
            <CtaLink href="/clinical-team" className="shrink-0">
              Meet the clinical team +
            </CtaLink>
          </div>
        </div>
      </section>

      <GetStartedCta />
    </>
  );
}
