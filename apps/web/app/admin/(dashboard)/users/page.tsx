'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAdminUsers, useUpdateUserStatus } from '@joice/api-client';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Panel,
  Table,
  TableSkeleton,
  Td,
  Th,
} from '@/components/admin/ui';
import { AdminSelect, SearchInput } from '@/components/admin/fields';
import { useToast } from '@/components/admin/toast';

const STATUSES = ['active', 'suspended', 'deleted'] as const;
type Status = (typeof STATUSES)[number];

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const toast = useToast();

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useAdminUsers({
    page,
    limit: 25,
    ...(debouncedSearch && { search: debouncedSearch }),
  });
  const updateStatus = useUpdateUserStatus();

  function setUserStatus(id: string, email: string, next: Status) {
    updateStatus.mutate(
      { id, status: next },
      {
        onSuccess: () => toast(`${email} is now ${next}.`),
        onError: (error) =>
          toast(error instanceof Error ? error.message : 'Status change failed.', {
            tone: 'danger',
          }),
      },
    );
  }

  return (
    <>
      <PageHeader eyebrow="People" title="Users" />

      <Panel>
        <div className="mb-4">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email or name…"
            aria-label="Search users"
            className="max-w-xs"
          />
        </div>

        {query.isError ? (
          <ErrorState error={query.error} />
        ) : query.data && query.data.items.length === 0 ? (
          <EmptyState>No members yet. Users appear here when member sign-ups launch.</EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Name</Th>
                  <Th>Status</Th>
                  <Th>Clerk ID</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {query.isPending ? (
                  <TableSkeleton cols={5} />
                ) : (
                  query.data?.items.map((user) => (
                    <tr key={user.id}>
                      <Td>
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="text-ink underline-offset-2 hover:underline"
                        >
                          {user.email}
                        </Link>
                      </Td>
                      <Td>{[user.firstName, user.lastName].filter(Boolean).join(' ') || '·'}</Td>
                      <Td>
                        <AdminSelect
                          size="sm"
                          value={user.status}
                          disabled={updateStatus.isPending}
                          onChange={(e) =>
                            setUserStatus(user.id, user.email, e.target.value as Status)
                          }
                          aria-label={`Status for ${user.email}`}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </AdminSelect>
                      </Td>
                      <Td className="text-xs">{user.clerkUserId}</Td>
                      <Td>{new Date(user.createdAt).toLocaleDateString()}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
            {query.data ? (
              <Pagination
                page={page}
                limit={query.data.limit}
                total={query.data.total}
                onPageChange={setPage}
              />
            ) : null}
          </>
        )}
      </Panel>
    </>
  );
}
