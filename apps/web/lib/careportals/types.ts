/**
 * CarePortals Public API: https://public-api.portals.care. No API key exists;
 * the `organization` header selects the tenant and CORS is open by design (it
 * is a storefront API), so both server components and the browser call it
 * directly. Interfaces are hand-written against live responses (2026-08-28),
 * the house pattern for third-party APIs (packages/marketing/src/klaviyo.ts);
 * the internal no-hand-written-DTOs rule is about the Hono RPC chain only.
 * Full endpoint map and rationale: docs/shop/00-plan.md.
 */
export const CAREPORTALS_BASE_URL = 'https://public-api.portals.care';
export const CAREPORTALS_ORG = 'joicehealth_com';

export const careportalsHeaders = {
  organization: CAREPORTALS_ORG,
  'content-type': 'application/json',
} as const;

export interface CareportalsSubscriptionPhase {
  fillingCycleInterval: number;
  fillingCycleUnit: string; // 'week'
  price: number;
}

export interface CareportalsProduct {
  _id: string;
  label: string;
  subLabel?: string;
  description?: string;
  /** Dollars, not cents. */
  listPrice: number;
  price: number;
  currency: string; // 'USD'
  status: 'active' | 'disabled';
  type: string; // 'physical'
  images: string[]; // empty for this org; ImageSlot draws the designed field
  isSubscription: boolean;
  subscriptionPhases: CareportalsSubscriptionPhase[];
}

/**
 * A cart line. `id` is a short opaque string (not a Mongo id). Quantity is
 * pinned to 1 server-side for subscription products (verified live: a PUT
 * echoes the new quantity but the stored cart reverts), which is every product
 * we sell, so the UI offers Remove, never a quantity stepper.
 */
export interface CareportalsLineItem {
  id: string;
  productId: string;
  name: string;
  subLabel?: string;
  listPrice: number;
  price: number;
  quantity: number;
  isSubscription: boolean;
}

export interface CareportalsCart {
  _id: string;
  lineItems: CareportalsLineItem[];
  baseAmount: number;
  subTotalAmount: number;
  discountAmount: number;
  totalAmount: number;
}

/** '$88' (whole dollars stay whole, '$88.50' keeps its cents). Prices arrive in dollars. */
export function formatPrice(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
