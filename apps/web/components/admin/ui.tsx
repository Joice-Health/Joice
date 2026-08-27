'use client';

import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { Button, cn } from '@joice/ui';

/** Small shared primitives for admin tables/cards — intentionally plain. */

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-card glass p-6',
        'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_24px_60px_-24px_rgba(40,30,10,0.25)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'border-b border-ink/10 px-3 py-2 text-xs font-semibold tracking-wide text-muted uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-ink/5 px-3 py-2.5 text-ink', className)} {...props} />;
}

const badgeTones: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  invited: 'bg-sky-100 text-sky-800',
  converted: 'bg-emerald-100 text-emerald-800',
  active: 'bg-emerald-100 text-emerald-800',
  suspended: 'bg-amber-100 text-amber-800',
  deleted: 'bg-red-100 text-red-700',
  admin: 'bg-brand-400/20 text-brand-800',
  on: 'bg-emerald-100 text-emerald-800',
  off: 'bg-ink/10 text-muted',
  // Companion lead lifecycle.
  capturing: 'bg-ink/10 text-muted',
  exploring: 'bg-sky-100 text-sky-800',
  ready: 'bg-brand-400/20 text-brand-800',
  // Eval runs and their per-question outcomes.
  running: 'bg-sky-100 text-sky-800',
  completed: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-700',
  pass: 'bg-emerald-100 text-emerald-800',
  fail: 'bg-red-100 text-red-700',
};

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        badgeTones[tone] ?? 'bg-ink/10 text-muted',
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted">{children}</p>;
}

export function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <p className="py-10 text-center text-sm text-red-600" role="alert">
      {message}
    </p>
  );
}

export function Pagination({
  page,
  limit,
  total,
  onPageChange,
}: {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted">
      <span>
        {total} total · page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/** Accessible toggle switch used by the feature-flag list. */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        'focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 outline-none',
        checked ? 'bg-brand-500' : 'bg-ink/20',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5.5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
