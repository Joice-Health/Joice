import { hc } from 'hono/client';
import type { AppType } from '@joice/api';

export type ApiClient = ReturnType<typeof hc<AppType>>;

export interface ApiClientOptions {
  /** Called per request — inject auth headers (e.g. a Clerk bearer token). */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
}

/** Build a fully-typed Hono RPC client bound to the API base URL. */
export function createApiClient(baseUrl: string, options?: ApiClientOptions): ApiClient {
  return hc<AppType>(baseUrl, options?.headers ? { headers: options.headers } : undefined);
}
