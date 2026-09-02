import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireShopEnabled } from '@/lib/shop-gate';
import { getProduct } from '@/lib/careportals/products.server';
import { formatPrice, type CareportalsProduct } from '@/lib/careportals/types';
import { ImageSlot } from '@/components/ui/image-slot';
import { AddToCartButton } from '@/components/shop/add-to-cart-button';
import { ShopUnavailable } from '@/components/shop/shop-unavailable';
import { CERT_SHOP } from '@/lib/cert-routes';

/**
 * Render per request, never prerender: at image build time no API exists, so a
 * prerender would bake requireShopEnabled's flag-off redirect into the static
 * artifact and the live flag could never open the page (the /coming-soon
 * precedent). The CarePortals data cache keeps its own revalidate window.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const product = await getProduct((await params).id);
  return product
    ? { title: `${product.label} · Joice`, description: product.subLabel }
    : { title: 'Joice' };
}

/**
 * The product page, live from CarePortals. Tri-state fetch: a gone or
 * disabled product 404s into the shop's not-found boundary; an unreachable
 * upstream renders the quiet unavailable section.
 */
export default async function ShopProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireShopEnabled();
  const product = await getProduct((await params).id);
  if (product === undefined) return <ShopUnavailable backLink />;
  if (product === null) notFound();

  return (
    <>
      <section className="grid gap-10 py-10 animate-fade-up sm:py-14 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <div className="flex flex-col items-start">
          <Link href={CERT_SHOP} className="mono-label text-muted transition-colors hover:text-ink">
            ← Shop
          </Link>
          <h1 className="display mt-8 text-balance text-5xl text-ink sm:text-6xl">
            {product.label}
          </h1>
          {product.subLabel ? (
            <p className="mt-4 text-lg leading-relaxed text-muted">{product.subLabel}</p>
          ) : null}
          <p className="mt-8 font-mono text-2xl text-ink">
            {formatPrice(product.price, product.currency)}
            {product.isSubscription ? <span className="text-base text-muted">/mo</span> : null}
          </p>
          {shipsEvery(product) ? (
            <p className="mono-label mt-2 text-muted">{shipsEvery(product)}</p>
          ) : null}
          <div className="mt-10">
            <AddToCartButton productId={product._id} />
          </div>
        </div>
        <ImageSlot
          src={`products/${product._id}.jpg`}
          alt=""
          sizes="(min-width: 1024px) 480px, 100vw"
          className="aspect-[4/3] rounded-card"
        />
      </section>

      <section className="border-t border-line py-14 sm:py-16">
        <h2 className="mono-label text-ink">About this protocol</h2>
        <div className="mt-6 max-w-2xl space-y-4 text-lg leading-relaxed text-muted">
          {product.description ? (
            product.description
              .split(/\n+/)
              .filter(Boolean)
              .map((paragraph) => <p key={paragraph}>{paragraph}</p>)
          ) : (
            <p>
              A clinician-set protocol. Your prescriber reviews suitability during checkout on
              our secure care portal.
            </p>
          )}
        </div>
      </section>
    </>
  );
}

/** "Ships every 4 weeks", from the first subscription phase, when it exists. */
function shipsEvery(product: CareportalsProduct): string | null {
  if (!product.isSubscription) return null;
  const phase = product.subscriptionPhases[0];
  if (!phase?.fillingCycleInterval || !phase.fillingCycleUnit) return null;
  const unit =
    phase.fillingCycleInterval === 1 ? phase.fillingCycleUnit : `${phase.fillingCycleUnit}s`;
  return `Ships every ${phase.fillingCycleInterval} ${unit}`;
}
