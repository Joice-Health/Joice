import type { Metadata } from 'next';
import { requireShopEnabled } from '@/lib/shop-gate';
import { CheckoutView } from '@/components/shop/checkout-view';

export const metadata: Metadata = { title: 'Checkout · Joice' };

/**
 * Thin server wrapper: the flag gate and metadata live here, the cart lives
 * in the client view (it needs localStorage for the cart id).
 */
export default async function CheckoutPage() {
  await requireShopEnabled();
  return <CheckoutView />;
}
