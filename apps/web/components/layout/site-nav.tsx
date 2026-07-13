import Link from 'next/link';
import { BrandMark } from '@/components/ui/brand-mark';
import { CtaLink } from '@/components/ui/cta-link';

const NAV_LINKS = [
  { label: 'Explore', href: '/explore' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Learn', href: '/learn' },
  { label: 'Our Story', href: '/story' },
];

/** Sticky glass nav shared by all main-site pages. */
export function SiteNav() {
  return (
    <header className="glass sticky top-4 z-20 flex items-center justify-between rounded-full px-5 py-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_10px_28px_-14px_rgba(31,38,32,0.25)]">
      <Link href="/" aria-label="Joice home">
        <BrandMark />
      </Link>

      <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-sm font-medium text-ink/80 transition-colors hover:text-ink"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <CtaLink href="/get-started">Get Started</CtaLink>
    </header>
  );
}
