import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-14 w-full rounded-full px-5 text-base text-ink glass',
        'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65),0_10px_28px_-16px_rgba(31,38,32,0.3)]',
        'placeholder:text-muted/60 outline-none transition-all duration-200',
        'focus-visible:border-brand-300 focus-visible:bg-white/80 focus-visible:ring-2 focus-visible:ring-brand-300/50',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
});
