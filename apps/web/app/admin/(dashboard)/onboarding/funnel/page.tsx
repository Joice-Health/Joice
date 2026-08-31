'use client';

import { useState } from 'react';
import { useAdminFlowVersions, useOnboardingFunnel } from '@joice/api-client';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  PanelHeader,
  PanelSkeleton,
  Table,
  Td,
  Th,
} from '@/components/admin/ui';
import { AdminSelect } from '@/components/admin/fields';

const CRUMBS = [{ href: '/admin/onboarding', label: 'Onboarding' }];

/**
 * Per version: starts, per-question reach and drop, gate outcomes,
 * completions, registrations. Counts of distinct sessions from
 * onboarding_events, which never holds an answer value.
 */
export default function AdminOnboardingFunnelPage() {
  const versions = useAdminFlowVersions();
  const [versionId, setVersionId] = useState('');
  const effective = versionId || versions.data?.items.find((v) => v.status === 'published')?.id || '';
  const funnel = useOnboardingFunnel({ versionId: effective });

  if (versions.error) return <ErrorState error={versions.error} />;

  return (
    <div>
      <PageHeader breadcrumbs={CRUMBS} title="Intake funnel">
        <AdminSelect
          size="sm"
          aria-label="Version"
          value={effective}
          onChange={(e) => setVersionId(e.target.value)}
        >
          {(versions.data?.items ?? []).map((v) => (
            <option key={v.id} value={v.id}>
              v{v.version} ({v.status})
            </option>
          ))}
        </AdminSelect>
      </PageHeader>

      {funnel.isPending ? <PanelSkeleton /> : null}
      {funnel.error ? <ErrorState error={funnel.error} /> : null}
      {funnel.data ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {(
              [
                ['Starts', funnel.data.starts],
                ['Completions', funnel.data.completions],
                ['Registrations', funnel.data.registrations],
                ['Gate hits', Object.values(funnel.data.gates).reduce((a, b) => a + b, 0)],
              ] as const
            ).map(([label, value]) => (
              <Panel key={label}>
                <p className="mono-label text-muted">{label}</p>
                <p className="display mt-2 text-4xl text-ink tabular-nums">{value}</p>
              </Panel>
            ))}
          </div>

          {Object.keys(funnel.data.gates).length > 0 ? (
            <Panel className="mb-6">
              <PanelHeader>Gate outcomes</PanelHeader>
              <ul className="flex flex-wrap gap-4">
                {Object.entries(funnel.data.gates).map(([outcome, count]) => (
                  <li key={outcome} className="text-sm text-ink">
                    <span className="mr-2 text-sm text-muted">{outcome}</span>
                    {count}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel>
            {funnel.data.questions.length === 0 ? (
              <EmptyState>No question events for this version yet.</EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Question</Th>
                    <Th>Viewed</Th>
                    <Th>Answered</Th>
                    <Th>Skipped</Th>
                    <Th>Drop</Th>
                  </tr>
                </thead>
                <tbody>
                  {funnel.data.questions.map((q) => (
                    <tr key={q.questionKey}>
                      <Td>
                        <span className="text-xs">{q.questionKey}</span>
                      </Td>
                      <Td>{q.viewed}</Td>
                      <Td>{q.answered}</Td>
                      <Td>{q.skipped}</Td>
                      <Td>{Math.max(0, q.viewed - q.answered - q.skipped)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
