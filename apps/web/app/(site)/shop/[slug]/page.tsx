import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CARE_AREA_SLUGS, careAreaLabel, type CareAreaSlug } from '@joice/utils';
import { requireCommerceEnabled } from '@/lib/commerce-gate';
import {
  getMerchandisedByArea,
  getMerchandisedProduct,
  merchandisedName,
  type MerchandisedProduct,
} from '@/lib/shop-catalog.server';
import { catalogEntryBySlug } from '@/lib/shop-catalog';
import { getCareArea } from '@/lib/site-content';
import { formatPrice, type CareportalsProduct } from '@/lib/careportals/types';
import { PageIntro } from '@/components/ui/page-intro';
import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';
import { ImageSlot } from '@/components/ui/image-slot';
import { ArticleRow } from '@/components/ui/article-row';
import { ARTICLES } from '@/lib/site-content';
import { CommerceProductRow } from '@/components/commerce/commerce-product-row';
import { CommerceUnavailable } from '@/components/commerce/commerce-unavailable';
import { AddToCartButton } from '@/components/commerce/add-to-cart-button';

/**
 * Render per request, never prerender: at image build time no API exists, so a
 * prerender would bake requireCommerceEnabled's flag-off redirect into the
 * static artifact and the live flag could never open the page (the 8db5395
 * incident). The CarePortals data cache keeps its own revalidate window.
 */
export const dynamic = 'force-dynamic';

/**
 * The one dynamic segment under /shop (docs/shop/01-commerce.md section 2): a
 * care-area slug renders the category shelf, a catalogue slug renders the
 * product page, anything else 404s. The catalogue map's tests forbid slugs
 * that collide with an area or with the cart/checkout routes, so the branch
 * is unambiguous.
 */
function asCareArea(slug: string): CareAreaSlug | null {
  return (CARE_AREA_SLUGS as readonly string[]).includes(slug) ? (slug as CareAreaSlug) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const area = asCareArea(slug);
  if (area) {
    const content = getCareArea(area);
    return { title: `${careAreaLabel(area)} · Joice`, description: content?.blurb };
  }
  const entry = catalogEntryBySlug(slug);
  return entry
    ? { title: `${entry.name ?? entry.slug} · Joice`, description: entry.tagline }
    : { title: 'Shop · Joice' };
}

export default async function ShopSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireCommerceEnabled();
  const { slug } = await params;

  const area = asCareArea(slug);
  if (area) return <CategoryPage area={area} />;

  const product = await getMerchandisedProduct(slug);
  if (product === null) notFound();
  if (product === undefined) return <CommerceUnavailable backLink />;
  return <ProductPage product={product} />;
}

async function CategoryPage({ area }: { area: CareAreaSlug }) {
  const content = getCareArea(area);
  const products = await getMerchandisedByArea(area);

  return (
    <>
      <PageIntro eyebrow="Category" title={careAreaLabel(area)}>
        {content?.blurb}
      </PageIntro>

      <section className="border-t border-line py-14 animate-fade-up sm:py-16">
        <div className="flex items-baseline justify-between">
          <Eyebrow as="h2">Protocols in this area</Eyebrow>
          <Link href="/shop" className="mono-label text-muted transition-colors hover:text-ink">
            ← All categories
          </Link>
        </div>
        {products === undefined ? (
          <CommerceUnavailable />
        ) : products.length === 0 ? (
          <p className="mt-8 max-w-md text-lg leading-relaxed text-muted">
            Protocols in this area are coming.
          </p>
        ) : (
          <ul className="mt-8 border-t border-line">
            {products.map((product) => (
              <CommerceProductRow key={product.entry.slug} product={product} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function ProductPage({ product }: { product: MerchandisedProduct }) {
  const { entry, live } = product;
  const primaryArea = entry.areas[0];
  const shipping = shipsEvery(live);

  return (
    <>
      <section className="grid items-center gap-10 py-16 animate-fade-up sm:py-20 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Link
            href={`/shop/${primaryArea}`}
            className="mono-label text-muted transition-colors hover:text-ink"
          >
            ← {careAreaLabel(primaryArea)}
          </Link>
          <h1 className="display mt-5 text-balance text-5xl text-ink sm:text-7xl">
            {merchandisedName(product)}
          </h1>
          <p className="mt-5 max-w-md text-pretty text-lg leading-relaxed text-muted">
            {entry.tagline}
          </p>
          <p className="mt-8 font-mono text-2xl text-ink">
            {formatPrice(live.price, live.currency)}
            {live.isSubscription ? <span className="text-base text-muted">/mo</span> : null}
          </p>
          {live.subLabel ? <p className="mt-2 text-sm text-muted">{live.subLabel}</p> : null}
          {shipping ? <p className="mono-label mt-2 text-muted">{shipping}</p> : null}
          <div className="mt-10">
            <AddToCartButton productId={live._id} />
          </div>
        </div>
        <ImageSlot
          src={`products/${entry.slug}.jpg`}
          alt=""
          sizes="(min-width: 1024px) 40vw, 100vw"
          hue={entry.hue ?? 128}
          className="aspect-4/3 rounded-card"
        />
      </section>

      <section className="border-t border-line py-14 sm:py-16">
        <Eyebrow as="h2">What it is</Eyebrow>
        <p className="mt-5 max-w-2xl text-pretty text-xl leading-relaxed text-ink">
          {entry.copy.whatItIs}
        </p>
      </section>

      {entry.copy.science ? (
        <section className="border-t border-line py-14 sm:py-16">
          <div className="flex items-baseline justify-between">
            <Eyebrow as="h2">The science</Eyebrow>
            <Link
              href="/learn/peptides-101"
              className="mono-label text-muted transition-colors hover:text-ink"
            >
              Deep dive in Learn +
            </Link>
          </div>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
            {entry.copy.science}
          </p>
        </section>
      ) : null}

      {entry.copy.dosing ? (
        <section className="border-t border-line py-14 sm:py-16">
          <Eyebrow as="h2">Dosing and oversight</Eyebrow>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
            {entry.copy.dosing}
          </p>
        </section>
      ) : null}

      <div className="grid gap-x-16 gap-y-10 border-t border-line py-14 sm:py-16 lg:grid-cols-2">
        <section>
          <Eyebrow as="h2">Testing & sourcing</Eyebrow>
          <p className="mt-4 text-base leading-relaxed text-muted">
            Sourced under written standards, third-party tested, chain of custody documented.
          </p>
          <CtaLink href="/learn/sourcing-and-testing" className="mt-6">
            How our testing works +
          </CtaLink>
        </section>

        <section>
          <Eyebrow as="h2">Clinical attribution</Eyebrow>
          <div className="mt-4 flex items-center gap-4">
            <span className="h-10 w-10 shrink-0 rounded-full border border-line bg-stone/40" />
            <p className="text-base leading-relaxed text-ink">
              Protocol set and reviewed by the Joice clinical team. A licensed physician
              reviews every order before it ships.
            </p>
          </div>
          <CtaLink href="/clinical-team" className="mt-6">
            Meet the team +
          </CtaLink>
        </section>
      </div>

      <section className="border-t border-line py-14 sm:py-16">
        <Eyebrow as="h2">Related education</Eyebrow>
        <ul className="mt-8 border-t border-line">
          {ARTICLES.slice(0, 2).map((article) => (
            <ArticleRow key={article.slug} article={article} />
          ))}
        </ul>
      </section>

      <section className="border-t border-line py-20 text-center sm:py-24">
        <p className="display mx-auto max-w-3xl text-balance text-4xl text-ink sm:text-6xl">
          The new standard of you.
        </p>
        <div className="mt-8 flex justify-center">
          <AddToCartButton productId={live._id} />
        </div>
      </section>
    </>
  );
}

/** "Ships every 12 weeks", from the first subscription phase, when it exists. */
function shipsEvery(product: CareportalsProduct): string | null {
  if (!product.isSubscription) return null;
  const phase = product.subscriptionPhases[0];
  if (!phase?.fillingCycleInterval || !phase.fillingCycleUnit) return null;
  const unit =
    phase.fillingCycleInterval === 1 ? phase.fillingCycleUnit : `${phase.fillingCycleUnit}s`;
  return `Ships every ${phase.fillingCycleInterval} ${unit}`;
}
