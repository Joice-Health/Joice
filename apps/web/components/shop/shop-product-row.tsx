import { CtaLink } from '@/components/ui/cta-link';
import { ImageSlot } from '@/components/ui/image-slot';
import { formatPrice, type CareportalsProduct } from '@/lib/careportals/types';

/**
 * The shelf row: ProductRow's shape fed by CarePortals instead of
 * site-content, with a real price where the gated catalogue shows `$—` and
 * the link going to the public product page. Render inside a
 * `<ul className="border-t border-line">`. Server component (ImageSlot).
 */
export function ShopProductRow({
  product,
  hue = 128,
}: {
  product: CareportalsProduct;
  hue?: number;
}) {
  return (
    <li className="border-b border-line">
      <div className="grid grid-cols-[1fr_1.4fr] gap-6 py-6 sm:gap-10 sm:py-8">
        <div className="flex flex-col gap-4">
          <h3 className="mono-label text-ink">{product.label}</h3>
          <ImageSlot
            src={`products/${product._id}.jpg`}
            alt=""
            sizes="(min-width: 640px) 160px, 112px"
            hue={hue}
            className="h-28 w-28 rounded-sm sm:h-40 sm:w-40"
          />
        </div>
        <div className="flex flex-col items-start justify-between gap-5">
          <p className="max-w-sm text-lg leading-snug text-ink sm:text-xl">
            {product.subLabel ?? product.description ?? 'Clinician-guided protocol.'}
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <CtaLink href={`/shop/${product._id}`}>View +</CtaLink>
            <span className="font-mono text-sm text-muted">
              {formatPrice(product.price, product.currency)}
              {product.isSubscription ? <span className="text-xs">/mo</span> : null}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
