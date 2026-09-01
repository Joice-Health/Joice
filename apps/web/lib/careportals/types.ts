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
 * echoes the new quantity but the stored cart reverts), so subscription lines
 * offer Remove, never a stepper. Non-subscription products DO persist a
 * quantity (verified live 2026-09-01, and the update body must carry BOTH
 * productId and quantity); see docs/shop/01-commerce.md section 10.
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

/**
 * CarePortals Patient API: the authenticated side of the custom checkout
 * (docs/shop/01-commerce.md sections 6 and 10, all shapes verified live
 * 2026-09-01). Same organization header; patient calls add a Bearer JWT that
 * only POST /auth/login returns. CORS is open with credentials, so the
 * browser calls it directly and checkout PII never transits our servers.
 */
export const CAREPORTALS_PATIENT_BASE_URL = 'https://patient-api.portals.care';

/** The payments call's shippingAddress, field names verbatim from the guide. */
export interface ShippingAddress {
  address1: string;
  address2?: string;
  city: string;
  provinceCode: string;
  postalCode: string;
  countryCode: string; // 'US'
}

/**
 * An order as the checkout endpoints return it. Statuses arrive in the
 * catalogue's snake_case (awaiting_requirements, awaiting_script, ...) or,
 * in some payloads, prose ("Awaiting Fulfillment"); treat as opaque text and
 * compare case-insensitively where it matters.
 */
export interface CareportalsOrder {
  _id: string;
  /** The human order number, when present. */
  id?: number;
  status: string;
  lineItems?: { name: string; price: number; quantity: number }[];
  totalAmount?: number;
}

/**
 * GET /v2/checkout/{cartId}/start. The embedded cart is the public cart shape
 * plus totals context; paymentMethods lists the patient's saved cards (empty
 * for a fresh account). couponError and error surface inline, never as HTTP
 * failures.
 */
export interface CheckoutStart {
  cart: CareportalsCart;
  paymentMethods: { id: string; type: string; last4?: string; exp?: string }[];
  totalAmountAfterCredit?: number;
  currency?: string;
  error?: string | null;
  couponError?: string | null;
}

/** POST /v2/checkout/{cartId}/payments, discriminated on the HTTP status. */
export type PaymentSubmitResult =
  | { kind: 'succeeded'; orders: CareportalsOrder[] }
  | { kind: 'requires_action'; clientSecret: string };

/** GET /v2/checkout/{cartId}/payments: the read-only poll. */
export interface PaymentPollResult {
  paymentStatus: 'pending' | 'succeeded' | 'failed';
  orders: CareportalsOrder[];
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
