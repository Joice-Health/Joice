'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@joice/ui';
import { useAddToCart } from '@/lib/careportals/use-cart';
import { track } from '@/lib/analytics';

/**
 * The production PDP's one solid action: put the product in the CarePortals
 * cart and land on /shop/cart (Shaun's call: navigate, no drawer; the nav's
 * cart count covers keep-browsing). Mutating through the shared cart hook
 * keeps that count fresh even mid-navigation. The cert surface keeps its own
 * add-to-cart component; this one belongs to the real shop.
 */
export function AddToCartButton({
  productId,
  label = 'Add to cart +',
}: {
  productId: string;
  label?: string;
}) {
  const router = useRouter();
  const add = useAddToCart();
  const [navigating, setNavigating] = useState(false);

  async function handleAdd() {
    try {
      await add.mutateAsync({ productId });
      track({ event: 'cart_item_added' });
      setNavigating(true);
      router.push('/shop/cart');
    } catch {
      // add.isError renders the quiet retry line.
    }
  }

  const pending = add.isPending || navigating;

  return (
    <div className="flex flex-col items-start gap-3">
      <Button variant="solid" size="lg" disabled={pending} onClick={handleAdd}>
        {pending ? 'Adding…' : label}
      </Button>
      {add.isError ? (
        <p className="mono-label text-muted" role="status">
          Couldn&apos;t add to cart. Try again.
        </p>
      ) : null}
    </div>
  );
}
