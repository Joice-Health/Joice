'use client';

import { Button } from '@joice/ui';
import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';
import {
  useCart,
  useRemoveCartItem,
  useUpdateCartQuantity,
} from '@/lib/careportals/use-cart';
import { formatPrice, type CareportalsLineItem } from '@/lib/careportals/types';
import { track } from '@/lib/analytics';

/**
 * The cart page (docs/shop/01-commerce.md section 5): live lines from the
 * shared cart query, Remove on every line, a quantity stepper ONLY on
 * non-subscription lines (the server reverts subscription quantities,
 * verified live), the running total, and one solid path onward into
 * checkout. Every state keeps the page chrome so nothing jumps.
 */
export function CartView() {
  const { data: cart, isPending, isError, refetch } = useCart();
  const remove = useRemoveCartItem();
  const update = useUpdateCartQuantity();
  const busy = remove.isPending || update.isPending;
  const actionFailed = remove.isError || update.isError;

  if (isPending) {
    return (
      <Intro>
        <p className="mono-label mt-10 text-muted" role="status">
          Loading your cart…
        </p>
      </Intro>
    );
  }

  if (isError) {
    return (
      <Intro>
        <p className="mt-10 max-w-md text-lg leading-relaxed text-muted">
          We couldn&apos;t load your cart.
        </p>
        <Button className="mt-8" onClick={() => refetch()}>
          Try again +
        </Button>
      </Intro>
    );
  }

  if (!cart || cart.lineItems.length === 0) {
    return (
      <Intro>
        <p className="mt-10 max-w-md text-lg leading-relaxed text-muted">Your cart is empty.</p>
        <CtaLink href="/shop" className="mt-8">
          Browse the shop +
        </CtaLink>
      </Intro>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl pb-16">
      <Intro />

      <ul className="mt-4 border-t border-line">
        {cart.lineItems.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line py-5"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="text-lg text-ink">{item.name}</h3>
              {item.subLabel ? <p className="text-sm text-muted">{item.subLabel}</p> : null}
            </div>
            <div className="flex items-baseline gap-6">
              {item.isSubscription ? null : (
                <QuantityStepper
                  item={item}
                  busy={busy}
                  onChange={(quantity) =>
                    update.mutate({ itemId: item.id, productId: item.productId, quantity })
                  }
                />
              )}
              <span className="font-mono text-sm text-ink">
                {formatPrice(item.price * item.quantity)}
                {item.isSubscription ? <span className="text-xs text-muted">/mo</span> : null}
              </span>
              <button
                type="button"
                className="mono-label text-muted transition-colors hover:text-ink disabled:opacity-50"
                disabled={busy}
                onClick={() =>
                  remove.mutate(
                    { itemId: item.id },
                    { onSuccess: () => track({ event: 'cart_item_removed' }) },
                  )
                }
              >
                {remove.isPending && remove.variables?.itemId === item.id
                  ? 'Removing…'
                  : 'Remove'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {cart.discountAmount > 0 ? (
        <div className="flex items-baseline justify-between border-b border-line py-4">
          <span className="mono-label text-muted">Discount</span>
          <span className="font-mono text-sm text-muted">
            -{formatPrice(cart.discountAmount)}
          </span>
        </div>
      ) : null}

      <div className="flex items-baseline justify-between border-b border-line py-5">
        <span className="mono-label text-ink">Total</span>
        <span className="font-mono text-lg text-ink">{formatPrice(cart.totalAmount)}</span>
      </div>

      <div className="mt-10 flex flex-col items-center gap-4 text-center">
        <CtaLink href="/shop/checkout" variant="solid" size="lg">
          Continue to checkout +
        </CtaLink>
        <p className="mono-label text-muted">Secure checkout on joicehealth.com</p>
        {actionFailed ? (
          <p className="mono-label text-muted" role="status">
            Something didn&apos;t go through. Try again.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The stepper for one-time products: minus, the count, plus. Minus at one is
 * disabled; Remove is the way out of the last unit, so quantity never lies.
 */
function QuantityStepper({
  item,
  busy,
  onChange,
}: {
  item: CareportalsLineItem;
  busy: boolean;
  onChange: (quantity: number) => void;
}) {
  return (
    <span className="flex items-baseline gap-3">
      <button
        type="button"
        aria-label={`One fewer ${item.name}`}
        className="mono-label text-muted transition-colors hover:text-ink disabled:opacity-40"
        disabled={busy || item.quantity <= 1}
        onClick={() => onChange(item.quantity - 1)}
      >
        −
      </button>
      <span className="font-mono text-sm text-ink" aria-live="polite">
        {item.quantity}
      </span>
      <button
        type="button"
        aria-label={`One more ${item.name}`}
        className="mono-label text-muted transition-colors hover:text-ink disabled:opacity-40"
        disabled={busy}
        onClick={() => onChange(item.quantity + 1)}
      >
        +
      </button>
    </span>
  );
}

/** The page opener, shared by every state so the chrome never jumps. */
function Intro({ children }: { children?: React.ReactNode }) {
  return (
    <section className="flex flex-col items-center py-16 text-center animate-fade-up sm:py-20">
      <Eyebrow as="p">Cart</Eyebrow>
      <h1 className="display mt-6 text-balance text-5xl text-ink sm:text-7xl">Your order</h1>
      {children}
    </section>
  );
}
