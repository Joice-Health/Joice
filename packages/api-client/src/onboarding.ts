'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type {
  ActionError,
  AnswerInput,
  CarryOverInput,
  ClaimInput,
  ClaimResult,
  MemberProfileView,
  NotifyRequestInput,
  SessionState,
  SkipInput,
} from '@joice/core';
import { useApiClient } from './provider';

/**
 * The intake flow on /get-started. One read (`useOnboardingSession`) for the
 * current state (which step, progress, copy) and one mutation per action;
 * every action's result IS the next state, so it is written straight into the
 * session cache and the UI advances without a refetch. Talks to the api
 * service; the session rides on an httpOnly cookie (`credentials: 'include'`
 * on the client, see client.ts).
 */

export const onboardingKeys = {
  session: ['onboarding', 'session'] as const,
  me: ['onboarding', 'me'] as const,
};

/** The `onboarding` flag is off: the page should show the lead summary instead. */
export class OnboardingClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OnboardingClosedError';
  }
}

/** A rejected action, with the code the UI branches on and the question it concerns. */
export class OnboardingActionError extends Error {
  constructor(
    public readonly code: ActionError['code'],
    message: string,
    public readonly questionKey?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'OnboardingActionError';
  }
}

async function unwrapState(res: Response): Promise<SessionState> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Partial<ActionError>;
    if (res.status === 404 && !body.code) throw new OnboardingClosedError(body.error ?? 'Intake is not open');
    throw new OnboardingActionError(body.code ?? 'no_session', body.error ?? `Request failed (${res.status})`, body.questionKey, res.status);
  }
  return res.json() as Promise<SessionState>;
}

/** Current intake state for this browser's session. Creates the session on first load. */
export function useOnboardingSession(options?: Partial<UseQueryOptions<SessionState>>) {
  const client = useApiClient();
  return useQuery({
    queryKey: onboardingKeys.session,
    // The state changes only through this client's own actions, which write
    // the fresh state in; never refetch in the background.
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<SessionState> => {
      const res = await client.api.onboarding.session.$get();
      return unwrapState(res);
    },
    ...options,
  });
}

function useStateMutation<TInput>(run: (client: ReturnType<typeof useApiClient>, input: TInput) => Promise<Response>) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TInput): Promise<SessionState> => unwrapState(await run(client, input)),
    onSuccess: (state) => {
      queryClient.setQueryData<SessionState>(onboardingKeys.session, state);
    },
  });
}

/** Start or resume, carrying over what the companion already knows (shown as editable, never applied silently). */
export function useStartOnboarding() {
  return useStateMutation<{ carryOver?: CarryOverInput }>((client, input) =>
    client.api.onboarding.session.$post({ json: input }),
  );
}

export function useAnswerQuestion() {
  return useStateMutation<AnswerInput>((client, input) => client.api.onboarding.session.answer.$post({ json: input }));
}

export function useSkipQuestion() {
  return useStateMutation<SkipInput>((client, input) => client.api.onboarding.session.skip.$post({ json: input }));
}

export function useGoBack() {
  return useStateMutation<void>((client) => client.api.onboarding.session.back.$post());
}

/** Abandon the current session (answers purged server-side) and start over. */
export function useRestartOnboarding() {
  return useStateMutation<{ carryOver?: CarryOverInput }>((client, input) =>
    client.api.onboarding.session.restart.$post({ json: input }),
  );
}

/** "Tell me when my state opens." Only valid on a notify gate. */
export function useSubmitNotify() {
  return useStateMutation<NotifyRequestInput>((client, input) => client.api.onboarding.session.notify.$post({ json: input }));
}

/* ------------------------------------------------------------------------- */
/* Member: claim and the profile (needs the member providers: Clerk token)   */
/* ------------------------------------------------------------------------- */

/**
 * Link this browser's intake session to the signed-in member. Idempotent for
 * the same member; 409 `not_claimable` when the email is unverified or the
 * session was gated; 403 `forbidden` when it belongs to another account; 404
 * `no_session` when there is nothing to claim (a direct sign-up).
 */
export function useClaimOnboarding() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClaimInput = {}): Promise<ClaimResult> => {
      const res = await client.api.onboarding.session.claim.$post({ json: input });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        throw new OnboardingActionError((body.code as ActionError['code']) ?? 'no_session', body.error ?? `Claim failed (${res.status})`, undefined, res.status);
      }
      return res.json() as Promise<ClaimResult>;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<SessionState>(onboardingKeys.session, result.state);
      queryClient.invalidateQueries({ queryKey: onboardingKeys.me });
    },
  });
}

/** The member's own profile view (traits, segment, intake state). Creates the member record on first call. */
export function useMyProfile(options?: Partial<UseQueryOptions<MemberProfileView>>) {
  const client = useApiClient();
  return useQuery({
    queryKey: onboardingKeys.me,
    queryFn: async (): Promise<MemberProfileView> => {
      const res = await client.api.me.profile.$get();
      if (!res.ok) throw new Error(`Failed to load your profile (${res.status})`);
      return res.json() as Promise<MemberProfileView>;
    },
    ...options,
  });
}
