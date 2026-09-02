import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { stripePublishableKey } from '@/lib/env';

/**
 * The one Stripe.js handle (docs/shop/01-commerce.md section 7). Memoized so
 * the script loads once; `null` when the publishable key is not baked into
 * the build, which the payment step renders as an unavailable notice.
 *
 * If the Connect smoke test shows tokenization must target the connected
 * account instead of the platform, the fix is the `stripeAccount` option in
 * loadStripe below, and only here.
 */
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePublishableKey) return Promise.resolve(null);
  stripePromise ??= loadStripe(stripePublishableKey);
  return stripePromise;
}
