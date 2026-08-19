import Link from 'next/link';
import { Bracket, Index } from '@joice/ui';
import { Eyebrow } from '@/components/ui/eyebrow';
import { ImageSlot } from '@/components/ui/image-slot';
import { CARE_AREAS } from '@/lib/site-content';

/** Hue per area for the placeholder tiles, so the list is not one repeated square. */
const TILE_HUES = [128, 100, 60, 90, 160];

/**
 * "What do [ you ] value?", the deck's list: an index, the area set large in
 * the condensed face, and a square tile (drop photos at public/areas/<slug>.jpg).
 */
export function CareAreas() {
  return (
    <section className="border-t border-line py-16 sm:py-24">
      <div className="flex items-baseline justify-between">
        <Eyebrow as="h2">
          What do{' '}
          <span className="normal-case">
            <Bracket>you</Bracket>
          </span>{' '}
          value?
        </Eyebrow>
        <Link href="/explore" className="mono-label text-muted transition-colors hover:text-ink">
          All areas +
        </Link>
      </div>
      <ol className="mt-10 border-t border-line">
        {CARE_AREAS.map((area, i) => (
          <li key={area.slug} className="border-b border-line">
            <Link
              href={`/explore/${area.slug}`}
              className="group grid grid-cols-[auto_1fr_auto] items-center gap-5 py-4 sm:gap-8 sm:py-5"
            >
              <span className="mono-label text-muted">
                <Index n={i + 1} />
              </span>
              <span className="display justify-self-end text-right text-2xl text-ink transition-colors group-hover:text-brand-700 sm:text-5xl">
                {area.name}
              </span>
              <ImageSlot
                src={`areas/${area.slug}.jpg`}
                alt=""
                sizes="112px"
                hue={TILE_HUES[i % TILE_HUES.length]}
                className="h-16 w-16 rounded-sm sm:h-24 sm:w-24 sm:rounded"
              />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
