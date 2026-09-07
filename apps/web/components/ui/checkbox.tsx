import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@joice/ui';

/**
 * The public checkbox row: the intake's consent pattern (a real checkbox,
 * accent-ink, inside a clickable label) promoted to a shared piece so
 * checkout consent lines read like the rest of the site.
 */
export function CheckboxRow({
  label,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-3', className)}>
      <input type="checkbox" {...props} className="size-5 shrink-0 accent-ink" />
      <span className="text-pretty leading-relaxed text-muted">{label}</span>
    </label>
  );
}
