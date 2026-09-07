import { CtaLink } from '@/components/ui/cta-link';
import { ImageSlot } from '@/components/ui/image-slot';
import { CERT_SHOP } from '@/lib/cert-routes';

/**
 * The storefront hero: the main-site hero trimmed to its thesis. Same photo,
 * same headline, one action that leads into the shelf. The statement panel and
 * the Ask Joice band stay on the gated site; nothing here may link there.
 */
export function HomeHero() {
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
        <div className="mt-9">
          <CtaLink href={CERT_SHOP} size="lg">
            Get started +
          </CtaLink>
        </div>
      </div>
    </section>
  );
}
