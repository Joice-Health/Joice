'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { ApiClientProvider } from '@joice/api-client';
import { apiUrl, brainUrl } from '@/lib/env';

/**
 * Member-scoped providers: the public QueryClient defaults plus an api client
 * that attaches the member's Clerk session token to every request (the api's
 * `requireMember` reads it), and the brain client for the companion claim.
 * The public site's root Providers stay token-free.
 */
export function MemberProviders({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider
        baseUrl={apiUrl}
        brainBaseUrl={brainUrl}
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
