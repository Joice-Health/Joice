'use client';

import { useState } from 'react';
import { useAdminFlowVersions, useOnboardingFunnel } from '@joice/api-client';
import { Card, EmptyState, ErrorState, PageHeader, Table, Td, Th } from '@/components/admin/ui';

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
      <PageHeader title="Intake funnel">
        <select
          aria-label="Version"
          value={effective}
          onChange={(e) => setVersionId(e.target.value)}
          className="h-9 rounded-full bg-canvas px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50"
        >
          {(versions.data?.items ?? []).map((v) => (
            <option key={v.id} value={v.id}>
              v{v.version} ({v.status})
            </option>
          ))}
        </select>
      </PageHeader>

      {funnel.isPending ? <p className="mono-label text-muted">Loading…</p> : null}
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
              <Card key={label}>
                <p className="mono-label text-muted">{label}</p>
                <p className="mt-1 text-3xl text-ink">{value}</p>
              </Card>
            ))}
          </div>

          {Object.keys(funnel.data.gates).length > 0 ? (
            <Card className="mb-6">
              <p className="mono-label text-muted">Gate outcomes</p>
              <ul className="mt-2 flex flex-wrap gap-4">
                {Object.entries(funnel.data.gates).map(([outcome, count]) => (
                  <li key={outcome} className="text-sm text-ink">
                    <span className="mono-label mr-2 text-muted">{outcome}</span>
                    {count}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
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
                        <span className="font-mono text-xs">{q.questionKey}</span>
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
          </Card>
        </>
      ) : null}
    </div>
  );
}
