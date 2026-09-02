import type { ReactNode } from 'react';
import { cn } from '@joice/ui';

/**
 * The public form field: mono label above the control, one quiet help line,
 * one error line in the danger token (the admin kit's Field shape, dressed
 * for the cream page). Wrapping in a label keeps click-to-focus without id
 * plumbing; the error carries role="alert" so it is announced when it
 * appears. The control itself should set aria-invalid when error is present
 * (the @joice/ui Input draws its ring from it).
 */
export function Field({
  label,
  optional = false,
  help,
  error,
  className,
  children,
}: {
  label: string;
  /** Marks the field optional the intake way: a quiet mono suffix. */
  optional?: boolean;
  help?: string;
  error?: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn('flex w-full flex-col gap-2', className)}>
      <span className="mono-label text-ink">
        {label}
        {optional ? <span className="ml-3 align-middle text-muted">(optional)</span> : null}
      </span>
      {children}
      {help && !error ? <span className="text-sm text-muted">{help}</span> : null}
      {error ? (
        <span className="text-sm text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
