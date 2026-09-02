'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@joice/ui';
import { addToCart } from '@/lib/careportals/cart.client';

/**
 * The production PDP's one solid action: put the product in the CarePortals
 * cart and land on /shop/cart (Shaun's call: navigate, no drawer; the nav's
 * cart count covers keep-browsing). The cert surface keeps its own
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
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleAdd() {
    setPending(true);
    setFailed(false);
    try {
      await addToCart(productId);
      router.push('/shop/cart');
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Button variant="solid" size="lg" disabled={pending} onClick={handleAdd}>
        {pending ? 'Adding…' : label}
      </Button>
      {failed ? (
        <p className="mono-label text-muted" role="status">
          Couldn&apos;t add to cart. Try again.
        </p>
      ) : null}
    </div>
  );
}
