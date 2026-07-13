import { cn } from '@joice/ui';

/** Mono uppercase section label — the house eyebrow style. */
export function Eyebrow({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-brand-700',
        className,
      )}
    >
      {children}
    </span>
  );
}
