import { Bracket } from '@joice/ui';
import { CtaLink } from '@/components/ui/cta-link';
import { ImageSlot } from '@/components/ui/image-slot';

/**
 * The thesis. The photo comes first, edge to edge under the nav:
 * `public/hero.png` carries the lockup ("Joice · Preserving [ you ]") in the
 * picture itself, so nothing is laid over it. Underneath, one light sentence
 * and the dotted pills, then the green panel: the brand line in scattered
 * white mono with the way into Ask Joice (a photo can take its place at
 * `public/statement.jpg`; until then ImageSlot draws the organic field).
 */
export function Hero() {
  return (
    <section>
      <ImageSlot
        src="hero.png"
        alt="Joice. Preserving you: a fingertip drawing a line of cream across a forearm."
        priority
        sizes="100vw"
        className="relative left-1/2 aspect-square w-screen -translate-x-1/2 sm:aspect-[2/1] sm:max-h-[72vh]"
      />

      <div className="mx-auto flex max-w-3xl flex-col items-center py-16 text-center animate-fade-up sm:py-24">
        <h1 className="text-balance text-3xl leading-[1.15] text-ink sm:text-5xl">
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
        src="statement.jpg"
        alt=""
        sizes="(min-width: 1152px) 1152px, 100vw"
        className="aspect-[4/5] rounded-card text-white sm:aspect-[21/9]"
      >
        <p className="mono-label absolute inset-x-0 top-[22%] mx-auto grid w-[min(80%,26rem)] gap-5 text-sm text-white sm:top-[28%] sm:text-base">
          <span className="justify-self-start">The you</span>
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
