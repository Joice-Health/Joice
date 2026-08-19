'use client';

import { useWaitlistStats } from '@joice/api-client';

/** Social-proof line: how many people are already in line. */
export function WaitlistCounter() {
  const { data } = useWaitlistStats();
  if (!data || data.totalCount < 1) return null;

  return (
    <span className="mono-label inline-flex items-center gap-2 text-muted">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-600 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
      </span>
      <span>
        <span className="tabular-nums text-ink">
          {data.totalCount.toLocaleString()}
        </span>{' '}
        {data.totalCount === 1 ? 'person' : 'people'} already in line
      </span>
    </span>
  );
}
