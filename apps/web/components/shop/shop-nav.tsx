import Link from 'next/link';
import { Bracket } from '@joice/ui';
import { BrandMark } from '@/components/ui/brand-mark';
import { CERT_SHOP } from '@/lib/cert-routes';

/** The hosted CarePortals customer portal; it routes visitors to its own login. */
const PORTAL_URL = 'https://care.joicehealth.com';

/**
 * The storefront nav: site-nav's frosted sticky header with the link list
 * trimmed to two things, Sign in (the hosted customer portal, left) and the
 * bracketed Get started action (right), the wordmark dead centre between them.
 */
export function ShopNav() {
  return (
    <header className="sticky top-0 z-20 bg-canvas/70 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-4 py-5 sm:px-6">
        <nav aria-label="Primary">
          <a
            href={PORTAL_URL}
            className="mono-label text-muted transition-colors hover:text-ink"
          >
            Sign in
          </a>
        </nav>

        <Link href="/" aria-label="Joice home" className="justify-self-center">
          <BrandMark />
        </Link>

        <Link
          href={CERT_SHOP}
          className="mono-label justify-self-end text-ink transition-colors hover:text-brand-700"
        >
          <Bracket>Get started</Bracket>
        </Link>
      </div>
    </header>
  );
}
