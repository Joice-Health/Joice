import Link from 'next/link';

const FOOTER_LINKS = [
  { label: 'Provider disclosure', href: '/legal/provider-disclosure' },
  { label: 'States', href: '/legal/states' },
  { label: 'HSA/FSA', href: '/hsa-fsa' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
  { label: 'Legal', href: '/legal' },
  { label: 'Clinical Team', href: '/clinical-team' },
];

/** Quiet compliance footer shared by all main-site pages. */
export function SiteFooter() {
  return (
    <footer className="mt-4 px-2 py-6">
      <nav
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2"
        aria-label="Footer"
      >
        {FOOTER_LINKS.map((link, i) => (
          <span key={link.href} className="flex items-center gap-3">
            <Link
              href={link.href}
              className="font-mono text-[11px] uppercase tracking-wider text-muted transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
            {i < FOOTER_LINKS.length - 1 ? <span className="text-line">·</span> : null}
          </span>
        ))}
      </nav>
    </footer>
  );
}
