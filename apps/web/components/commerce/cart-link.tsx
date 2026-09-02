'use client';

import Link from 'next/link';
import { useCart } from '@/lib/careportals/use-cart';

/**
 * The nav's cart entry: a mono label reading `Cart` and, once the cart has
 * loaded client-side, `Cart (n)`. The server render and first client render
 * both say plain `Cart` (the query never runs during SSR), so there is no
 * hydration mismatch and no layout jump beyond the count characters. No badge
 * bubble: not the design language.
 */
export function CartLink() {
  const { data: cart } = useCart();
  const count = cart?.lineItems.reduce((n, item) => n + item.quantity, 0) ?? 0;

  return (
    <Link href="/shop/cart" className="mono-label text-muted transition-colors hover:text-ink">
      Cart{count > 0 ? ` (${count})` : ''}
    </Link>
  );
}
