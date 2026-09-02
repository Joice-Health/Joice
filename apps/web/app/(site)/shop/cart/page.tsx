import type { Metadata } from 'next';
import { requireCommerceEnabled } from '@/lib/commerce-gate';
import { CartView } from '@/components/commerce/cart-view';

export const metadata: Metadata = { title: 'Cart · Joice' };

/**
 * Render per request, never prerender: at image build time no API exists, so a
 * prerender would bake requireCommerceEnabled's flag-off redirect into the
 * static artifact and the live flag could never open the page (the 8db5395
 * incident).
 */
export const dynamic = 'force-dynamic';

/**
 * Thin server wrapper: the flag gate and metadata live here, the cart lives
 * in the client view (it needs localStorage for the cart id).
 */
export default async function CartPage() {
  await requireCommerceEnabled();
  return <CartView />;
}
