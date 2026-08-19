import Link from 'next/link';
import { BrandMark } from '@/components/ui/brand-mark';

const FOOTER_LINKS = [
  { label: 'Provider disclosure', href: '/legal/provider-disclosure' },
  { label: 'States', href: '/legal/states' },
  { label: 'HSA/FSA', href: '/hsa-fsa' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
  { label: 'Legal', href: '/legal' },
  { label: 'Clinical team', href: '/clinical-team' },
];

/** Quiet compliance footer shared by all main-site pages. */
export function SiteFooter() {
  return (
    <footer className="mt-8 border-t border-line py-8">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <BrandMark className="text-lg" />
        <nav
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
          aria-label="Footer"
        >
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="mono-label text-muted transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
