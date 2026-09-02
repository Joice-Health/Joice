import type { Metadata } from 'next';
import { requireCommerceEnabled } from '@/lib/commerce-gate';
import { CheckoutFlow } from '@/components/checkout/checkout-flow';

export const metadata: Metadata = { title: 'Checkout · Joice' };

/**
 * Render per request, never prerender: at image build time no API exists, so a
 * prerender would bake requireCommerceEnabled's flag-off redirect into the
 * static artifact and the live flag could never open the page (the 8db5395
 * incident).
 */
export const dynamic = 'force-dynamic';

/**
 * Thin server wrapper: the flag gate and metadata live here; the flow is a
 * client runner (localStorage cart id, sessionStorage patient JWT, Stripe).
 */
export default async function CheckoutPage() {
  await requireCommerceEnabled();
  return <CheckoutFlow />;
}
