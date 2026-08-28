import type { ReactNode } from 'react';
import { ShopNav } from '@/components/shop/shop-nav';
import { ShopFooter } from '@/components/shop/shop-footer';

/**
 * Shell for the public certification storefront (docs/shop/00-plan.md): the
 * (site) shell minus everything that leads into the gated site (announcement
 * bar, companion pill, the nav's link list). Noindexed while pre-launch;
 * auditors get URLs directly. Pages gate themselves with requireShopEnabled().
 */
export const metadata = { robots: { index: false, follow: false } };

export default function ShopLayout({ children }: { children: ReactNode }) {
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
