import type { Product } from '@/lib/site-content';
import { CtaLink } from '@/components/ui/cta-link';
import { ImageSlot } from '@/components/ui/image-slot';

/**
 * Catalogue row, from the deck's Shop screen: name and a square tile on the
 * left, the one-line promise and a `LEARN +` pill on the right, hairline
 * beneath. Render inside a `<ul className="border-t border-line">`.
 * Photos: public/products/<slug>.jpg.
 */
export function ProductRow({ product, hue = 128 }: { product: Product; hue?: number }) {
  return (
    <li className="border-b border-line">
      <div className="grid grid-cols-[1fr_1.4fr] gap-6 py-6 sm:gap-10 sm:py-8">
        <div className="flex flex-col gap-4">
          <h3 className="mono-label text-ink">{product.name}</h3>
          <ImageSlot
            src={`products/${product.slug}.jpg`}
            alt=""
            sizes="(min-width: 640px) 160px, 112px"
            hue={hue}
            className="h-28 w-28 rounded-sm sm:h-40 sm:w-40"
          />
        </div>
        <div className="flex flex-col items-start justify-between gap-5">
          <p className="max-w-sm text-lg leading-snug text-ink sm:text-xl">{product.tagline}</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <CtaLink href={`/products/${product.slug}`}>Learn +</CtaLink>
            <span className="font-mono text-sm text-muted">
              $—<span className="text-xs">/mo</span>
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
