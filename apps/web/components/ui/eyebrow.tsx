import { cn } from '@joice/ui';

/**
 * Mono uppercase label, the house eyebrow. Ink by default; pass `text-muted`
 * for a secondary one. Brackets inside it (`<Bracket>you</Bracket>`) keep
 * their own case if you wrap them in `normal-case`.
 */
export function Eyebrow({
  className,
  children,
  as: Tag = 'span',
}: {
  className?: string;
  children: React.ReactNode;
  as?: 'span' | 'h2' | 'h3' | 'p';
}) {
  return <Tag className={cn('mono-label block text-ink', className)}>{children}</Tag>;
}
