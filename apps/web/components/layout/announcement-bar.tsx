import Link from 'next/link';

/**
 * The one olive stripe. A single line of mono at the very top that hands new
 * visitors to the education hub. Full-bleed: sits above the site container.
 */
export function AnnouncementBar({
  href = '/learn/peptides-101',
  children = 'What is a peptide? Learn +',
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative z-20 bg-brand-600 text-white">
      <Link
        href={href}
        className="mono-label flex h-9 items-center justify-center px-4 text-center text-white outline-none transition-colors hover:bg-brand-700 focus-visible:bg-brand-700"
      >
        {children}
      </Link>
    </div>
  );
}
