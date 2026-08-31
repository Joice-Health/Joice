'use client';

import { useState } from 'react';
import { useEvalRuns } from '@joice/api-client';
import { ErrorState, PageHeader } from '@/components/admin/ui';
import { NewRunPanel } from '@/components/admin/eval/new-run-panel';
import { RunsTable } from '@/components/admin/eval/runs-table';
import { CasesSection } from '@/components/admin/eval/cases-section';

const PAGE_SIZE = 20;

/**
 * The eval console: run the benchmark question set against the live pipeline,
 * watch it grade, keep the history, and manage the questions. The gate for
 * tool mode and the instrument for tuning; docs/rag/12-eval-console.md.
 */
export default function AdminEvalPage() {
  const [page, setPage] = useState(1);
  const runs = useEvalRuns({ page, limit: PAGE_SIZE });

  const hasActiveRun = (runs.data?.items ?? []).some((r) => r.status === 'running');

  return (
    <>
      <PageHeader eyebrow="Brain" title="Eval console" />
      {runs.isError ? <ErrorState error={runs.error} /> : null}
      <NewRunPanel hasActiveRun={hasActiveRun} />
      <RunsTable data={runs.data} page={page} limit={PAGE_SIZE} onPageChange={setPage} />
      <CasesSection />
    </>
  );
}
