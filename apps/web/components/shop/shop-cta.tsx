import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';

/**
 * The storefront's closing statement: GetStartedCta's shape with the one
 * difference that matters here, the action leads to /shop, not the gated
 * intake.
 */
export function ShopCta() {
  return (
    <section className="border-t border-line py-20 text-center sm:py-28">
      <Eyebrow as="p">Ready when you are</Eyebrow>
      <p className="display mx-auto mt-6 max-w-4xl text-balance text-6xl text-ink sm:text-8xl">
        The new standard of you.
      </p>
      <CtaLink href="/shop" size="lg" className="mt-10">
        Get started +
      </CtaLink>
    </section>
  );
}
