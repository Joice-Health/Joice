'use client';

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { Input, cn } from '@joice/ui';

/**
 * The one admin field kit. Panels are solid white, so controls are cream
 * pills (the inverse of the public site, same language), all sharing the one
 * focus ring: brand-600/50.
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
      <span className="mono-label text-ink">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

const selectSizes = {
  md: 'h-10 pl-4 pr-9 text-sm',
  sm: 'h-8 pl-3 pr-8 text-xs',
} as const;

export function AdminSelect({
  size = 'md',
  className,
  children,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  size?: keyof typeof selectSizes;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex', className)}>
      <select
        {...props}
        className={cn(
          'w-full appearance-none rounded-full bg-canvas text-ink outline-none',
          'focus-visible:ring-2 focus-visible:ring-brand-600/50',
          'disabled:cursor-not-allowed disabled:text-muted',
          selectSizes[size],
        )}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 8 5"
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 fill-none stroke-ink',
          size === 'sm' ? 'right-3 w-2' : 'right-3.5 w-2.5',
        )}
      >
        <path d="M1 1l3 3 3-3" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function AdminTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'w-full rounded-xl bg-canvas px-4 py-3 text-sm text-ink outline-none',
        'placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand-600/50',
        className,
      )}
    />
  );
}

/** The house Input, sized for admin filter rows: a cream pill on the white panel. */
export function SearchInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} className={cn('h-10 bg-canvas text-sm', className)} />;
}
