'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@joice/ui';
import { FLAG_KEYS } from '@joice/core/schemas';
import { useAdminWaitlist, useFeatureFlags, useUpdateWaitlistEntry } from '@joice/api-client';
import { apiUrl } from '@/lib/env';
import {
  Badge,
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

const STATUSES = ['pending', 'invited', 'converted'] as const;
type Status = (typeof STATUSES)[number];

export default function AdminWaitlistPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<Status | ''>('');
  const [exporting, setExporting] = useState(false);
  const { getToken } = useAuth();
  const toast = useToast();

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useAdminWaitlist({
    page,
    limit: 25,
    sort: 'newest',
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(status && { status }),
  });
  const updateEntry = useUpdateWaitlistEntry();

  // Whether the public page is live right now. Code reads a missing flag as
  // off, so a deleted row shows "off" here too. Toggled on /admin/flags.
  const flags = useFeatureFlags();
  const waitlistLive =
    flags.data?.items.find((f) => f.key === FLAG_KEYS.waitlist)?.enabled === true;

  function setEntryStatus(id: string, email: string, next: Status) {
    updateEntry.mutate(
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

  /** CSV export streams outside the RPC client, so attach the token manually. */
  async function exportCsv() {
    setExporting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/waitlist/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'joice-waitlist.csv';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="People" title="Waitlist">
        {flags.data ? (
          <Link
            href="/admin/flags"
            title="Toggle in Feature flags"
            className="mr-2 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
          >
            Public page
            <Badge tone={waitlistLive ? 'on' : 'off'}>{waitlistLive ? 'live' : 'off'}</Badge>
          </Link>
        ) : null}
        <Button variant="outline" onClick={exportCsv} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </Button>
      </PageHeader>

      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email or name…"
            aria-label="Search waitlist"
            className="max-w-xs"
          />
          <AdminSelect
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status | '');
              setPage(1);
            }}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </AdminSelect>
        </div>

        {query.isError ? (
          <ErrorState error={query.error} />
        ) : query.data && query.data.items.length === 0 ? (
          <EmptyState>No matching entries.</EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Email</Th>
                  <Th>Name</Th>
                  <Th>Status</Th>
                  <Th>Referrals</Th>
                  <Th>Code</Th>
                  <Th>Joined</Th>
                </tr>
              </thead>
              <tbody>
                {query.isPending ? (
                  <TableSkeleton cols={7} />
                ) : (
                  query.data?.items.map((entry) => (
                    <tr key={entry.id}>
                      <Td className="text-muted">{entry.sequence}</Td>
                      <Td>{entry.email}</Td>
                      <Td>{[entry.firstName, entry.lastName].filter(Boolean).join(' ') || '·'}</Td>
                      <Td>
                        <AdminSelect
                          size="sm"
                          value={entry.status}
                          disabled={updateEntry.isPending}
                          onChange={(e) =>
                            setEntryStatus(entry.id, entry.email, e.target.value as Status)
                          }
                          aria-label={`Status for ${entry.email}`}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </AdminSelect>
                      </Td>
                      <Td>{entry.referralCount}</Td>
                      <Td className="font-mono text-xs">{entry.referralCode}</Td>
                      <Td>{new Date(entry.createdAt).toLocaleDateString()}</Td>
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
