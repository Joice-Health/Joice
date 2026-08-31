'use client';

import Link from 'next/link';
import { useEvalRuns } from '@joice/api-client';
import { relativeTime } from './form';

/**
 * The gate breadcrumb on the brain settings page: the latest completed eval
 * score, next to the switches it is supposed to gate. Renders nothing until
 * a run has completed.
 */
export function LastEvalLine() {
  const runs = useEvalRuns({ page: 1, limit: 10 });
  const last = runs.data?.items.find((r) => r.status === 'completed' && r.passedCases !== null);
  if (!last) return null;

  return (
    <p className="text-xs text-muted">
      Last eval{' '}
      <Link href={`/admin/eval/${last.id}`} className="text-ink hover:underline">
        {last.passedCases}/{last.totalCases}
      </Link>{' '}
      ({last.mode === 'full' ? (last.toolsEnabled ? 'full + tools' : 'full') : 'retrieval'},{' '}
      {relativeTime(last.startedAt)}).{' '}
      <Link href="/admin/eval" className="hover:underline">
        Run it again
      </Link>{' '}
      before flipping switches here.
    </p>
  );
}
