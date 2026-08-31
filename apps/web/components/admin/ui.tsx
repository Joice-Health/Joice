'use client';

import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import Link from 'next/link';
import { Button, cn } from '@joice/ui';

/**
 * Shared admin primitives. The admin builds on solid white panels with visible
 * hairlines; hierarchy comes from the display and mono faces (weight classes
 * are inert: only Light font cuts ship and html has font-synthesis: none).
 */

export type Crumb = { href: string; label: string };

export function PageHeader({
  eyebrow,
  title,
  description,
  breadcrumbs,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  children?: ReactNode;
}) {
  return (
    <div className="mb-8 border-b border-line pb-6">
      {breadcrumbs?.length ? (
        <nav aria-label="Breadcrumb" className="mono-label mb-3 flex items-center gap-2 text-muted">
          {breadcrumbs.map((crumb) => (
            <span key={crumb.href} className="flex items-center gap-2">
              <Link href={crumb.href} className="transition-colors hover:text-ink">
                {crumb.label}
              </Link>
              <span aria-hidden className="text-line">
                /
              </span>
            </span>
          ))}
          <span className="text-ink">{title}</span>
        </nav>
      ) : eyebrow ? (
        <p className="mono-label mb-2 text-muted">{eyebrow}</p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-3xl text-ink">{title}</h1>
        {children ? <div className="flex items-center gap-2">{children}</div> : null}
      </div>
      {description ? <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p> : null}
    </div>
  );
}

/** Solid white surface; the white on the cream is the edge, so no frame or shadow. */
export function Panel({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className={cn('panel rounded-2xl p-6', className)}>
      {children}
    </div>
  );
}

export function PanelHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <h2 className={cn('mono-label mb-4 text-ink', className)}>{children}</h2>;
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
      className={cn('mono-label border-b border-line px-3 py-2 whitespace-nowrap text-ink', className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-line/60 px-3 py-2.5 text-ink', className)} {...props} />;
}

/**
 * Status labels built from the system: brand tints for good news, a dotted
 * olive outline for things in motion (echoing the button language), ink for
 * neutral, the one red for bad news.
 */
const badgeTones: Record<string, string> = {
  // Positive: settled, good.
  converted: 'bg-brand-100 text-brand-800',
  active: 'bg-brand-100 text-brand-800',
  completed: 'bg-brand-100 text-brand-800',
  pass: 'bg-brand-100 text-brand-800',
  on: 'bg-brand-100 text-brand-800',
  admin: 'bg-brand-100 text-brand-800',
  ready: 'bg-brand-100 text-brand-800',
  // In motion: pending an outcome.
  pending: 'border border-dotted border-brand-700 text-brand-700',
  invited: 'border border-dotted border-brand-700 text-brand-700',
  exploring: 'border border-dotted border-brand-700 text-brand-700',
  running: 'border border-dotted border-brand-700 text-brand-700',
  // Neutral: off or dormant.
  off: 'bg-ink/8 text-ink',
  capturing: 'bg-ink/8 text-ink',
  suspended: 'bg-ink/8 text-ink',
  // Danger.
  deleted: 'bg-danger/10 text-danger',
  failed: 'bg-danger/10 text-danger',
  fail: 'bg-danger/10 text-danger',
};

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[10px] leading-none tracking-mono uppercase',
        badgeTones[tone] ?? 'bg-ink/8 text-ink',
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <p className="text-sm text-muted">{children}</p>
      {action}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <p className="py-10 text-center text-sm text-danger" role="alert">
      {message}
    </p>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn('block animate-pulse rounded-full bg-ink/8', className)} />;
}

/** Placeholder rows in the shape of the table; render inside the real tbody. */
export function TableSkeleton({ rows = 5, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row}>
          {Array.from({ length: cols }, (_, col) => (
            <Td key={col}>
              <Skeleton className={cn('h-3', col === 0 ? 'w-32' : 'w-16')} />
            </Td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Loading stand-in for detail pages and forms. */
export function PanelSkeleton() {
  return (
    <Panel>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-3 w-64" />
      <Skeleton className="mt-3 h-3 w-48" />
    </Panel>
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
    <div className="mt-4 flex items-center justify-between">
      <span className="mono-label text-muted">
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
        'outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50 focus-visible:ring-offset-2',
        checked ? 'bg-brand-600' : 'bg-stone',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-surface transition-transform',
          checked ? 'translate-x-5.5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
