'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CompanionAction,
  CompanionActionResult,
  CompanionState,
} from '@joice/brain/schemas';
import { useBrainClient } from './provider';
import type { BrainClient } from './client';

/**
 * The pre-onboarding companion's capture flow. A read (`useCompanionProfile`)
 * for the current state — which field to ask next, the copy to say — and a
 * write (`useSubmitProfileField`) for each answer/skip/ready action.
 *
 * Deterministic, no streaming: unlike chat, capture is plain typed JSON, so it
 * flows through the hc client + TanStack like the rest of the app. Talks to the
 * brain service.
 */

export const companionKeys = {
  profile: ['companion', 'profile'] as const,
};

/** A field answer the server rejected — carries the field so the widget can flag it. */
export class FieldError extends Error {
  constructor(
    public readonly field: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'FieldError';
  }
}

async function unwrapState(res: Response): Promise<CompanionActionResult> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; field?: string };
    throw new FieldError(body.field, body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<CompanionActionResult>;
}

/** Current companion state for this session. Seeds the opener and every step. */
export function useCompanionProfile() {
  const client: BrainClient = useBrainClient();
  return useQuery({
    queryKey: companionKeys.profile,
    // The lead changes only through this client's own actions, so it never
    // needs background refetching; the mutation writes the fresh state in.
    staleTime: Infinity,
    queryFn: async (): Promise<CompanionState> => {
      const res = await client.api.brain.profile.$get();
      if (!res.ok) throw new Error(`Failed to load companion (${res.status})`);
      return res.json() as Promise<CompanionState>;
    },
  });
}

/**
 * Submit a field value, a skip, or the ready signal. On success the returned
 * state replaces the cached profile, so the UI advances without a refetch.
 * On a validation 400 it throws a `FieldError` naming the field.
 */
export function useSubmitProfileField() {
  const client: BrainClient = useBrainClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (action: CompanionAction): Promise<CompanionActionResult> => {
      const res = await client.api.brain.profile.$post({ json: action });
      return unwrapState(res);
    },
    onSuccess: (result) => {
      // The action result IS the next state — write it straight into the cache.
      queryClient.setQueryData<CompanionState>(companionKeys.profile, {
        profile: result.profile,
        nextStep: result.nextStep,
        copy: result.copy,
      });
    },
  });
}
