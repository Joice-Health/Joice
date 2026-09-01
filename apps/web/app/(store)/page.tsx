import type { Metadata } from 'next';
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
 * not copied) and the closing statement; every action leads to /store, where
 * the certification shelf moved when the real shop took the /shop routes
 * (docs/shop/01-commerce.md section 2).
 */
export default async function ShopHomePage() {
  await requireShopEnabled();
  return (
    <>
      <HomeHero />
      <HowItWorks />
      <ShopCta />
    </>
  );
}
