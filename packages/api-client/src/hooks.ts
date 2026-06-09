'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type { JoinWaitlistInput, WaitlistEntryView, WaitlistStats } from '@joice/core';
import { useApiClient } from './provider';

export const waitlistKeys = {
  all: ['waitlist'] as const,
  byCode: (code: string) => ['waitlist', 'code', code] as const,
  stats: () => ['waitlist', 'stats'] as const,
};

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** Join the waitlist. Idempotent server-side: an existing email returns its card. */
export function useJoinWaitlist() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: JoinWaitlistInput): Promise<WaitlistEntryView> => {
      const res = await client.api.waitlist.$post({ json: input });
      return unwrap<WaitlistEntryView>(res);
    },
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: waitlistKeys.stats() });
      queryClient.setQueryData(waitlistKeys.byCode(entry.referralCode), entry);
    },
  });
}

/** Look up a referral code's live position + referral count. */
export function useWaitlistByCode(
  code: string | undefined,
  options?: Partial<UseQueryOptions<WaitlistEntryView>>,
) {
  const client = useApiClient();

  return useQuery({
    queryKey: waitlistKeys.byCode(code ?? ''),
    enabled: Boolean(code),
    queryFn: async (): Promise<WaitlistEntryView> => {
      const res = await client.api.waitlist[':code'].$get({ param: { code: code! } });
      return unwrap<WaitlistEntryView>(res);
    },
    ...options,
  });
}

/** Total signups, for social-proof counters. */
export function useWaitlistStats(options?: Partial<UseQueryOptions<WaitlistStats>>) {
  const client = useApiClient();

  return useQuery({
    queryKey: waitlistKeys.stats(),
    queryFn: async (): Promise<WaitlistStats> => {
      const res = await client.api.waitlist.stats.$get();
      return unwrap<WaitlistStats>(res);
    },
    ...options,
  });
}
