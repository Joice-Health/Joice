'use client';

import Link from 'next/link';
import { useAdminWaitlist, useFeatureFlags } from '@joice/api-client';
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from '@/components/admin/ui';

export default function AdminDashboardPage() {
  const flags = useFeatureFlags();
  // Also the source of the signup total: the public /api/waitlist/stats is
  // behind the waitlist flag, and the dashboard must keep counting when the
  // waitlist is closed.
  const recent = useAdminWaitlist({ page: 1, limit: 5, sort: 'newest' });

  const enabledFlags = flags.data?.items.filter((f) => f.enabled).length;

  return (
    <>
      <PageHeader title="Dashboard" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">Waitlist signups</p>
          <p className="mt-1 text-3xl font-semibold text-ink">{recent.data?.total ?? '—'}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Feature flags on</p>
          <p className="mt-1 text-3xl font-semibold text-ink">
            {flags.data ? `${enabledFlags} / ${flags.data.items.length}` : '—'}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Quick links</p>
          <div className="mt-2 flex flex-col gap-1 text-sm">
            <Link className="text-brand-800 hover:underline" href="/admin/waitlist">
              Manage waitlist →
            </Link>
            <Link className="text-brand-800 hover:underline" href="/admin/flags">
              Toggle flags →
            </Link>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">Recent signups</h2>
        {recent.data && recent.data.items.length === 0 ? (
          <EmptyState>No signups yet.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th>Referrals</Th>
                <Th>Joined</Th>
              </tr>
            </thead>
            <tbody>
              {recent.data?.items.map((entry) => (
                <tr key={entry.id}>
                  <Td>{entry.email}</Td>
                  <Td>{[entry.firstName, entry.lastName].filter(Boolean).join(' ') || '—'}</Td>
                  <Td>
                    <Badge tone={entry.status}>{entry.status}</Badge>
                  </Td>
                  <Td>{entry.referralCount}</Td>
                  <Td>{new Date(entry.createdAt).toLocaleDateString()}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
