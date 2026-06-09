import { hc } from 'hono/client';
import type { AppType } from '@joice/api';

export type ApiClient = ReturnType<typeof hc<AppType>>;

/** Build a fully-typed Hono RPC client bound to the API base URL. */
export function createApiClient(baseUrl: string): ApiClient {
  return hc<AppType>(baseUrl);
}
