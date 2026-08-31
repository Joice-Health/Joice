'use client';

import { use } from 'react';
import Link from 'next/link';
import { useAdminMemberProfile } from '@joice/api-client';
import { Badge, Panel, EmptyState, ErrorState, PageHeader, Table, Td, Th } from '@/components/admin/ui';

/**
 * One member, read-only: who they are, their tier-bounded traits with
 * provenance, their segment, and where their intake stands. Health-tier
 * traits stay out until the PHI keys are on, for admins too; answers never
 * appear anywhere else in admin (the funnel counts steps).
 */
export default function AdminMemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useAdminMemberProfile(id);

  if (query.isPending) return <p className="mono-label text-muted">Loading…</p>;
  if (query.error) return <ErrorState error={query.error} />;
  const me = query.data!;

  return (
    <div>
      <PageHeader title={me.firstName ? `${me.firstName}${me.user?.lastName ? ` ${me.user.lastName}` : ''}` : 'Member'}>
        <Link href="/admin/users" className="mono-label text-muted hover:text-ink">
          All users
        </Link>
      </PageHeader>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Panel>
          <p className="mono-label text-muted">Email</p>
          <p className="mt-1 text-base text-ink">{me.email ?? 'unknown'}</p>
        </Panel>
        <Panel>
          <p className="mono-label text-muted">Goal</p>
          <p className="mt-1 text-base text-ink">{me.goalLabel ?? 'not set'}</p>
          {me.segment ? <Badge tone="active">{me.segment}</Badge> : null}
        </Panel>
        <Panel>
          <p className="mono-label text-muted">Intake</p>
          <p className="mt-1 text-base text-ink">{me.intake?.status ?? 'none'}</p>
          {me.intake ? <p className="mono-label mt-1 text-muted">flow v{me.intake.flowVersion}</p> : null}
        </Panel>
      </div>

      <Panel>
        {me.traits.length === 0 ? (
          <EmptyState>No profile traits yet.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Trait</Th>
                <Th>Value</Th>
                <Th>Source</Th>
                <Th>Observed</Th>
              </tr>
            </thead>
            <tbody>
              {me.traits.map((t) => (
                <tr key={t.key}>
                  <Td>
                    {t.label} <span className="mono-label text-muted">{t.key}</span>
                  </Td>
                  <Td>{t.value}</Td>
                  <Td>
                    <Badge tone={t.source === 'clinician' ? 'active' : t.source === 'derived' ? 'pending' : 'invited'}>
                      {t.source}
                    </Badge>
                  </Td>
                  <Td>{new Date(t.observedAt).toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
