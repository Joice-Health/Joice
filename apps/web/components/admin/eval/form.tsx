'use client';

import type { ReactNode } from 'react';

/**
 * Tiny form helpers for the eval console, matching the brain settings page's
 * local idioms (that page keeps its own copies; a wider refactor to share
 * them is not this feature's job).
 */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const selectClass =
  'glass h-11 rounded-card px-4 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-300/50';

export const textareaClass =
  'glass w-full rounded-card px-4 py-3 text-sm text-ink outline-none placeholder:text-muted/60 focus-visible:ring-2 focus-visible:ring-brand-300/50';

/** ISO timestamp to a short relative phrase for run lists. */
export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
