'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@joice/ui';
import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';
import { buttonClasses } from '@joice/ui';
import { getPaymentStatus } from '@/lib/careportals/checkout.client';
import { patientSession } from '@/lib/careportals/patient.client';
import { useClearCartAfterOrder } from '@/lib/careportals/use-cart';
import type { CareportalsOrder } from '@/lib/careportals/types';
import { checkExistingPayment } from './checkout-machine';

/** The hosted portal where the medical intake completes the prescription. */
const PORTAL_URL = 'https://care.joicehealth.com';

/**
 * The confirmation page, doubling as the 3DS returnUrl: it reads the cart id
 * from the query, polls the payment with the sessionStorage JWT, and on
 * success shows the orders and the one thing that matters next, the medical
 * intake on the care portal. Success is also where checkout state is cleaned
 * up (cart id, cart cache, patient JWT); the orders live on in component
 * state so the render survives the cleanup. A later revisit with no token
 * lands on the portal fallback, never an error.
 */
type ViewState =
  | { kind: 'checking' }
  | { kind: 'confirmed'; orders: CareportalsOrder[] }
  | { kind: 'processing' }
  | { kind: 'failed' }
  | { kind: 'fallback' };

export function ConfirmationView() {
  const searchParams = useSearchParams();
  const cartId = searchParams.get('cart');
  const clearCart = useClearCartAfterOrder();
  const [state, setState] = useState<ViewState>({ kind: 'checking' });
  const cleaned = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const token = patientSession.get();
    if (!cartId || !token) {
      setState({ kind: 'fallback' });
      return;
    }
    void checkExistingPayment({
      getPaymentStatus: () => getPaymentStatus(cartId, token),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    }).then((result) => {
      if (cancelled) return;
      if (result.kind === 'succeeded') {
        setState({ kind: 'confirmed', orders: result.orders });
        if (!cleaned.current) {
          cleaned.current = true;
          clearCart();
          patientSession.clear();
        }
        return;
      }
      if (result.kind === 'processing' || result.kind === 'unknown') {
        setState({ kind: 'processing' });
        return;
      }
      if (result.kind === 'none') {
        setState({ kind: 'failed' });
        return;
      }
      setState({ kind: 'fallback' });
    });
    return () => {
      cancelled = true;
    };
  }, [cartId]);

  if (state.kind === 'checking') {
    return (
      <Intro eyebrow="Checkout">
        <p className="mono-label mt-10 text-muted" role="status">
          Confirming your payment…
        </p>
      </Intro>
    );
  }

  if (state.kind === 'confirmed') {
    return (
      <Intro eyebrow="Order confirmed" title="Thank you.">
        <div className="mx-auto mt-10 w-full max-w-xl text-left">
          <ul className="border-t border-line">
            {state.orders.map((order) => (
              <li
                key={order._id}
                className="flex items-baseline justify-between gap-6 border-b border-line py-4"
              >
                <span className="text-base text-ink">
                  Order{order.id ? ` #${order.id}` : ''}
                </span>
                <span className="mono-label text-muted">{prettyStatus(order.status)}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mx-auto mt-10 max-w-md text-pretty text-lg leading-relaxed text-muted">
          Your order is paid. A short medical intake with our care team finishes your
          prescription; a licensed physician reviews it before anything ships.
        </p>
        <a href={PORTAL_URL} className={buttonClasses({ variant: 'solid', size: 'lg' })}>
          Complete your medical intake +
        </a>
        <CtaLink href="/shop" variant="ghost" className="mt-4">
          Back to the shop
        </CtaLink>
      </Intro>
    );
  }

  if (state.kind === 'processing') {
    return (
      <Intro eyebrow="Checkout">
        <p className="mx-auto mt-10 max-w-md text-pretty text-lg leading-relaxed text-muted">
          Your payment is still processing. Do not pay again; check back in a moment.
        </p>
        <Button className="mt-8" onClick={() => window.location.reload()}>
          Check again +
        </Button>
      </Intro>
    );
  }

  if (state.kind === 'failed') {
    return (
      <Intro eyebrow="Checkout">
        <p className="mx-auto mt-10 max-w-md text-pretty text-lg leading-relaxed text-muted">
          That payment didn&apos;t complete. No charge stands; your cart is untouched.
        </p>
        <CtaLink href="/shop/checkout" className="mt-8">
          Back to checkout +
        </CtaLink>
      </Intro>
    );
  }

  return (
    <Intro eyebrow="Checkout">
      <p className="mx-auto mt-10 max-w-md text-pretty text-lg leading-relaxed text-muted">
        Check your order status any time at our care portal.
      </p>
      <a href={PORTAL_URL} className={buttonClasses({ variant: 'outline' }) + ' mt-8'}>
        Open the care portal +
      </a>
    </Intro>
  );
}

/** "awaiting_requirements" reads as "Awaiting requirements". */
function prettyStatus(status: string): string {
  const words = status.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function Intro({
  eyebrow,
  title = 'Your order',
  children,
}: {
  eyebrow: string;
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col items-center py-16 text-center animate-fade-up sm:py-20">
      <Eyebrow as="p">{eyebrow}</Eyebrow>
      <h1 className="display mt-6 text-balance text-5xl text-ink sm:text-7xl">{title}</h1>
      {children}
    </section>
  );
}
