import type { Metadata } from 'next';
import { requireShopEnabled } from '@/lib/shop-gate';
import { CheckoutView } from '@/components/shop/checkout-view';

export const metadata: Metadata = { title: 'Checkout · Joice' };

/**
 * Render per request, never prerender: at image build time no API exists, so a
 * prerender would bake requireShopEnabled's flag-off redirect into the static
 * artifact and the live flag could never open the page (the /coming-soon
 * precedent). The CarePortals data cache keeps its own revalidate window.
 */
export const dynamic = 'force-dynamic';

/**
 * Thin server wrapper: the flag gate and metadata live here, the cart lives
 * in the client view (it needs localStorage for the cart id).
 */
export default async function CheckoutPage() {
  await requireShopEnabled();
  return <CheckoutView />;
}
