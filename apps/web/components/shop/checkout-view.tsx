'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@joice/ui';
import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';
import { fetchCart, getCheckoutUrl, removeItem } from '@/lib/careportals/cart.client';
import { formatPrice, type CareportalsCart } from '@/lib/careportals/types';
import { CERT_SHOP } from '@/lib/cert-routes';

/**
 * The checkout page: the live CarePortals cart plus the hand-off. Payment,
 * patient sign-in and prescription requirements all happen on the hosted
 * checkout at care.joicehealth.com; this view only shows what is in the cart
 * and sends the visitor there. Lines offer Remove, never a quantity stepper:
 * CarePortals pins subscription quantities to 1 server-side (verified live),
 * and every product we sell is a subscription. Each mutation re-renders from
 * the returned cart, the most recent response being the source of truth.
 *
 * localStorage (the cart id) is only touched after mount, so the server render
 * and first client render match (the waitlist-experience hydration rule).
 */
type ViewState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; cart: CareportalsCart };

export function CheckoutView() {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [actionFailed, setActionFailed] = useState(false);
  const [handingOff, setHandingOff] = useState(false);

  const load = useCallback(() => {
    setState({ kind: 'loading' });
    fetchCart()
      .then((cart) =>
        setState(
          cart
            ? { kind: 'ready', cart }
            : { kind: 'ready', cart: emptyCart() },
        ),
      )
      .catch(() => setState({ kind: 'error' }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRemove(itemId: string) {
    setBusyItemId(itemId);
    setActionFailed(false);
    try {
      const cart = await removeItem(itemId);
      setState({ kind: 'ready', cart });
    } catch {
      setActionFailed(true);
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleHandoff() {
    setHandingOff(true);
    setActionFailed(false);
    const url = await getCheckoutUrl();
    if (url) {
      window.location.assign(url);
      return;
    }
    setActionFailed(true);
    setHandingOff(false);
  }

  if (state.kind === 'loading') {
    return (
      <Intro>
        <p className="mono-label mt-10 text-muted" role="status">
          Loading your cart…
        </p>
      </Intro>
    );
  }

  if (state.kind === 'error') {
    return (
      <Intro>
        <p className="mt-10 max-w-md text-lg leading-relaxed text-muted">
          We couldn&apos;t load your cart.
        </p>
        <Button className="mt-8" onClick={load}>
          Try again +
        </Button>
      </Intro>
    );
  }

  const { cart } = state;

  if (cart.lineItems.length === 0) {
    return (
      <Intro>
        <p className="mt-10 max-w-md text-lg leading-relaxed text-muted">
          Your cart is empty.
        </p>
        <CtaLink href={CERT_SHOP} className="mt-8">
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
              <span className="font-mono text-sm text-ink">
                {formatPrice(item.price)}
                {item.isSubscription ? <span className="text-xs text-muted">/mo</span> : null}
              </span>
              <button
                type="button"
                className="mono-label text-muted transition-colors hover:text-ink disabled:opacity-50"
                disabled={busyItemId !== null}
                onClick={() => handleRemove(item.id)}
              >
                {busyItemId === item.id ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between border-b border-line py-5">
        <span className="mono-label text-ink">Total</span>
        <span className="font-mono text-lg text-ink">{formatPrice(cart.totalAmount)}</span>
      </div>

      <div className="mt-10 flex flex-col items-center gap-4 text-center">
        <Button variant="solid" size="lg" disabled={handingOff} onClick={handleHandoff}>
          {handingOff ? 'One moment…' : 'Continue to secure checkout +'}
        </Button>
        <p className="mono-label text-muted">
          Payment completes on our secure care portal
        </p>
        {actionFailed ? (
          <p className="mono-label text-muted" role="status">
            Something didn&apos;t go through. Try again.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** The page opener, shared by every state so the chrome never jumps. */
function Intro({ children }: { children?: React.ReactNode }) {
  return (
    <section className="flex flex-col items-center py-16 text-center animate-fade-up sm:py-20">
      <Eyebrow as="p">Checkout</Eyebrow>
      <h1 className="display mt-6 text-balance text-5xl text-ink sm:text-7xl">Your order</h1>
      {children}
    </section>
  );
}

function emptyCart(): CareportalsCart {
  return {
    _id: '',
    lineItems: [],
    baseAmount: 0,
    subTotalAmount: 0,
    discountAmount: 0,
    totalAmount: 0,
  };
}
