import type { ReactNode } from 'react';
import { ShopNav } from '@/components/shop/shop-nav';
import { ShopFooter } from '@/components/shop/shop-footer';

/**
 * Shell for the permanent legal pages (/terms, /privacy, /faq): the same
 * chrome as the storefront so the audit surface reads as one site, but its
 * own group because these pages ignore the `shop` flag and outlive the
 * certification storefront. Noindexed while the site is pre-launch.
 */
export const metadata = { robots: { index: false, follow: false } };

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ShopNav />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 sm:px-6">
        <main className="flex flex-1 flex-col">{children}</main>
        <ShopFooter />
      </div>
    </>
  );
}
