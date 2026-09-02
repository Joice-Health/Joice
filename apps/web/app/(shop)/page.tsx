import type { Metadata } from 'next';
import Link from 'next/link';
import { requireShopEnabled } from '@/lib/shop-gate';
import { HomeHero } from '@/components/shop/home-hero';
import { HowItWorks } from '@/components/home/how-it-works';
import { ShopCta } from '@/components/shop/shop-cta';

export const metadata: Metadata = {
  title: 'Joice · Clinician-guided peptide care',
  description: 'Clinician-guided peptide care, priced near cost, on purpose.',
  openGraph: {
    title: 'Joice · Clinician-guided peptide care',
    description: 'Clinician-guided peptide care, priced near cost, on purpose.',
    type: 'website',
  },
};

/**
 * Render per request, never prerender: at image build time no API exists, so a
 * prerender would bake requireShopEnabled's flag-off redirect into the static
 * artifact and the live flag could never open the page (the /coming-soon
 * precedent). The CarePortals data cache keeps its own revalidate window.
 */
export const dynamic = 'force-dynamic';

/**
 * The site root: the storefront landing, live at joicehealth.com. The `shop`
 * flag outranks every other flag here: flag on, this page renders; flag off,
 * requireShopEnabled sends the public to /waitlist (which itself falls back to
 * /coming-soon when the waitlist flag is off). The old /home URL 308s here via
 * next.config.ts. The team's preview of the future main-site landing lives at
 * /preview. Hero, the three steps (HowItWorks is link-free, so it is shared,
 * not copied) and the closing statement; every action leads to /shop.
 */
export default async function ShopHomePage() {
  await requireShopEnabled();
  return (
    <>
      <HomeHero />
      <HowItWorks />
      <ShopCta />
      {/* The LegitScript jurisdiction pointer (sc-275): the disclosure stays
          one click from where the analyst starts. Sits immediately above the
          footer, which carries the States We Serve link itself. */}
      <p className="border-t border-line py-8 text-center text-sm text-muted">
        Available only in the United States. See{' '}
        <Link
          href="/states"
          className="text-ink underline decoration-dotted underline-offset-4 hover:text-brand-700"
        >
          States We Serve
        </Link>{' '}
        for the full list of jurisdictions.
      </p>
    </>
  );
}
