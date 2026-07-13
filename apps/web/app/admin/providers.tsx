'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { ApiClientProvider } from '@joice/api-client';
import { apiUrl } from '@/lib/env';

/**
 * Admin-scoped providers: own QueryClient plus an API client that attaches the
 * Clerk session token to every request. The public site's root Providers stay
 * token-free.
 */
export function AdminProviders({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider
        baseUrl={apiUrl}
        getHeaders={async (): Promise<Record<string, string>> => {
          const token = await getToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        }}
      >
        {children}
      </ApiClientProvider>
    </QueryClientProvider>
  );
}
