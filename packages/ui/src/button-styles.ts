import { cn } from './cn';

export type ButtonVariant = 'outline' | 'solid' | 'stone' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * The house button is a dotted-outline pill with a mono uppercase label:
 * `LET'S BEGIN +`. The outline is drawn in currentColor, so the same variant
 * works in ink on cream and in white on a photo or the dark panel.
 */
const variants: Record<ButtonVariant, string> = {
  /* Default action. Dotted hairline, transparent, becomes solid on hover. */
  outline: cn(
    'border border-dotted border-current text-current bg-transparent',
    'hover:border-solid active:bg-current/[0.06]',
    'disabled:border-stone disabled:text-stone',
  ),
  /* The one strong action on a page (a form submit). Ink on cream. */
  solid: cn(
    'border border-solid border-ink bg-ink text-canvas',
    'hover:bg-brand-900 hover:border-brand-900 active:bg-ink',
    'disabled:bg-stone disabled:border-stone disabled:text-canvas',
  ),
  /* Filled stone pill, [ 02 ] on the palette card. Quiet, secondary. */
  stone: cn(
    'border border-solid border-stone bg-stone text-ink',
    'hover:bg-line active:bg-stone',
    'disabled:opacity-60',
  ),
  /* Text only. */
  ghost: 'border border-solid border-transparent text-current hover:border-dotted hover:border-current disabled:text-stone',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3.5 text-[10px]',
  md: 'h-10 px-4 text-[11px]',
  lg: 'h-12 px-6 text-xs',
};

export function buttonClasses({
  variant = 'outline',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-full whitespace-nowrap',
    'font-mono uppercase tracking-mono leading-none',
    'transition-[background-color,border-color,border-style,color] duration-200 outline-none',
    'focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    'disabled:cursor-not-allowed',
    variants[variant],
    sizes[size],
    className,
  );
}
