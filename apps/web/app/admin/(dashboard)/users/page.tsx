'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Input } from '@joice/ui';
import { useAdminUsers, useUpdateUserStatus } from '@joice/api-client';
import {
  Panel,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Table,
  Td,
  Th,
} from '@/components/admin/ui';

const STATUSES = ['active', 'suspended', 'deleted'] as const;
type Status = (typeof STATUSES)[number];

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

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

  return (
    <>
      <PageHeader title="Users" />

      <Panel>
        <div className="mb-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email or name…"
            aria-label="Search users"
            className="h-11 max-w-xs text-sm"
          />
        </div>

        {query.isError ? (
          <ErrorState error={query.error} />
        ) : query.data && query.data.items.length === 0 ? (
          <EmptyState>
            No members yet — users appear here when member sign-ups launch.
          </EmptyState>
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
                {query.data?.items.map((user) => (
                  <tr key={user.id}>
                    <Td>
                      <Link href={`/admin/users/${user.id}`} className="text-ink underline-offset-2 hover:underline">
                        {user.email}
                      </Link>
                    </Td>
                    <Td>{[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}</Td>
                    <Td>
                      <select
                        value={user.status}
                        disabled={updateStatus.isPending}
                        onChange={(e) =>
                          updateStatus.mutate({ id: user.id, status: e.target.value as Status })
                        }
                        aria-label={`Status for ${user.email}`}
                        className="glass rounded-full px-2 py-1 text-xs text-ink outline-none"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </Td>
                    <Td className="font-mono text-xs">{user.clerkUserId}</Td>
                    <Td>{new Date(user.createdAt).toLocaleDateString()}</Td>
                  </tr>
                ))}
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
        {updateStatus.isError ? <ErrorState error={updateStatus.error} /> : null}
      </Panel>
    </>
  );
}
