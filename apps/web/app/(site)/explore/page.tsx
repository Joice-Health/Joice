import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '@/components/ui/page-intro';
import { Eyebrow } from '@/components/ui/eyebrow';
import { ProductCard } from '@/components/ui/product-card';
import { GetStartedCta } from '@/components/ui/get-started-cta';
import { CARE_AREAS, PRODUCTS } from '@/lib/site-content';

export const metadata: Metadata = {
  title: 'Explore · Joice',
  description: 'Browse clinician-guided protocols by care area.',
};

/** Explore landing (L2): care-area grid primary, browse-by-product secondary. */
export default function ExplorePage() {
  return (
    <>
      <PageIntro eyebrow="Explore" title="Start with what you want to change.">
        Five care areas, each with protocols set and reviewed by our clinical team. No cart,
        no checkout — a clinician decides with you.
      </PageIntro>

      {/* Care-area grid — primary */}
      <section className="border-t border-line/60 py-16 sm:py-20">
        <Eyebrow>By care area</Eyebrow>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARE_AREAS.map((area, i) => (
            <Link
              key={area.slug}
              href={`/explore/${area.slug}`}
              className="group flex min-h-44 flex-col justify-between rounded-card bg-surface p-6 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_56px_-28px_rgba(40,35,25,0.6)]"
            >
              <span className="font-mono text-[10px] tracking-[0.15em] text-muted">
                0{i + 1}
              </span>
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-ink">
                  {area.name}
                  <span className="ml-1.5 inline-block text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink">
                    →
                  </span>
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{area.blurb}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Browse by product — secondary */}
      <section className="pb-16 sm:pb-20">
        <Eyebrow>Or browse by product</Eyebrow>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCTS.slice(0, 4).map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      </section>

      {/* Expectation-setter — "no cart" */}
      <section className="glass mb-16 rounded-card p-6 text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_24px_60px_-32px_rgba(40,35,25,0.4)] sm:mb-20 sm:p-10">
        <Eyebrow>How buying works here</Eyebrow>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-xl leading-snug text-ink sm:text-2xl">
          There&apos;s no cart on this site. When something looks right, you talk to a clinician —
          they prescribe it only if it&apos;s right for you.
        </p>
      </section>

      <GetStartedCta />
    </>
  );
}
