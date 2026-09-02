import { CtaLink } from '@/components/ui/cta-link';
import { ImageSlot } from '@/components/ui/image-slot';
import { formatPrice } from '@/lib/careportals/types';
import { merchandisedName, type MerchandisedProduct } from '@/lib/shop-catalog.server';

/**
 * The production shelf row: the catalogue row's shape carrying live CarePortals
 * price and availability, the local tagline, and a link into /shop/[slug].
 * Render inside a `<ul className="border-t border-line">`. Server component
 * (ImageSlot); photos are slug-keyed (public/products/<slug>.jpg) so they
 * survive a variant-id swap at the curation checkpoint.
 */
export function CommerceProductRow({ product }: { product: MerchandisedProduct }) {
  const { entry, live } = product;
  return (
    <li className="border-b border-line">
      <div className="grid grid-cols-[1fr_1.4fr] gap-6 py-6 sm:gap-10 sm:py-8">
        <div className="flex flex-col gap-4">
          <h3 className="mono-label text-ink">{merchandisedName(product)}</h3>
          <ImageSlot
            src={`products/${entry.slug}.jpg`}
            alt=""
            sizes="(min-width: 640px) 160px, 112px"
            hue={entry.hue ?? 128}
            className="h-28 w-28 rounded-sm sm:h-40 sm:w-40"
          />
        </div>
        <div className="flex flex-col items-start justify-between gap-5">
          <div className="flex flex-col gap-2">
            <p className="max-w-sm text-lg leading-snug text-ink sm:text-xl">{entry.tagline}</p>
            {live.subLabel ? <p className="text-sm text-muted">{live.subLabel}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <CtaLink href={`/shop/${entry.slug}`}>View +</CtaLink>
            <span className="font-mono text-sm text-muted">
              {formatPrice(live.price, live.currency)}
              {live.isSubscription ? <span className="text-xs">/mo</span> : null}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
