'use client';

import { useWaitlistStats } from '@joice/api-client';

/** Social-proof line: how many people are already in line. */
export function WaitlistCounter() {
  const { data } = useWaitlistStats();
  if (!data || data.totalCount < 1) return null;

  return (
    <p className="text-sm text-muted">
      <span className="font-semibold text-ink tabular-nums">
        {data.totalCount.toLocaleString()}
      </span>{' '}
      {data.totalCount === 1 ? 'person is' : 'people are'} already in line
    </p>
  );
}
