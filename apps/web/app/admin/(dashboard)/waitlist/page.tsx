'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { Button, Input } from '@joice/ui';
import { FLAG_KEYS } from '@joice/core/schemas';
import { useAdminWaitlist, useFeatureFlags, useUpdateWaitlistEntry } from '@joice/api-client';
import { apiUrl } from '@/lib/env';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Table,
  Td,
  Th,
} from '@/components/admin/ui';

const STATUSES = ['pending', 'invited', 'converted'] as const;
type Status = (typeof STATUSES)[number];

export default function AdminWaitlistPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<Status | ''>('');
  const [exporting, setExporting] = useState(false);
  const { getToken } = useAuth();

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
      <PageHeader title="Waitlist">
        {flags.data ? (
          <Link
            href="/admin/flags"
            title="Toggle in Feature flags"
            className="mr-2 inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
          >
            Public page
            <Badge tone={waitlistLive ? 'on' : 'off'}>{waitlistLive ? 'live' : 'off'}</Badge>
          </Link>
        ) : null}
        <Button variant="glass" onClick={exportCsv} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </Button>
      </PageHeader>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email or name…"
            aria-label="Search waitlist"
            className="h-11 max-w-xs text-sm"
          />
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status | '');
              setPage(1);
            }}
            aria-label="Filter by status"
            className="glass h-11 rounded-full px-4 text-sm text-ink outline-none"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
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
                {query.data?.items.map((entry) => (
                  <tr key={entry.id}>
                    <Td className="text-muted">{entry.sequence}</Td>
                    <Td>{entry.email}</Td>
                    <Td>{[entry.firstName, entry.lastName].filter(Boolean).join(' ') || '—'}</Td>
                    <Td>
                      <select
                        value={entry.status}
                        disabled={updateEntry.isPending}
                        onChange={(e) =>
                          updateEntry.mutate({ id: entry.id, status: e.target.value as Status })
                        }
                        aria-label={`Status for ${entry.email}`}
                        className="glass rounded-full px-2 py-1 text-xs text-ink outline-none"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </Td>
                    <Td>{entry.referralCount}</Td>
                    <Td className="font-mono text-xs">{entry.referralCode}</Td>
                    <Td>{new Date(entry.createdAt).toLocaleDateString()}</Td>
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
        {updateEntry.isError ? <ErrorState error={updateEntry.error} /> : null}
      </Card>
    </>
  );
}
