import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Field: a white pill on the cream, no frame; the white is the edge. Focus
 * draws an olive ring, an invalid value a red one. Dotted outlines mean
 * "press me"; a plain white pill means "type here".
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-12 w-full rounded-full bg-surface px-5 text-base text-ink',
        'placeholder:text-muted outline-none transition-shadow duration-200',
        'focus-visible:ring-2 focus-visible:ring-brand-600/50',
        'aria-invalid:ring-2 aria-invalid:ring-red-700/50',
        'disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted',
        className,
      )}
      {...props}
    />
  );
});
