import type { Metadata } from 'next';
import { requireShopEnabled } from '@/lib/shop-gate';
import { getCuratedProducts } from '@/lib/careportals/products.server';
import { SHOP_PRODUCT_IDS } from '@/lib/shop-products';
import { PageIntro } from '@/components/ui/page-intro';
import { ShopProductRow } from '@/components/shop/shop-product-row';
import { ShopUnavailable } from '@/components/shop/shop-unavailable';
import { Eyebrow } from '@/components/ui/eyebrow';

export const metadata: Metadata = {
  title: 'Shop · Joice',
  description: 'Clinician-set peptide protocols with live pricing.',
};

/** The hues that keep neighbouring image fields from reading as one tile. */
const HUES = [128, 96, 60, 150];

/**
 * The shelf: the curated CarePortals products, live names and prices. One
 * upstream read per cache window; an unreadable upstream or an emptied
 * curation renders a quiet section, never an error.
 */
export default async function ShopPage() {
  await requireShopEnabled();
  const products = await getCuratedProducts(SHOP_PRODUCT_IDS);

  return (
    <>
      <PageIntro eyebrow="The shop" title="Protocols">
        Set by clinicians, priced near cost. Payment and prescription review complete on our
        secure care portal.
      </PageIntro>

      {products === undefined ? (
        <ShopUnavailable />
      ) : products.length === 0 ? (
        <section className="border-t border-line py-14 text-center sm:py-16">
          <Eyebrow as="p">One moment</Eyebrow>
          <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-muted">
            New protocols are on the way.
          </p>
        </section>
      ) : (
        <ul className="border-t border-line pb-8">
          {products.map((product, i) => (
            <ShopProductRow key={product._id} product={product} hue={HUES[i % HUES.length]} />
          ))}
        </ul>
      )}
    </>
  );
}
