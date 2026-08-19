import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Field: white pill on the cream, framed by a solid hairline. Solid, not
 * dotted, dotted outlines mean "press me", solid ones mean "type here".
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-12 w-full rounded-full border border-line bg-surface px-5 text-base text-ink',
        'placeholder:text-muted outline-none transition-colors duration-200',
        'focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-brand-600/40',
        'aria-invalid:border-red-700',
        'disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted',
        className,
      )}
      {...props}
    />
  );
});
