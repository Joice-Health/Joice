import type { Metadata } from 'next';
import Link from 'next/link';
import { Index } from '@joice/ui';
import { PageIntro } from '@/components/ui/page-intro';
import { Eyebrow } from '@/components/ui/eyebrow';
import { ProductRow } from '@/components/ui/product-row';
import { GetStartedCta } from '@/components/ui/get-started-cta';
import { CARE_AREAS } from '@/lib/site-content';
import { SHOP_CATALOG } from '@/lib/shop-catalog';

export const metadata: Metadata = {
  title: 'Explore · Joice',
  description: 'Browse clinician-guided protocols by care area.',
};

/** Explore landing (L2): care-area list primary, browse-by-product secondary. */
export default function ExplorePage() {
  return (
    <>
      <PageIntro eyebrow="Explore" title="Start with what you want to change.">
        Five care areas, each with protocols set and reviewed by our clinical team. When
        something looks right, add it to your cart; a licensed physician reviews every order
        before it ships.
      </PageIntro>

      {/* Care-area list, primary */}
      <section className="border-t border-line py-16 sm:py-20">
        <Eyebrow as="h2">By care area</Eyebrow>
        <ol className="mt-8 border-t border-line">
          {CARE_AREAS.map((area, i) => (
            <li key={area.slug} className="border-b border-line">
              <Link
                href={`/explore/${area.slug}`}
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

      {/* Browse by product, secondary */}
      <section className="pb-16 sm:pb-20">
        <Eyebrow as="h2" className="text-center">
          Shop
        </Eyebrow>
        <ul className="mt-8 border-t border-line">
          {SHOP_CATALOG.slice(0, 4).map((entry) => (
            <ProductRow key={entry.slug} entry={entry} />
          ))}
        </ul>
      </section>

      {/* Expectation-setter: buying has a clinician in the loop */}
      <section className="border-t border-line py-16 text-center sm:py-20">
        <Eyebrow as="h2">How buying works here</Eyebrow>
        <p className="mx-auto mt-5 max-w-2xl text-balance text-xl leading-snug text-ink sm:text-2xl">
          Add to your cart and check out here. Then a short medical intake, and a licensed
          physician prescribes only if it&apos;s right for you; the pharmacy ships from there.
        </p>
      </section>

      <GetStartedCta />
    </>
  );
}
