import type { CatalogEntry } from '@/lib/shop-catalog';
import { CtaLink } from '@/components/ui/cta-link';
import { ImageSlot } from '@/components/ui/image-slot';

/**
 * Editorial catalogue row for the explore and learn pages: name and a square
 * tile on the left, the one-line promise and a `View +` pill linking into the
 * shop on the right, hairline beneath. Fed by the shop catalogue map
 * (lib/shop-catalog.ts, pure and browser-safe) so these statically rendered
 * pages never fetch; live prices belong to the /shop surfaces. Render inside
 * a `<ul className="border-t border-line">`. Photos:
 * public/products/<slug>.jpg.
 */
export function ProductRow({ entry }: { entry: CatalogEntry }) {
  return (
    <li className="border-b border-line">
      <div className="grid grid-cols-[1fr_1.4fr] gap-6 py-6 sm:gap-10 sm:py-8">
        <div className="flex flex-col gap-4">
          <h3 className="mono-label text-ink">{entry.name}</h3>
          <ImageSlot
            src={`products/${entry.slug}.jpg`}
            alt=""
            sizes="(min-width: 640px) 160px, 112px"
            hue={entry.hue ?? 128}
            className="h-28 w-28 rounded-sm sm:h-40 sm:w-40"
          />
        </div>
        <div className="flex flex-col items-start justify-between gap-5">
          <p className="max-w-sm text-lg leading-snug text-ink sm:text-xl">{entry.tagline}</p>
          <CtaLink href={`/shop/${entry.slug}`}>View +</CtaLink>
        </div>
      </div>
    </li>
  );
}

