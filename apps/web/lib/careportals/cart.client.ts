import { CAREPORTALS_BASE_URL, careportalsHeaders, type CareportalsCart } from './types';

/**
 * Browser-side cart module: call only from client components (it reads
 * localStorage). The cart itself lives with CarePortals; we keep just its id,
 * and every mutation re-renders from the returned cart (CarePortals' own
 * guidance: the most recent response is the source of truth). A stale or
 * consumed cart id answers 400/404, is cleared, and the next add starts fresh.
 */
const CART_ID_KEY = 'joice.shop.cartId';

/** Exported for the checkout, which needs the id for the Patient API calls. */
export function getStoredCartId(): string | null {
  try {
    return window.localStorage.getItem(CART_ID_KEY);
  } catch {
    return null;
  }
}

function setStoredCartId(id: string): void {
  try {
    window.localStorage.setItem(CART_ID_KEY, id);
  } catch {
    // Private mode without storage: the cart still works within the page.
  }
}

/** Exported for the confirmation page's cleanup after a completed order. */
export function clearStoredCartId(): void {
  try {
    window.localStorage.removeItem(CART_ID_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** 400 and 404 both mean "that cart is gone" (verified: a bogus id answers 400). */
function isGone(res: Response): boolean {
  return res.status === 400 || res.status === 404;
}

async function createCart(productId: string, quantity: number): Promise<CareportalsCart> {
  const res = await fetch(`${CAREPORTALS_BASE_URL}/public/v2/carts`, {
    method: 'POST',
    headers: careportalsHeaders,
    body: JSON.stringify([{ productId, quantity }]),
  });
  if (!res.ok) throw new Error(`Cart create failed (${res.status})`);
  const cart = (await res.json()) as CareportalsCart;
  setStoredCartId(cart._id);
  return cart;
}

/**
 * Add a product: creates the cart on first add, appends after (CarePortals
 * dedupes a repeated product into its existing line). Falls back to a fresh
 * cart when the stored one is gone.
 */
export async function addToCart(productId: string, quantity = 1): Promise<CareportalsCart> {
  const cartId = getStoredCartId();
  if (!cartId) return createCart(productId, quantity);

  const res = await fetch(
    `${CAREPORTALS_BASE_URL}/public/v2/carts/${encodeURIComponent(cartId)}/items`,
    {
      method: 'POST',
      headers: careportalsHeaders,
      body: JSON.stringify([{ productId, quantity }]),
    },
  );
  if (isGone(res)) {
    clearStoredCartId();
    return createCart(productId, quantity);
  }
  if (!res.ok) throw new Error(`Add to cart failed (${res.status})`);
  return (await res.json()) as CareportalsCart;
}

/**
 * The live cart, or `null` when none is stored or the stored one is gone
 * (the stale id is cleared). Throws on transport failure so the checkout view
 * can show a retry state distinct from "empty".
 */
export async function fetchCart(): Promise<CareportalsCart | null> {
  const cartId = getStoredCartId();
  if (!cartId) return null;

  const res = await fetch(`${CAREPORTALS_BASE_URL}/v2/carts/${encodeURIComponent(cartId)}`, {
    headers: { organization: careportalsHeaders.organization },
  });
  if (isGone(res)) {
    clearStoredCartId();
    return null;
  }
  if (!res.ok) throw new Error(`Cart read failed (${res.status})`);
  return (await res.json()) as CareportalsCart;
}

/**
 * Set a NON-subscription line's quantity. The body must carry BOTH productId
 * and quantity (quantity alone answers 400) and subscription lines revert
 * server-side, so callers gate the stepper on isSubscription; both verified
 * live 2026-09-01 (docs/shop/01-commerce.md section 10).
 */
export async function updateItemQuantity(
  itemId: string,
  productId: string,
  quantity: number,
): Promise<CareportalsCart> {
  const cartId = getStoredCartId();
  if (!cartId) throw new Error('No cart');

  const res = await fetch(
    `${CAREPORTALS_BASE_URL}/public/v2/carts/${encodeURIComponent(cartId)}/items/${encodeURIComponent(itemId)}`,
    {
      method: 'PUT',
      headers: careportalsHeaders,
      body: JSON.stringify({ productId, quantity }),
    },
  );
  if (!res.ok) throw new Error(`Quantity update failed (${res.status})`);
  return (await res.json()) as CareportalsCart;
}

/** Remove one line; returns the updated cart (an emptied cart survives with no lines). */
export async function removeItem(itemId: string): Promise<CareportalsCart> {
  const cartId = getStoredCartId();
  if (!cartId) throw new Error('No cart');

  const res = await fetch(
    `${CAREPORTALS_BASE_URL}/public/v2/carts/${encodeURIComponent(cartId)}/items/${encodeURIComponent(itemId)}`,
    { method: 'DELETE', headers: { organization: careportalsHeaders.organization } },
  );
  if (!res.ok) throw new Error(`Remove failed (${res.status})`);
  return (await res.json()) as CareportalsCart;
}

/**
 * The hosted checkout URL for the stored cart. `GET /v2/carts/checkout-url`
 * answers the template "https://care.joicehealth.com/checkouts/:cartId" as
 * plain text; we substitute the id. `null` when no cart or the read fails.
 */
export async function getCheckoutUrl(): Promise<string | null> {
  const cartId = getStoredCartId();
  if (!cartId) return null;

  try {
    const res = await fetch(`${CAREPORTALS_BASE_URL}/v2/carts/checkout-url`, {
      headers: { organization: careportalsHeaders.organization },
    });
    if (!res.ok) return null;
    const template = (await res.text()).trim().replace(/^"|"$/g, '');
    if (!template.includes(':cartId')) return null;
    return template.replace(':cartId', encodeURIComponent(cartId));
  } catch {
    return null;
  }
}
