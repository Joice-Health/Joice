'use client';

import type { ValidationReportView } from '@joice/api-client';
import { cn } from '@joice/ui';

/** The publish validator's verdict, exactly as the server said it. */
export function ValidationReportPanel({ report }: { report: ValidationReportView | null }) {
  if (!report) return null;
  const rows = [
    ...report.errors.map((issue) => ({ ...issue, level: 'error' as const })),
    ...report.warnings.map((issue) => ({ ...issue, level: 'warning' as const })),
  ];
  if (rows.length === 0) {
    return <p className="mono-label text-brand-700">Validates clean. Ready to publish.</p>;
  }
  return (
    <ul className="flex flex-col gap-1" aria-label="Validation report">
      {rows.map((row, i) => (
        <li key={i} className="flex items-baseline gap-2 text-sm">
          <span className={cn('mono-label shrink-0', row.level === 'error' ? 'text-danger' : 'text-muted')}>
            {row.level === 'error' ? 'blocks' : 'note'}
          </span>
          <span className="text-ink">{row.message}</span>
          <span className="mono-label truncate text-muted">{row.path}</span>
        </li>
      ))}
    </ul>
  );
}
