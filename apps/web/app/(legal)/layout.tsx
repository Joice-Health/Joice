import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/ui/brand-mark';

/**
 * Quiet chrome for the permanent legal pages (/terms, /privacy, /faq). These
 * outlive the certification storefront and ignore its flag, so they carry
 * neither the shop chrome nor the gated site's nav; at launch they move under
 * the main-site shell. The wordmark links to /home, the public front door.
 * Noindexed while the site is pre-launch.
 */
export const metadata = { robots: { index: false, follow: false } };

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 sm:px-6">
      <header className="flex justify-center py-8">
        <Link href="/home" aria-label="Joice home">
          <BrandMark />
        </Link>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="mt-8 flex justify-center border-t border-line py-8">
        <BrandMark className="text-lg" />
      </footer>
    </div>
  );
}
