import { cn } from '@joice/ui';

/** The wordmark: `Joice`, set in the mono. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('font-mono text-[1.625rem] leading-none tracking-mono text-ink', className)}>
      Joice
    </span>
  );
}
