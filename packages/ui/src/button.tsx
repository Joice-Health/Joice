import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'glass' | 'glassBrand' | 'ghost';
type Size = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  // Solid focal action — green gradient with a soft colored glow + lit top edge.
  primary: cn(
    'text-white bg-gradient-to-b from-brand-500 to-brand-600',
    'shadow-[0_14px_34px_-12px_rgba(20,120,90,0.55)] ring-1 ring-inset ring-white/25',
    'hover:from-brand-400 hover:to-brand-500 active:from-brand-600 active:to-brand-700',
    'disabled:from-brand-300 disabled:to-brand-300 disabled:shadow-none',
  ),
  // Clear frosted glass.
  glass: cn(
    'text-ink glass',
    'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_10px_28px_-14px_rgba(31,38,32,0.3)]',
    'hover:bg-white/75 active:bg-white/85 disabled:opacity-50',
  ),
  // Brand-tinted frosted glass.
  glassBrand: cn(
    'text-brand-800 bg-brand-400/15 backdrop-blur-xl',
    'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5),0_10px_28px_-14px_rgba(20,120,90,0.4)]',
    'hover:bg-brand-400/25 active:bg-brand-400/30 disabled:opacity-50',
  ),
  ghost: 'text-ink hover:bg-white/45 hover:backdrop-blur-md disabled:opacity-50',
};

const sizes: Record<Size, string> = {
  md: 'h-11 px-5 text-sm',
  lg: 'h-14 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-medium',
        'transition-all duration-200 outline-none',
        'focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
