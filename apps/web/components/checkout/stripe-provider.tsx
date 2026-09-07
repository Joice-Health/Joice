'use client';

import { useState, type ReactNode } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { Eyebrow } from '@/components/ui/eyebrow';
import { getStripe } from '@/lib/stripe';
import { stripePublishableKey } from '@/lib/env';

/**
 * Wraps the payment step in Stripe's Elements context. A build without the
 * publishable key degrades to a plain notice instead of a broken form (the
 * no-Clerk-build precedent); everything else in checkout still works.
 */
export function StripeProvider({ children }: { children: ReactNode }) {
  const [stripePromise] = useState(() => getStripe());

  if (!stripePublishableKey) {
    return (
      <section className="border-t border-line py-10 text-center">
        <Eyebrow as="p">One moment</Eyebrow>
        <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-muted">
          Card payment isn&apos;t available in this build yet.
        </p>
      </section>
    );
  }

  return <Elements stripe={stripePromise}>{children}</Elements>;
}
