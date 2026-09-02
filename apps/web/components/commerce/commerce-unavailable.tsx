import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';

/**
 * The quiet state for "CarePortals could not be read" on the production shop:
 * the page keeps its chrome and says so plainly instead of erroring (the cert
 * surface's ShopUnavailable, duplicated on purpose; cert components are never
 * shared).
 */
export function CommerceUnavailable({ backLink = false }: { backLink?: boolean }) {
  return (
    <section className="border-t border-line py-14 text-center sm:py-16">
      <Eyebrow as="p">One moment</Eyebrow>
      <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-muted">
        Products are temporarily unavailable. Please check back shortly.
      </p>
      {backLink ? (
        <CtaLink href="/shop" className="mt-8">
          Back to the shop +
        </CtaLink>
      ) : null}
    </section>
  );
}
