'use client';

import { createContext, createElement, useContext, useMemo, useRef, type ReactNode } from 'react';
import {
  createApiClient,
  createBrainClient,
  type ApiClient,
  type ApiClientOptions,
  type BrainClient,
} from './client';

const ApiClientContext = createContext<ApiClient | null>(null);
const BrainClientContext = createContext<BrainClient | null>(null);

export function ApiClientProvider({
  baseUrl,
  brainBaseUrl,
  getHeaders,
  children,
}: {
  baseUrl: string;
  /**
   * Where the brain service lives. Defaults to `baseUrl`, which is correct in
   * production and in Docker: CloudFront serves one origin and the ALB routes
   * `/api/brain/*` to the brain. Only set this when the two are genuinely on
   * different hosts — running both dev servers directly on the host, say.
   */
  brainBaseUrl?: string;
  /** Optional per-request auth headers (e.g. Clerk bearer token for admin calls). */
  getHeaders?: ApiClientOptions['headers'];
  children: ReactNode;
}) {
  // Keep the latest getHeaders in a ref so an unstable callback identity
  // doesn't rebuild the client (and reset downstream memoization) every render.
  const getHeadersRef = useRef(getHeaders);
  getHeadersRef.current = getHeaders;

  const client = useMemo(
    () => createApiClient(baseUrl, { headers: () => getHeadersRef.current?.() ?? {} }),
    [baseUrl],
  );
  const brain = useMemo(
    () =>
      createBrainClient(brainBaseUrl ?? baseUrl, {
        headers: () => getHeadersRef.current?.() ?? {},
      }),
    [brainBaseUrl, baseUrl],
  );

  return createElement(
    ApiClientContext.Provider,
    { value: client },
    createElement(BrainClientContext.Provider, { value: brain }, children),
  );
}

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (!client) throw new Error('useApiClient must be used within an ApiClientProvider');
  return client;
}

/** The brain service — chat, voice and the public chat config. */
export function useBrainClient(): BrainClient {
  const client = useContext(BrainClientContext);
  if (!client) throw new Error('useBrainClient must be used within an ApiClientProvider');
  return client;
}
