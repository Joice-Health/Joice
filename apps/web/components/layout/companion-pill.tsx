'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { buttonClasses } from '@joice/ui';

/**
 * Floating "Companion" entry point, shared by all main-site pages. Opens the
 * companion at /ask, where the pre-onboarding capture + knowledge chat live.
 * Hidden on /ask itself, a pill linking to the page you're on would sit over
 * the composer's Ask button on a phone.
 */
export function CompanionPill() {
  const pathname = usePathname();
  if (pathname === '/ask') return null;

  return (
    <Link
      href="/ask"
      className={buttonClasses({
        variant: 'outline',
        size: 'md',
        className: 'fixed bottom-5 right-5 z-30 bg-canvas text-ink',
      })}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-600 opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-600" />
      </span>
      Ask Joice +
    </Link>
  );
}
