import { hc } from 'hono/client';
import type { AppType } from '@joice/api';
import type { BrainAppType } from '@joice/brain-service';

export type ApiClient = ReturnType<typeof hc<AppType>>;

export interface ApiClientOptions {
  /** Called per request — inject auth headers (e.g. a Clerk bearer token). */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
}

/** Build a fully-typed Hono RPC client bound to the API base URL. */
export function createApiClient(baseUrl: string, options?: ApiClientOptions): ApiClient {
  return hc<AppType>(baseUrl, options?.headers ? { headers: options.headers } : undefined);
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

/** Build a fully-typed Hono RPC client bound to the brain service. */
export function createBrainClient(baseUrl: string, options?: ApiClientOptions): BrainClient {
  return hc<BrainAppType>(baseUrl, options?.headers ? { headers: options.headers } : undefined);
}
