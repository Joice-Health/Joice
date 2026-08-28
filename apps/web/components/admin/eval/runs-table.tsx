'use client';

import Link from 'next/link';
import type { EvalRunSummary, EvalRunsPage } from '@joice/api-client';
import { Badge, Card, EmptyState, Pagination, Table, Td, Th } from '@/components/admin/ui';
import { relativeTime } from './form';

/**
 * Run history, newest first. The score delta compares against the next older
 * COMPLETED run of the same mode within the page: enough to read a trend at
 * a glance; the run detail page does the per-question comparison properly.
 */
export function RunsTable({
  data,
  page,
  limit,
  onPageChange,
}: {
  data: EvalRunsPage | undefined;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
}) {
  const items = data?.items ?? [];

  const deltaFor = (run: EvalRunSummary): string | null => {
    if (run.status !== 'completed' || run.passedCases === null) return null;
    const previous = items.find(
      (r) =>
        r.mode === run.mode &&
        r.status === 'completed' &&
        r.passedCases !== null &&
        new Date(r.startedAt).getTime() < new Date(run.startedAt).getTime(),
    );
    if (!previous) return null;
    const delta = run.passedCases - (previous.passedCases ?? 0);
    if (delta === 0) return null;
    return delta > 0 ? `+${delta}` : `${delta}`;
  };

  return (
    <Card className="mb-6">
      <h2 className="mb-4 text-lg font-semibold text-ink">Runs</h2>
      {items.length === 0 ? (
        <EmptyState>No runs yet. Start one above.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Score</Th>
              <Th>Mode</Th>
              <Th>Model</Th>
              <Th>Latency p50</Th>
              <Th>Tokens</Th>
              <Th>Who</Th>
              <Th>When</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((run) => {
              const delta = deltaFor(run);
              return (
                <tr key={run.id} className="hover:bg-white/40">
                  <Td>
                    <Link href={`/admin/eval/${run.id}`} className="font-medium hover:underline">
                      {run.passedCases !== null
                        ? `${run.passedCases}/${run.totalCases}`
                        : `…/${run.totalCases}`}
                    </Link>
                    {delta ? (
                      <span
                        className={
                          delta.startsWith('+') ? 'ml-2 text-xs text-emerald-700' : 'ml-2 text-xs text-red-600'
                        }
                      >
                        {delta}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    {run.mode === 'full' ? (run.toolsEnabled ? 'full + tools' : 'full') : 'retrieval'}
                  </Td>
                  <Td className="font-mono text-xs">{run.model}</Td>
                  <Td>{run.totalP50Ms !== null ? `${run.totalP50Ms}ms` : '—'}</Td>
                  <Td>
                    {run.inputTokens !== null
                      ? `${run.inputTokens} in / ${run.outputTokens ?? 0} out`
                      : '—'}
                  </Td>
                  <Td className="text-muted">{run.triggeredByEmail ?? run.triggeredBy}</Td>
                  <Td className="text-muted">{relativeTime(run.startedAt)}</Td>
                  <Td>
                    <Badge tone={run.status}>{run.status}</Badge>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {data && data.total > limit ? (
        <Pagination page={page} limit={limit} total={data.total} onPageChange={onPageChange} />
      ) : null}
    </Card>
  );
}
