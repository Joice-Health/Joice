import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';

/** The closing statement, in the condensed display voice, on the paper. */
export function GetStartedCta() {
  return (
    <section className="border-t border-line py-20 text-center sm:py-28">
      <Eyebrow as="p">Ready when you are</Eyebrow>
      <p className="display mx-auto mt-6 max-w-4xl text-balance text-6xl text-ink sm:text-8xl">
        The new standard of you.
      </p>
      <CtaLink href="/get-started" size="lg" className="mt-10">
        Let&apos;s begin +
      </CtaLink>
    </section>
  );
}
