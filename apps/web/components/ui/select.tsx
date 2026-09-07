import type { SelectHTMLAttributes } from 'react';
import { cn } from '@joice/ui';

/**
 * The public select: the intake's state-picker pill (white on cream, the
 * @joice/ui Input language) with the admin kit's drawn chevron, since a bare
 * appearance-none select gives no affordance at all. One focus ring
 * (brand-600/50); aria-invalid draws the danger ring like every field.
 */
export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cn('relative flex w-full', className)}>
      <select
        {...props}
        className={cn(
          'h-12 w-full appearance-none rounded-full bg-surface pl-5 pr-11 text-base text-ink',
          'outline-none transition-shadow duration-200',
          'focus-visible:ring-2 focus-visible:ring-brand-600/50',
          'aria-invalid:ring-2 aria-invalid:ring-danger/50',
          'disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted',
        )}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 8 5"
        className="pointer-events-none absolute right-5 top-1/2 w-2.5 -translate-y-1/2 fill-none stroke-ink"
      >
        <path d="M1 1l3 3 3-3" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
