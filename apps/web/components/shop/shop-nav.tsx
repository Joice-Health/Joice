import Link from 'next/link';
import { Bracket } from '@joice/ui';
import { BrandMark } from '@/components/ui/brand-mark';

/**
 * The storefront nav: site-nav's frosted sticky header with the link list
 * removed. One action only, by design (the certification brief pins the nav
 * to Get started); the empty left column keeps the wordmark dead centre.
 */
export function ShopNav() {
  return (
    <header className="sticky top-0 z-20 bg-canvas/70 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-4 py-5 sm:px-6">
        <span aria-hidden />

        <Link href="/home" aria-label="Joice home" className="justify-self-center">
          <BrandMark />
        </Link>

        <Link
          href="/shop"
          className="mono-label justify-self-end text-ink transition-colors hover:text-brand-700"
        >
          <Bracket>Get started</Bracket>
        </Link>
      </div>
    </header>
  );
}
