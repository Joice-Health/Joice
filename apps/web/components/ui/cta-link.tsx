import Link from 'next/link';
import type { ComponentProps } from 'react';
import { buttonClasses, type ButtonSize, type ButtonVariant } from '@joice/ui';

/**
 * A link dressed as the house button (dotted pill, mono label). Same classes
 * as `@joice/ui` Button so a link and a button beside each other match.
 * Convention: forward actions end in ` +`, `LET'S BEGIN +`, `LEARN +`.
 */
export function CtaLink({
  variant = 'outline',
  size = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClasses({ variant, size, className })} {...props} />;
}
