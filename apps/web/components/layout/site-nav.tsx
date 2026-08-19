import Link from 'next/link';
import { Bracket } from '@joice/ui';
import { BrandMark } from '@/components/ui/brand-mark';

const NAV_LINKS = [
  { label: 'Explore', href: '/explore' },
  { label: 'Ask Joice', href: '/ask' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Learn', href: '/learn' },
  { label: 'Our story', href: '/story' },
];

/**
 * Editorial nav: links left, the wordmark dead centre, one bracketed action
 * right. Sticky on the cream with a hairline underneath, no panel.
 */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-20 grid grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-canvas py-5">
      <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="mono-label text-muted transition-colors hover:text-ink"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <span aria-hidden className="md:hidden" />

      <Link href="/" aria-label="Joice home" className="justify-self-center">
        <BrandMark />
      </Link>

      <Link
        href="/get-started"
        className="mono-label justify-self-end text-ink transition-colors hover:text-brand-700"
      >
        <Bracket>Get started</Bracket>
      </Link>
    </header>
  );
}
