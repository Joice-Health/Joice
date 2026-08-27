'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import type { InferRequestType, InferResponseType } from 'hono/client';
import type { BrainClient } from '../client';
import { useBrainClient } from '../provider';

/**
 * Eval console hooks over the BRAIN's admin surface (/api/brain/admin/eval/*),
 * the brain's first admin routes of its own. The surrounding ApiClientProvider
 * must inject the Clerk bearer token via getHeaders and point brainBaseUrl at
 * the brain service; these hooks add no auth themselves.
 */

type EvalApi = BrainClient['api']['brain']['admin']['eval'];

export type EvalCaseView = InferResponseType<EvalApi['cases']['$get'], 200>[number];
export type EvalCaseInputBody = InferRequestType<EvalApi['cases']['$post']>['json'];
export type EvalCasePatchBody = InferRequestType<(EvalApi['cases'][':id'])['$patch']>['json'];
export type EvalRunsQueryInput = InferRequestType<EvalApi['runs']['$get']>['query'];
export type EvalRunsPage = InferResponseType<EvalApi['runs']['$get'], 200>;
export type EvalRunSummary = EvalRunsPage['items'][number];
export type EvalRunDetail = InferResponseType<(EvalApi['runs'][':id'])['$get'], 200>;
export type EvalResultView = EvalRunDetail['results'][number];
export type StartEvalRunBody = InferRequestType<EvalApi['runs']['$post']>['json'];

export const adminEvalKeys = {
  cases: () => ['admin', 'eval', 'cases'] as const,
  runs: (query: EvalRunsQueryInput) => ['admin', 'eval', 'runs', query] as const,
  allRuns: () => ['admin', 'eval', 'runs'] as const,
  run: (id: string) => ['admin', 'eval', 'run', id] as const,
};

/** A run is already in flight; the panel shows this instead of a toast of JSON. */
export class EvalRunActiveError extends Error {
  constructor() {
    super('A run is already in progress');
    this.name = 'EvalRunActiveError';
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function useEvalCases() {
  const client = useBrainClient();
  return useQuery({
    queryKey: adminEvalKeys.cases(),
    queryFn: async (): Promise<EvalCaseView[]> =>
      unwrap(await client.api.brain.admin.eval.cases.$get()),
  });
}

export function useCreateEvalCase() {
  const client = useBrainClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (json: EvalCaseInputBody) =>
      unwrap<EvalCaseView>(await client.api.brain.admin.eval.cases.$post({ json })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminEvalKeys.cases() }),
  });
}

export function useUpdateEvalCase() {
  const client = useBrainClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: EvalCasePatchBody }) =>
      unwrap<EvalCaseView>(
        await client.api.brain.admin.eval.cases[':id'].$patch({ param: { id }, json: patch }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminEvalKeys.cases() }),
  });
}

export function useDeleteEvalCase() {
  const client = useBrainClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap<{ ok: true }>(
        await client.api.brain.admin.eval.cases[':id'].$delete({ param: { id } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminEvalKeys.cases() }),
  });
}

export function useEvalRuns(query: EvalRunsQueryInput) {
  const client = useBrainClient();
  return useQuery({
    queryKey: adminEvalKeys.runs(query),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<EvalRunsPage> =>
      unwrap(await client.api.brain.admin.eval.runs.$get({ query })),
  });
}

export function useStartEvalRun() {
  const client = useBrainClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (json: StartEvalRunBody) => {
      const res = await client.api.brain.admin.eval.runs.$post({ json });
      if (res.status === 409) throw new EvalRunActiveError();
      return unwrap<{ run: EvalRunSummary }>(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminEvalKeys.allRuns() }),
  });
}

/**
 * One run, with its results so far. The repo's one and only poll: 2s while
 * the run executes (results land row by row server-side), off the moment it
 * settles. Scoped here so nothing else inherits an interval by accident.
 */
export function useEvalRun(id: string | null) {
  const client = useBrainClient();
  return useQuery({
    queryKey: adminEvalKeys.run(id ?? 'none'),
    enabled: id !== null,
    refetchInterval: (query) =>
      query.state.data?.run.status === 'running' ? 2_000 : false,
    queryFn: async (): Promise<EvalRunDetail> =>
      unwrap(await client.api.brain.admin.eval.runs[':id'].$get({ param: { id: id! } })),
  });
}
