'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InferRequestType, InferResponseType } from 'hono/client';
import type { ValidationReport } from '@joice/core';
import type { ApiClient } from '../client';
import { useApiClient } from '../provider';

/**
 * Admin hooks for the onboarding surface (/api/admin/onboarding/*). Same
 * contract as the other admin hooks: the surrounding provider injects the
 * Clerk bearer token; every type is inferred from the route chain.
 */

type OnboardingAdminApi = ApiClient['api']['admin']['onboarding'];

export type AdminFlowList = InferResponseType<OnboardingAdminApi['flows']['$get'], 200>;
/** The two PHI keys and their AND, as the flows list serves them to the editor. */
export type AdminPhiStatus = AdminFlowList['phi'];
export type AdminFlowVersionList = InferResponseType<
  OnboardingAdminApi['flows'][':key']['versions']['$get'],
  200
>;
export type AdminFlowVersion = InferResponseType<OnboardingAdminApi['versions'][':id']['$get'], 200>;
export type SaveDraftInput = InferRequestType<OnboardingAdminApi['versions'][':id']['$put']>['json'];
export type SaveDraftResult = { version: AdminFlowVersion; report: ValidationReport };
export type ValidationReportView = ValidationReport;
export type SimulateInput = InferRequestType<OnboardingAdminApi['simulate']['$post']>['json'];
export type SimulateResult = InferResponseType<OnboardingAdminApi['simulate']['$post'], 200>;
export type ServiceAreaList = InferResponseType<OnboardingAdminApi['service-areas']['$get'], 200>;
export type FunnelQueryInput = InferRequestType<OnboardingAdminApi['funnel']['$get']>['query'];
export type FunnelView = InferResponseType<OnboardingAdminApi['funnel']['$get'], 200>;
export type ServiceAreaRequestsQueryInput = InferRequestType<OnboardingAdminApi['requests']['$get']>['query'];
export type ServiceAreaRequestsPage = InferResponseType<OnboardingAdminApi['requests']['$get'], 200>;

export const adminOnboardingKeys = {
  all: ['admin', 'onboarding'] as const,
  flows: () => ['admin', 'onboarding', 'flows'] as const,
  versions: (key: string) => ['admin', 'onboarding', 'versions', key] as const,
  version: (id: string) => ['admin', 'onboarding', 'version', id] as const,
  serviceAreas: () => ['admin', 'onboarding', 'service-areas'] as const,
  funnel: (query: FunnelQueryInput) => ['admin', 'onboarding', 'funnel', query] as const,
  requests: (query: ServiceAreaRequestsQueryInput) => ['admin', 'onboarding', 'requests', query] as const,
};

/** A 422 publish refusal, carrying the validator's report for the editor. */
export class PublishRefusedError extends Error {
  constructor(
    message: string,
    public readonly report: ValidationReportView,
  ) {
    super(message);
    this.name = 'PublishRefusedError';
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function useAdminFlows() {
  const client = useApiClient();
  return useQuery({
    queryKey: adminOnboardingKeys.flows(),
    queryFn: async () => unwrap<AdminFlowList>(await client.api.admin.onboarding.flows.$get()),
  });
}

export function useAdminFlowVersions(key = 'intake') {
  const client = useApiClient();
  return useQuery({
    queryKey: adminOnboardingKeys.versions(key),
    queryFn: async () =>
      unwrap<AdminFlowVersionList>(await client.api.admin.onboarding.flows[':key'].versions.$get({ param: { key: 'intake' } })),
  });
}

export function useAdminFlowVersion(id: string | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminOnboardingKeys.version(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () =>
      unwrap<AdminFlowVersion>(await client.api.admin.onboarding.versions[':id'].$get({ param: { id: id! } })),
  });
}

function useInvalidateVersions() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    queryClient.invalidateQueries({ queryKey: adminOnboardingKeys.flows() });
    queryClient.invalidateQueries({ queryKey: adminOnboardingKeys.versions('intake') });
    if (id) queryClient.invalidateQueries({ queryKey: adminOnboardingKeys.version(id) });
  };
}

export function useCreateFlowVersion() {
  const client = useApiClient();
  const invalidate = useInvalidateVersions();
  return useMutation({
    mutationFn: async (input: { fromVersionId?: string; notes?: string }) =>
      unwrap<AdminFlowVersion>(
        await client.api.admin.onboarding.flows[':key'].versions.$post({ param: { key: 'intake' }, json: input }),
      ),
    onSuccess: () => invalidate(),
  });
}

export function useSaveFlowVersion() {
  const client = useApiClient();
  const invalidate = useInvalidateVersions();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & SaveDraftInput) =>
      unwrap<SaveDraftResult>(await client.api.admin.onboarding.versions[':id'].$put({ param: { id }, json: input })),
    onSuccess: (_result, { id }) => invalidate(id),
  });
}

export function usePublishFlowVersion() {
  const client = useApiClient();
  const invalidate = useInvalidateVersions();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const res = await client.api.admin.onboarding.versions[':id'].publish.$post({ param: { id }, json: { notes } });
      if (res.status === 422) {
        const body = (await res.json()) as { error: string; report: ValidationReportView };
        throw new PublishRefusedError(body.error, body.report);
      }
      return unwrap<{ version: AdminFlowVersion }>(res);
    },
    onSuccess: (_result, { id }) => invalidate(id),
  });
}

export function useRollbackFlow() {
  const client = useApiClient();
  const invalidate = useInvalidateVersions();
  return useMutation({
    mutationFn: async (input: { versionId: string }) =>
      unwrap<{ version: AdminFlowVersion }>(
        await client.api.admin.onboarding.flows[':key'].rollback.$post({ param: { key: 'intake' }, json: input }),
      ),
    onSuccess: () => invalidate(),
  });
}

/** Run a persona through a version or an unsaved definition. Nothing persists. */
export function useSimulateFlow() {
  const client = useApiClient();
  return useMutation({
    mutationFn: async (input: SimulateInput) =>
      unwrap<SimulateResult>(await client.api.admin.onboarding.simulate.$post({ json: input })),
  });
}

export function useServiceAreas() {
  const client = useApiClient();
  return useQuery({
    queryKey: adminOnboardingKeys.serviceAreas(),
    queryFn: async () => unwrap<ServiceAreaList>(await client.api.admin.onboarding['service-areas'].$get()),
  });
}

export function useUpdateServiceArea() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, ...input }: { code: string; status: 'open' | 'notify' | 'closed'; note?: string | null }) =>
      unwrap<unknown>(
        await client.api.admin.onboarding['service-areas'][':code'].$patch({
          param: { code: code as never },
          json: input,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminOnboardingKeys.serviceAreas() }),
  });
}

export function useUpdateOnboardingSettings() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { minimumAge?: number }) =>
      unwrap<{ minimumAge: number }>(await client.api.admin.onboarding.settings.$put({ json: input })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminOnboardingKeys.serviceAreas() }),
  });
}

export function useOnboardingFunnel(query: FunnelQueryInput) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminOnboardingKeys.funnel(query),
    enabled: Boolean(query.versionId),
    placeholderData: keepPreviousData,
    queryFn: async () => unwrap<FunnelView>(await client.api.admin.onboarding.funnel.$get({ query })),
  });
}

export type AdminMemberProfile = InferResponseType<
  OnboardingAdminApi['members'][':id']['profile']['$get'],
  200
>;

/** A member's tier-bounded profile with provenance, for support. */
export function useAdminMemberProfile(memberId: string | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['admin', 'onboarding', 'member-profile', memberId] as const,
    enabled: Boolean(memberId),
    queryFn: async () =>
      unwrap<AdminMemberProfile>(
        await client.api.admin.onboarding.members[':id'].profile.$get({ param: { id: memberId! } }),
      ),
  });
}

export function useServiceAreaRequests(query: ServiceAreaRequestsQueryInput) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminOnboardingKeys.requests(query),
    placeholderData: keepPreviousData,
    queryFn: async () => unwrap<ServiceAreaRequestsPage>(await client.api.admin.onboarding.requests.$get({ query })),
  });
}
