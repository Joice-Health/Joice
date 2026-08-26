import { hc } from 'hono/client';
import type { AppType } from '@joice/api';
import type { BrainAppType } from '@joice/brain-service';

export type ApiClient = ReturnType<typeof hc<AppType>>;

export interface ApiClientOptions {
  /** Called per request — inject auth headers (e.g. a Clerk bearer token). */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
}

/**
 * Build a fully-typed Hono RPC client bound to the API base URL.
 *
 * `credentials: 'include'` for the same reason the brain client has it: the
 * intake session on /get-started is an httpOnly cookie issued by the api, and
 * in local dev the web app (:3000) and the api (:4000) are different origins.
 * Same-origin in production, where it is a no-op. The api's CORS allows it.
 */
export function createApiClient(baseUrl: string, options?: ApiClientOptions): ApiClient {
  return hc<AppType>(baseUrl, {
    init: { credentials: 'include' },
    ...(options?.headers ? { headers: options.headers } : {}),
  });
}

/* ------------------------------------------------------------------------- *
 * The brain is a separate service, so it gets its own typed client.
 *
 * Two clients rather than one because they're two deployables with two route
 * chains — `BrainAppType` can't be part of `AppType` without merging the
 * services back together. In production both are reached through the same
 * CloudFront origin (the ALB routes `/api/brain/*` to the brain), so the base
 * URL is usually identical and the split costs nothing at the network layer.
 * ------------------------------------------------------------------------- */

export type BrainClient = ReturnType<typeof hc<BrainAppType>>;

/**
 * Build a fully-typed Hono RPC client bound to the brain service.
 *
 * `credentials: 'include'` is required: the brain identifies a visitor by an
 * opaque session cookie (companion capture, conversation grouping), and in
 * local dev the web app (:3000) and the brain (:4100) are different origins, so
 * without this the cookie is never sent and every request looks like a brand-new
 * visitor. In production they share one CloudFront origin, where it's a no-op.
 * The brain's CORS allows credentials for exactly this.
 */
export function createBrainClient(baseUrl: string, options?: ApiClientOptions): BrainClient {
  return hc<BrainAppType>(baseUrl, {
    init: { credentials: 'include' },
    ...(options?.headers ? { headers: options.headers } : {}),
  });
}
