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

/** The port plus a test-only handle to await background revalidation. */
export interface CareportalsSubscriptions extends SubscriptionPort {
  /** Resolves when every in-flight background refresh has settled (tests). */
  flush(): Promise<void>;
}

export function createCareportalsSubscriptions(
  config: CareportalsSubscriptionsConfig,
): CareportalsSubscriptions {
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
  let loginInFlight: Promise<string | null> | null = null;
  const cache = new Map<string, { value: boolean; expiresAt: number }>();
  const refreshing = new Map<string, Promise<void>>();
  /** Transient failures get a short TTL so a blip never demotes for 5 minutes. */
  const unknownTtlMs = Math.min(cacheTtlMs, 30_000);

  function login(): Promise<string | null> {
    // Single-flight: N concurrent cold calls must not stampede a third party
    // that issues no static key.
    loginInFlight ??= loginOnce().finally(() => {
      loginInFlight = null;
    });
    return loginInFlight;
  }

  async function loginOnce(): Promise<string | null> {
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

  /**
   * GET with the bearer + organization headers, one re-login on a 401.
   * The UNKNOWN sentinel keeps "the call failed" distinct from an empty
   * result: a transient failure must never be cached as a definitive no.
   */
  async function get(path: string, retried = false): Promise<unknown | typeof UNKNOWN> {
    jwt ??= await login();
    if (!jwt) return UNKNOWN;
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
        return UNKNOWN;
      }
      return await res.json();
    } catch (error) {
      console.warn(`careportals ${path} failed (${(error as Error).message?.slice(0, 120)})`);
      return UNKNOWN;
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

  async function lookupCustomerId(email: string): Promise<string | null | typeof UNKNOWN> {
    const result = await get(`/customers/lookups?keyword=${encodeURIComponent(email)}`);
    if (result === UNKNOWN) return UNKNOWN;
    const match = asArray(result).find(
      (c) => typeof c.email === 'string' && c.email.toLowerCase() === email.toLowerCase(),
    );
    const id = match?._id ?? match?.id;
    return typeof id === 'string' && id ? id : null;
  }

  async function hasActiveSubscription(customerId: string): Promise<boolean | typeof UNKNOWN> {
    // The documented filter params are thin; ask filtered, verify locally.
    const result = await get(`/subscriptions?customer=${encodeURIComponent(customerId)}`);
    if (result === UNKNOWN) return UNKNOWN;
    return asArray(result).some((sub) => {
      // Ownership requires a POSITIVE match: a subscription whose customer
      // reference is missing or an unrecognized shape proves nothing, and
      // "proves nothing" must never read as "is a subscriber". Tolerate the
      // same _id/id spelling pair the lookup does.
      const ref = sub.customer as string | { _id?: unknown; id?: unknown } | null | undefined;
      const customer =
        typeof ref === 'string' ? ref : typeof ref?._id === 'string' ? ref._id : ref?.id;
      const status = typeof sub.status === 'string' ? sub.status.toLowerCase() : '';
      return customer === customerId && ACTIVE_STATUSES.has(status);
    });
  }

  /** One full resolution; coalesced per email so concurrent turns share it. */
  function refresh(key: string, email: string): Promise<void> {
    const existing = refreshing.get(key);
    if (existing) return existing;
    const task = (async () => {
      const customerId = await lookupCustomerId(email);
      const value = customerId === UNKNOWN ? UNKNOWN : customerId === null ? false : await hasActiveSubscription(customerId);
      if (value === UNKNOWN) {
        // Keep whatever we knew; if we knew nothing, a short-lived false so
        // the next window retries soon rather than in five minutes.
        if (!cache.has(key)) cache.set(key, { value: false, expiresAt: now() + unknownTtlMs });
        return;
      }
      cache.set(key, { value, expiresAt: now() + cacheTtlMs });
    })()
      .catch(() => {})
      .finally(() => {
        refreshing.delete(key);
      });
    refreshing.set(key, task);
    return task;
  }

  return {
    /**
     * Never waits on CarePortals: answers from cache (stale allowed) and
     * revalidates in the background. This call sits inside the internal
     * profile read the brain aborts at 1500ms, so a cold third-party chain
     * on the request path would make the subscriber tier unreachable and
     * take the whole member context down with it. The cost: the very first
     * chat turn in a cache window reads false; the tier lights up on the
     * next turn.
     */
    async isSubscribed(email: string): Promise<boolean> {
      const key = email.toLowerCase();
      const cached = cache.get(key);
      if (!cached || cached.expiresAt <= now()) void refresh(key, email);
      return cached?.value ?? false;
    },

    async flush(): Promise<void> {
      while (refreshing.size > 0) await Promise.all([...refreshing.values()]);
    },
  };
}

/** Sentinel for "the platform could not say", distinct from a definitive no. */
const UNKNOWN = Symbol('careportals-unknown');
