import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * The house bracket: `[ you ]`. Brackets mark a variable inside the system , 
 * the person ([ you ]), a place in a sequence ([ 01 ]), an action ([ sign-up ]).
 * Rendered as real characters so it reads, copies and speaks as text.
 * Case is inherited: inside an uppercase label, `[ you ]` stays lowercase
 * because the parent applies `normal-case` where it wants the human voice.
 */
export function Bracket({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('whitespace-nowrap', className)}>
      {'[ '}
      {children}
      {' ]'}
    </span>
  );
}

/** `[ 01 ]`, a position in a real sequence. Zero-padded, tabular. */
export function Index({ n, className }: { n: number; className?: string }) {
  return <Bracket className={cn('tabular-nums', className)}>{String(n).padStart(2, '0')}</Bracket>;
}
