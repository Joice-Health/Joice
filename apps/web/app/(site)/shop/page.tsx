import type { Metadata } from 'next';
import Link from 'next/link';
import { Index } from '@joice/ui';
import { requireCommerceEnabled } from '@/lib/commerce-gate';
import { getMerchandisedCatalog } from '@/lib/shop-catalog.server';
import { CARE_AREAS } from '@/lib/site-content';
import { PageIntro } from '@/components/ui/page-intro';
import { Eyebrow } from '@/components/ui/eyebrow';
import { CommerceProductRow } from '@/components/commerce/commerce-product-row';
import { CommerceUnavailable } from '@/components/commerce/commerce-unavailable';

export const metadata: Metadata = {
  title: 'Shop · Joice',
  description: 'Clinician-set peptide protocols by care area, with live pricing.',
};

/**
 * Render per request, never prerender: at image build time no API exists, so a
 * prerender would bake requireCommerceEnabled's flag-off redirect into the
 * static artifact and the live flag could never open the page (the 8db5395
 * incident). The CarePortals data cache keeps its own revalidate window.
 */
export const dynamic = 'force-dynamic';

/**
 * The production catalogue (docs/shop/01-commerce.md section 2): the care-area
 * index up top (the explore-page idiom), then a shelf section per area. Areas
 * with nothing live to sell are hidden from the index and the shelves
 * (stress-sleep today); an unreadable upstream renders the quiet unavailable
 * state, never an error. A product appears on the shelf of its primary area
 * only; its category pages also list it under any secondary area.
 */
export default async function ShopPage() {
  await requireCommerceEnabled();
  const catalog = await getMerchandisedCatalog();

  if (catalog === undefined) {
    return (
      <>
        <Intro />
        <CommerceUnavailable />
      </>
    );
  }

  const areas = CARE_AREAS.map((area) => ({
    area,
    products: catalog.filter((p) => p.entry.areas[0] === area.slug).sort(
      (a, b) => (a.entry.rank ?? 99) - (b.entry.rank ?? 99),
    ),
  })).filter(({ products }) => products.length > 0);

  return (
    <>
      <Intro />

      <section className="border-t border-line py-14 animate-fade-up sm:py-16">
        <Eyebrow as="h2">By care area</Eyebrow>
        <ol className="mt-8 border-t border-line">
          {areas.map(({ area }, i) => (
            <li key={area.slug} className="border-b border-line">
              <Link
                href={`/shop/${area.slug}`}
                className="group grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2 py-6 sm:grid-cols-[6rem_1fr_1fr] sm:gap-x-8"
              >
                <span className="mono-label text-muted">
                  <Index n={i + 1} />
                </span>
                <h3 className="display text-3xl text-ink transition-colors group-hover:text-brand-700 sm:text-5xl">
                  {area.name}
                </h3>
                <p className="col-start-2 max-w-sm text-base leading-relaxed text-muted sm:col-start-3">
                  {area.blurb}
                </p>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {areas.map(({ area, products }) => (
        <section key={area.slug} className="border-t border-line py-14 sm:py-16">
          <div className="flex items-baseline justify-between">
            <Eyebrow as="h2">{area.name}</Eyebrow>
            <Link
              href={`/shop/${area.slug}`}
              className="mono-label text-muted transition-colors hover:text-ink"
            >
              View the category +
            </Link>
          </div>
          <ul className="mt-8 border-t border-line">
            {products.map((product) => (
              <CommerceProductRow key={product.entry.slug} product={product} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function Intro() {
  return (
    <PageIntro title="Shop">
      Protocols set by clinicians, priced near cost, with live pricing. Add to your cart and
      check out here; a licensed physician reviews every order before it ships.
    </PageIntro>
  );
}
