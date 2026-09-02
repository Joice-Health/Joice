'use client';

import {
  CardCvcElement,
  CardExpiryElement,
  CardNumberElement,
} from '@stripe/react-stripe-js';
import type { StripeElementStyle } from '@stripe/stripe-js';
import type { ReactNode } from 'react';

/**
 * The card entry block (docs/shop/01-commerce.md section 6): Stripe's split
 * elements (number, expiry, cvc) dressed as the house pills, so card data
 * lives in Stripe's iframes while the page reads as Joice. The split
 * elements are deliberate over the Payment Element: CarePortals owns the
 * intent lifecycle and wants a client-created payment method token.
 *
 * The iframe styles carry only colors and a system mono stack (the font-code
 * philosophy; loading our licensed faces into Stripe's iframes would need
 * public font URLs that next/font hashes away).
 */
const ELEMENT_STYLE: StripeElementStyle = {
  base: {
    color: '#4D4F3F',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '16px',
    '::placeholder': { color: '#ABA8A0' },
  },
  invalid: { color: '#8f2b1c' },
};

const ELEMENT_OPTIONS = { style: ELEMENT_STYLE };

function Pill({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex w-full flex-col gap-2">
      <span className="mono-label text-ink">{label}</span>
      <span className="flex h-12 w-full flex-col justify-center rounded-full bg-surface px-5">
        {children}
      </span>
    </label>
  );
}

export function CardFields() {
  return (
    <div className="flex w-full flex-col gap-6">
      <Pill label="Card number">
        <CardNumberElement options={{ ...ELEMENT_OPTIONS, showIcon: true }} />
      </Pill>
      <div className="grid grid-cols-2 gap-4">
        <Pill label="Expiry">
          <CardExpiryElement options={ELEMENT_OPTIONS} />
        </Pill>
        <Pill label="Security code">
          <CardCvcElement options={ELEMENT_OPTIONS} />
        </Pill>
      </div>
    </div>
  );
}
