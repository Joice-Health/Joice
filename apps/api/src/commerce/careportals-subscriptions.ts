import type { SubscriptionPort } from '@joice/core';

/**
 * SubscriptionPort over the CarePortals CRM/EMR APIs (docs:
 * https://dev.portals.care). Answers "does this email hold an active
 * subscription" in three steps, every one fail-closed to false:
 *
 * 1. Authenticate as a dedicated CRM service user
 *    (POST {crmBase}/auth, `organization` header) for a bearer JWT, cached
 *    and re-fetched once on a 401. CarePortals has no static admin API key;
 *    a service account is the org-level credential.
 * 2. Look the customer up by email (GET {emrBase}/customers/lookups?keyword=)
 *    and require an exact case-insensitive email match; keyword search also
 *    matches names, and a near-miss must never make someone a subscriber.
 * 3. List subscriptions and count one whose customer matches and whose
 *    status reads active/trialing.
 *
 * The response shapes are only loosely documented, so parsing is defensive:
 * anything unexpected is a warn + false, never a throw into the request
 * path. Answers are cached per email (default 5 minutes): tier checks run
 * per chat request and must not hammer a third party.
 */

export interface CareportalsSubscriptionsConfig {
  organization: string;
  username: string;
  password: string;
  crmBase?: string;
  emrBase?: string;
  cacheTtlMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'trial']);

export function createCareportalsSubscriptions(
  config: CareportalsSubscriptionsConfig,
): SubscriptionPort {
  const {
    organization,
    username,
    password,
    crmBase = 'https://crm-api.portals.care',
    emrBase = 'https://emr-api.portals.care',
    cacheTtlMs = 5 * 60_000,
    timeoutMs = 1500,
    fetchImpl = fetch,
    now = Date.now,
  } = config;

  let jwt: string | null = null;
  const cache = new Map<string, { value: boolean; expiresAt: number }>();

  async function login(): Promise<string | null> {
    try {
      const res = await fetchImpl(`${crmBase}/auth`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', organization },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        console.warn(`careportals auth failed (${res.status})`);
        return null;
      }
      const body = (await res.json()) as { token?: unknown };
      return typeof body.token === 'string' && body.token ? body.token : null;
    } catch (error) {
      console.warn(`careportals auth failed (${(error as Error).message?.slice(0, 120)})`);
      return null;
    }
  }

  /** GET with the bearer + organization headers, one re-login on a 401. */
  async function get(path: string, retried = false): Promise<unknown | null> {
    jwt ??= await login();
    if (!jwt) return null;
    try {
      const res = await fetchImpl(`${emrBase}${path}`, {
        headers: { authorization: `Bearer ${jwt}`, organization },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 401 && !retried) {
        jwt = null;
        return get(path, true);
      }
      if (!res.ok) {
        console.warn(`careportals ${path} failed (${res.status})`);
        return null;
      }
      return await res.json();
    } catch (error) {
      console.warn(`careportals ${path} failed (${(error as Error).message?.slice(0, 120)})`);
      return null;
    }
  }

  function asArray(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) return value as Record<string, unknown>[];
    // Some CarePortals lists arrive wrapped; accept the common shapes.
    const wrapped = (value as { data?: unknown; items?: unknown } | null) ?? {};
    if (Array.isArray(wrapped.data)) return wrapped.data as Record<string, unknown>[];
    if (Array.isArray(wrapped.items)) return wrapped.items as Record<string, unknown>[];
    return [];
  }

  async function lookupCustomerId(email: string): Promise<string | null> {
    const result = await get(`/customers/lookups?keyword=${encodeURIComponent(email)}`);
    const match = asArray(result).find(
      (c) => typeof c.email === 'string' && c.email.toLowerCase() === email.toLowerCase(),
    );
    const id = match?._id ?? match?.id;
    return typeof id === 'string' && id ? id : null;
  }

  async function hasActiveSubscription(customerId: string): Promise<boolean> {
    // The documented filter params are thin; ask filtered, verify locally.
    const result = await get(`/subscriptions?customer=${encodeURIComponent(customerId)}`);
    return asArray(result).some((sub) => {
      const customer =
        typeof sub.customer === 'string'
          ? sub.customer
          : ((sub.customer as { _id?: unknown } | null)?._id ?? null);
      const belongs = customer === null || customer === customerId;
      const status = typeof sub.status === 'string' ? sub.status.toLowerCase() : '';
      return belongs && ACTIVE_STATUSES.has(status);
    });
  }

  return {
    async isSubscribed(email: string): Promise<boolean> {
      const key = email.toLowerCase();
      const cached = cache.get(key);
      if (cached && cached.expiresAt > now()) return cached.value;

      const customerId = await lookupCustomerId(email);
      const value = customerId ? await hasActiveSubscription(customerId) : false;
      cache.set(key, { value, expiresAt: now() + cacheTtlMs });
      return value;
    },
  };
}
