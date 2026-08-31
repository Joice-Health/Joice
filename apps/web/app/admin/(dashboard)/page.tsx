'use client';

import Link from 'next/link';
import { Bracket } from '@joice/ui';
import { useAdminWaitlist, useFeatureFlags } from '@joice/api-client';
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  PanelHeader,
  Skeleton,
  Table,
  TableSkeleton,
  Td,
  Th,
} from '@/components/admin/ui';

function StatTile({ caption, value }: { caption: string; value: string | null }) {
  return (
    <Panel>
      <p className="mono-label text-muted">{caption}</p>
      {value === null ? (
        <Skeleton className="mt-3 h-9 w-24" />
      ) : (
        <p className="display mt-2 text-5xl text-ink tabular-nums">{value}</p>
      )}
    </Panel>
  );
}

export default function AdminDashboardPage() {
  const flags = useFeatureFlags();
  // Also the source of the signup total: the public /api/waitlist/stats is
  // behind the waitlist flag, and the dashboard must keep counting when the
  // waitlist is closed.
  const recent = useAdminWaitlist({ page: 1, limit: 5, sort: 'newest' });

  const enabledFlags = flags.data?.items.filter((f) => f.enabled).length;

  return (
    <>
      <PageHeader eyebrow="Overview" title="Dashboard" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          caption="Waitlist signups"
          value={recent.data ? String(recent.data.total) : null}
        />
        <StatTile
          caption="Feature flags on"
          value={flags.data ? `${enabledFlags} / ${flags.data.items.length}` : null}
        />
        <Panel>
          <p className="mono-label text-muted">Quick links</p>
          <div className="mt-3 flex flex-col gap-2">
            <Link className="mono-label text-ink transition-colors hover:text-brand-700" href="/admin/waitlist">
              <Bracket>manage waitlist</Bracket>
            </Link>
            <Link className="mono-label text-ink transition-colors hover:text-brand-700" href="/admin/flags">
              <Bracket>toggle flags</Bracket>
            </Link>
          </div>
        </Panel>
      </div>

      <Panel className="mt-6">
        <PanelHeader>Recent signups</PanelHeader>
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
              {recent.isPending ? (
                <TableSkeleton cols={5} />
              ) : (
                recent.data?.items.map((entry) => (
                  <tr key={entry.id}>
                    <Td>{entry.email}</Td>
                    <Td>{[entry.firstName, entry.lastName].filter(Boolean).join(' ') || '·'}</Td>
                    <Td>
                      <Badge tone={entry.status}>{entry.status}</Badge>
                    </Td>
                    <Td>{entry.referralCount}</Td>
                    <Td>{new Date(entry.createdAt).toLocaleDateString()}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
