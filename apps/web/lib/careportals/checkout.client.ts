import { PatientAuthError } from './patient.client';
import {
  CAREPORTALS_PATIENT_BASE_URL,
  CAREPORTALS_ORG,
  type CheckoutStart,
  type PaymentPollResult,
  type PaymentSubmitResult,
  type ShippingAddress,
} from './types';

/**
 * Browser-side checkout module over the Patient API's checkout endpoints
 * (docs/shop/01-commerce.md section 6; bases and auth verified live
 * 2026-09-01: Bearer required, 401 without). Every call takes the patient JWT
 * explicitly so the session store stays the caller's concern, and an optional
 * fetchImpl so tests never touch the network. Responses are the source of
 * truth; nothing here caches.
 */

/** The card was refused in a way the buyer can fix (another card, the bank). */
export class PaymentDeclinedError extends Error {
  constructor(message = 'Payment declined') {
    super(message);
    this.name = 'PaymentDeclinedError';
  }
}

export interface PaymentSubmitBody {
  returnUrl: string;
  shippingAddress: ShippingAddress;
  paymentMethodId: string;
  isNewShippingAddress?: boolean;
  couponCode?: string;
}

type FetchImpl = typeof fetch;

function headers(token: string): Record<string, string> {
  return {
    organization: CAREPORTALS_ORG,
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  };
}

function checkoutUrl(cartId: string, tail = ''): string {
  return `${CAREPORTALS_PATIENT_BASE_URL}/v2/checkout/${encodeURIComponent(cartId)}${tail}`;
}

/**
 * The checkout context: live cart, saved payment methods, totals. Also binds
 * the cart to the authenticated patient server-side (verified live: the cart
 * comes back carrying `customer`).
 */
export async function startCheckout(
  cartId: string,
  token: string,
  fetchImpl: FetchImpl = fetch,
): Promise<CheckoutStart> {
  const res = await fetchImpl(checkoutUrl(cartId, '/start'), {
    headers: headers(token),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) throw new PatientAuthError();
  if (!res.ok) throw new Error(`Checkout start failed (${res.status})`);
  return (await res.json()) as CheckoutStart;
}

/**
 * Apply a coupon. A rejected code is an inline outcome (couponError on the
 * response), never a thrown error, so it can sit quietly beside the totals.
 */
export async function applyCoupon(
  cartId: string,
  code: string,
  token: string,
  fetchImpl: FetchImpl = fetch,
): Promise<CheckoutStart> {
  const res = await fetchImpl(checkoutUrl(cartId, `/coupon/${encodeURIComponent(code)}`), {
    method: 'POST',
    headers: headers(token),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) throw new PatientAuthError();
  if (!res.ok) throw new Error(`Coupon failed (${res.status})`);
  return (await res.json()) as CheckoutStart;
}

/**
 * Submit the payment. 201 is orders; 402 is a 3DS challenge (the intent
 * carries the client_secret Stripe's handleNextAction wants, and the cart
 * remembers its paymentIntentId server-side, which is why the machine
 * re-submits after the challenge instead of polling first). Other 4xx map to
 * PaymentDeclinedError; 401 to PatientAuthError; anything else throws plain,
 * which the machine treats as an AMBIGUOUS outcome and resolves poll-first.
 */
export async function submitPayment(
  cartId: string,
  body: PaymentSubmitBody,
  token: string,
  fetchImpl: FetchImpl = fetch,
): Promise<PaymentSubmitResult> {
  const res = await fetchImpl(checkoutUrl(cartId, '/payments'), {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 401) throw new PatientAuthError();
  if (res.status === 402) {
    const payload = (await res.json()) as {
      intent?: { status?: string; client_secret?: string };
    };
    const clientSecret = payload.intent?.client_secret;
    if (!clientSecret) {
      // requires_action without a secret: nothing we can hand to Stripe.
      throw new PaymentDeclinedError('The bank asked for verification we could not run.');
    }
    return { kind: 'requires_action', clientSecret };
  }
  if (res.status >= 400 && res.status < 500) {
    const message = await declineMessage(res);
    throw new PaymentDeclinedError(message);
  }
  if (!res.ok) throw new Error(`Payment failed (${res.status})`);
  const payload = (await res.json()) as { orders?: PaymentPollResult['orders'] };
  return { kind: 'succeeded', orders: payload.orders ?? [] };
}

async function declineMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    if (typeof body.message === 'string' && body.message.trim()) return body.message;
  } catch {
    // Fall through to the generic line.
  }
  return 'Your card was declined.';
}

/**
 * The read-only poll: succeeded (with orders), failed, or still pending.
 * 400/404 mean the cart holds no payment intent (this API family answers 400
 * for gone/bogus ids, the cart.client precedent), which is PROOF no payment
 * stands, so they map to `failed` and unlock a safe retry. Transport failures
 * throw; the machine's poll loop absorbs them into its budget instead of
 * failing the purchase outright.
 */
export async function getPaymentStatus(
  cartId: string,
  token: string,
  fetchImpl: FetchImpl = fetch,
): Promise<PaymentPollResult> {
  const res = await fetchImpl(checkoutUrl(cartId, '/payments'), {
    headers: headers(token),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) throw new PatientAuthError();
  if (res.status === 400 || res.status === 404) {
    return { paymentStatus: 'failed', orders: [] };
  }
  if (!res.ok) throw new Error(`Payment status failed (${res.status})`);
  const payload = (await res.json()) as Partial<PaymentPollResult>;
  return {
    paymentStatus: payload.paymentStatus ?? 'pending',
    orders: payload.orders ?? [],
  };
}
