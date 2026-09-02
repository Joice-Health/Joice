import Link from 'next/link';
import { BrandMark } from '@/components/ui/brand-mark';

const FOOTER_LINKS = [
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'FAQ', href: '/faq' },
  { label: 'States We Serve', href: '/states' },
];

/** The storefront footer: the permanent legal links the audit checks. */
export function ShopFooter() {
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
