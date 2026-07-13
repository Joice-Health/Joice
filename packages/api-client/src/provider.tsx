'use client';

import { createContext, createElement, useContext, useMemo, useRef, type ReactNode } from 'react';
import { createApiClient, type ApiClient, type ApiClientOptions } from './client';

const ApiClientContext = createContext<ApiClient | null>(null);

export function ApiClientProvider({
  baseUrl,
  getHeaders,
  children,
}: {
  baseUrl: string;
  /** Optional per-request auth headers (e.g. Clerk bearer token for admin calls). */
  getHeaders?: ApiClientOptions['headers'];
  children: ReactNode;
}) {
  // Keep the latest getHeaders in a ref so an unstable callback identity
  // doesn't rebuild the client (and reset downstream memoization) every render.
  const getHeadersRef = useRef(getHeaders);
  getHeadersRef.current = getHeaders;

  const client = useMemo(
    () =>
      createApiClient(baseUrl, {
        headers: () => getHeadersRef.current?.() ?? {},
      }),
    [baseUrl],
  );
  return createElement(ApiClientContext.Provider, { value: client }, children);
}

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (!client) throw new Error('useApiClient must be used within an ApiClientProvider');
  return client;
}
