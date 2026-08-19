import { Bracket } from '@joice/ui';
import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';
import { ImageSlot } from '@/components/ui/image-slot';

/**
 * The thesis. A mono label, one light sentence, one dotted pill, then the
 * photo panel with its soft top corners. The panel carries the brand line in
 * scattered white mono, so the slot means something before the photo lands
 * (drop it at apps/web/public/hero.jpg).
 */
export function Hero() {
  return (
    <section className="pt-14 sm:pt-24">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center animate-fade-up">
        <Eyebrow as="p" className="text-sm">
          Preserving{' '}
          <span className="normal-case">
            <Bracket>you</Bracket>
          </span>
        </Eyebrow>
        <h1 className="mt-8 text-balance text-3xl leading-[1.15] text-ink sm:text-5xl">
          Health and longevity to protect the you inside your head.
        </h1>
        <p className="mt-6 max-w-lg text-pretty text-lg leading-relaxed text-muted">
          Clinician-guided peptide care. Protocols set by clinicians, sourced and tested with
          proof, priced near cost, on purpose.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <CtaLink href="/get-started" size="lg">
            Let&apos;s begin +
          </CtaLink>
          <CtaLink href="/how-it-works" variant="ghost" size="lg">
            How it works +
          </CtaLink>
        </div>
      </div>

      <ImageSlot
        src="hero.jpg"
        alt=""
        priority
        sizes="(min-width: 1152px) 1152px, 100vw"
        className="mt-14 aspect-[4/5] rounded-t-card text-white sm:mt-20 sm:aspect-[21/9]"
      >
        <p className="mono-label absolute inset-x-0 top-[22%] mx-auto grid w-[min(80%,26rem)] gap-5 text-sm text-white sm:top-[28%] sm:text-base">
          <span className="justify-self-start">
            The you
          </span>
          <span className="justify-self-center normal-case">
            <Bracket>inside</Bracket>
          </span>
          <span className="justify-self-end">your head</span>
        </p>
        <div className="absolute inset-x-0 bottom-8 flex justify-center sm:bottom-10">
          <CtaLink href="/ask" size="lg" className="text-white">
            Ask Joice +
          </CtaLink>
        </div>
      </ImageSlot>
    </section>
  );
}
