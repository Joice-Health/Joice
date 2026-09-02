'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@joice/ui';
import { addToCart } from '@/lib/careportals/cart.client';
import { CERT_CHECKOUT } from '@/lib/cert-routes';

/**
 * The cert product page's one solid action. Creates or extends the
 * CarePortals cart, then lands on the cert checkout: this flow is
 * deliberately linear, so the cart is always one click ahead of the visitor
 * and this nav needs no badge. The real shop has its own add-to-cart
 * component; this one belongs to the certification surface.
 */
export function AddToCartButton({
  productId,
  label = 'Add to cart +',
  checkoutHref = CERT_CHECKOUT,
}: {
  productId: string;
  /** Visible label; every product page uses the default (Shaun, 2026-08-28). */
  label?: string;
  /** Where the add lands; cert pages use the default. */
  checkoutHref?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleAdd() {
    setPending(true);
    setFailed(false);
    try {
      await addToCart(productId);
      router.push(checkoutHref);
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
