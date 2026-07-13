import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@joice/ui';

type Variant = 'primary' | 'inverted';
type Size = 'md' | 'lg';

const variants: Record<Variant, string> = {
  /* Brand stone gradient — mirrors @joice/ui Button's primary variant. */
  primary: cn(
    'text-white bg-gradient-to-b from-brand-500 to-brand-600',
    'hover:from-brand-400 hover:to-brand-500',
    'shadow-[0_14px_34px_-12px_rgba(90,85,75,0.5)] ring-1 ring-inset ring-white/25',
  ),
  /* Light-on-dark, for CTAs inside ink panels. */
  inverted: 'bg-canvas text-ink shadow-[0_14px_34px_-12px_rgba(0,0,0,0.5)] hover:bg-white',
};

const sizes: Record<Size, string> = {
  md: 'h-11 px-5 text-sm',
  lg: 'h-14 px-7 text-base',
};

export function CtaLink({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link
      className={cn(
        'inline-flex items-center justify-center rounded-full font-medium',
        'transition-all duration-200 outline-none',
        'focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
