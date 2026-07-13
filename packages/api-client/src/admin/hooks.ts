'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import type { InferRequestType, InferResponseType } from 'hono/client';
import type { ApiClient } from '../client';
import { useApiClient } from '../provider';

/**
 * Admin hooks over /api/admin/*. The surrounding ApiClientProvider must inject
 * a Clerk bearer token via getHeaders — these hooks add no auth themselves.
 */

type AdminApi = ApiClient['api']['admin'];

export type AdminWaitlistQuery = InferRequestType<AdminApi['waitlist']['$get']>['query'];
export type AdminWaitlistPage = InferResponseType<AdminApi['waitlist']['$get'], 200>;
export type AdminUsersQuery = InferRequestType<AdminApi['users']['$get']>['query'];
export type AdminUsersPage = InferResponseType<AdminApi['users']['$get'], 200>;
export type AdminList = InferResponseType<AdminApi['admins']['$get'], 200>;
export type FeatureFlagList = InferResponseType<AdminApi['flags']['$get'], 200>;
export type SettingsList = InferResponseType<AdminApi['settings']['$get'], 200>;
export type AuditLogQuery = InferRequestType<AdminApi['audit-logs']['$get']>['query'];
export type AuditLogPage = InferResponseType<AdminApi['audit-logs']['$get'], 200>;
export type PublicFlags = InferResponseType<ApiClient['api']['flags']['$get'], 200>;

export const adminKeys = {
  all: ['admin'] as const,
  waitlist: (query: AdminWaitlistQuery) => ['admin', 'waitlist', query] as const,
  users: (query: AdminUsersQuery) => ['admin', 'users', query] as const,
  admins: () => ['admin', 'admins'] as const,
  flags: () => ['admin', 'flags'] as const,
  settings: () => ['admin', 'settings'] as const,
  auditLogs: (query: AuditLogQuery) => ['admin', 'audit-logs', query] as const,
};

export const publicFlagKeys = {
  all: ['flags'] as const,
};

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// --- Waitlist ---

export function useAdminWaitlist(query: AdminWaitlistQuery) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminKeys.waitlist(query),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<AdminWaitlistPage> =>
      unwrap(await client.api.admin.waitlist.$get({ query })),
  });
}

export function useUpdateWaitlistEntry() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: 'pending' | 'invited' | 'converted' }) =>
      unwrap(
        await client.api.admin.waitlist[':id'].$patch({
          param: { id: input.id },
          json: { status: input.status },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'waitlist'] }),
  });
}

// --- Member users ---

export function useAdminUsers(query: AdminUsersQuery) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminKeys.users(query),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<AdminUsersPage> =>
      unwrap(await client.api.admin.users.$get({ query })),
  });
}

export function useUpdateUserStatus() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: 'active' | 'suspended' | 'deleted' }) =>
      unwrap(
        await client.api.admin.users[':id'].$patch({
          param: { id: input.id },
          json: { status: input.status },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

// --- Admin accounts ---

export function useAdmins() {
  const client = useApiClient();
  return useQuery({
    queryKey: adminKeys.admins(),
    queryFn: async (): Promise<AdminList> => unwrap(await client.api.admin.admins.$get()),
  });
}

export function useSetAdminRole() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { clerkUserId: string; role: 'admin' | null }) =>
      unwrap(await client.api.admin.admins.$post({ json: input })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.admins() }),
  });
}

// --- Feature flags ---

export function useFeatureFlags() {
  const client = useApiClient();
  return useQuery({
    queryKey: adminKeys.flags(),
    queryFn: async (): Promise<FeatureFlagList> => unwrap(await client.api.admin.flags.$get()),
  });
}

export function useCreateFlag() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { key: string; description?: string; enabled: boolean }) =>
      unwrap(await client.api.admin.flags.$post({ json: input })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.flags() }),
  });
}

export function useUpdateFlag() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      enabled?: boolean;
      description?: string | null;
    }) => {
      const { id, ...json } = input;
      return unwrap(await client.api.admin.flags[':id'].$patch({ param: { id }, json }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.flags() });
      queryClient.invalidateQueries({ queryKey: publicFlagKeys.all });
    },
  });
}

export function useDeleteFlag() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await client.api.admin.flags[':id'].$delete({ param: { id } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.flags() }),
  });
}

// --- Settings ---

export function useSettings() {
  const client = useApiClient();
  return useQuery({
    queryKey: adminKeys.settings(),
    queryFn: async (): Promise<SettingsList> => unwrap(await client.api.admin.settings.$get()),
  });
}

export function useUpsertSetting() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { key: string; value: unknown; description?: string }) =>
      unwrap(
        await client.api.admin.settings[':key'].$put({
          param: { key: input.key },
          json: { value: input.value, description: input.description },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.settings() }),
  });
}

export function useDeleteSetting() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) =>
      unwrap(await client.api.admin.settings[':key'].$delete({ param: { key } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.settings() }),
  });
}

// --- Audit log ---

export function useAuditLogs(query: AuditLogQuery) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminKeys.auditLogs(query),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<AuditLogPage> =>
      unwrap(await client.api.admin['audit-logs'].$get({ query })),
  });
}

// --- Public flags ---

export function usePublicFlags() {
  const client = useApiClient();
  return useQuery({
    queryKey: publicFlagKeys.all,
    staleTime: 30_000,
    queryFn: async (): Promise<PublicFlags> => unwrap(await client.api.flags.$get()),
  });
}
