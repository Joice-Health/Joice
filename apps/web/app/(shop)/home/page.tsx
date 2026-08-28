import type { Metadata } from 'next';
import { requireShopEnabled } from '@/lib/shop-gate';
import { HomeHero } from '@/components/shop/home-hero';
import { HowItWorks } from '@/components/home/how-it-works';
import { ShopCta } from '@/components/shop/shop-cta';

export const metadata: Metadata = {
  title: 'Home · Joice',
  description: 'Clinician-guided peptide care, priced near cost, on purpose.',
};

/**
 * The storefront landing: the main-site landing stripped to hero, the three
 * steps (HowItWorks is link-free, so it is shared, not copied) and the closing
 * statement. Every action leads to /shop.
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
