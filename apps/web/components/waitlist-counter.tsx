'use client';

import { useWaitlistStats } from '@joice/api-client';

/** Social-proof line: how many people are already in line. */
export function WaitlistCounter() {
  const { data } = useWaitlistStats();
  if (!data || data.totalCount < 1) return null;

  return (
    <span className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-2 text-sm text-muted shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
      </span>
      <span>
        <span className="font-semibold text-ink tabular-nums">
          {data.totalCount.toLocaleString()}
        </span>{' '}
        {data.totalCount === 1 ? 'person' : 'people'} already in line
      </span>
    </span>
  );
}
