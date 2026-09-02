import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';
import { CERT_SHOP } from '@/lib/cert-routes';

/**
 * Scoped boundary so a product page's notFound() renders styled inside the
 * shop chrome instead of Next's bare default (the root deliberately has no
 * not-found page).
 */
export default function ShopNotFound() {
  return (
    <section className="flex flex-col items-center py-24 text-center sm:py-32">
      <Eyebrow as="p">Not found</Eyebrow>
      <p className="mt-6 max-w-md text-balance text-2xl text-ink sm:text-3xl">
        That product isn&apos;t available.
      </p>
      <CtaLink href={CERT_SHOP} className="mt-10">
        Back to the shop +
      </CtaLink>
    </section>
  );
}
