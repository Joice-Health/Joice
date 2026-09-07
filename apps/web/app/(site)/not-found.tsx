import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';

/**
 * Scoped boundary so a product or category page's notFound() renders styled
 * inside the site chrome instead of Next's bare default (the root deliberately
 * has no not-found page; the (store) group carries its own).
 */
export default function SiteNotFound() {
  return (
    <section className="flex flex-col items-center py-24 text-center sm:py-32">
      <Eyebrow as="p">Not found</Eyebrow>
      <p className="mt-6 max-w-md text-balance text-2xl text-ink sm:text-3xl">
        That page isn&apos;t available.
      </p>
      <CtaLink href="/shop" className="mt-10">
        Browse the shop +
      </CtaLink>
    </section>
  );
}
