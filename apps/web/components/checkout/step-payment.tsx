'use client';

import { useState } from 'react';
import { CardNumberElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Button, Input } from '@joice/ui';
import { formatPrice, type CheckoutStart, type ShippingAddress } from '@/lib/careportals/types';
import {
  applyCoupon,
  getPaymentStatus,
  submitPayment,
} from '@/lib/careportals/checkout.client';
import { runPayment, type PaymentOutcome, type PaymentPorts } from './checkout-machine';
import { CardFields } from './card-fields';
import { StepShell } from './step-shell';

/**
 * The payment step: the Joice-dressed Stripe card fields, the quiet coupon
 * disclosure, and the Pay button carrying the live amount. All money logic
 * lives in the pure machine (checkout-machine.ts); this component only wires
 * the real ports (Stripe tokenization, the CarePortals calls bound to this
 * cart and JWT) and renders the outcome it is handed.
 */
export function StepPayment({
  cartId,
  token,
  start,
  contactName,
  contactEmail,
  shipping,
  busy,
  setBusy,
  onOutcome,
  onStartRefresh,
  onBack,
}: {
  cartId: string;
  token: string;
  start: CheckoutStart | null;
  contactName: string;
  contactEmail: string;
  shipping: ShippingAddress;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onOutcome: (outcome: PaymentOutcome) => void;
  onStartRefresh: (start: CheckoutStart) => void;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | undefined>(undefined);
  const [couponNote, setCouponNote] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const total = start?.cart.totalAmount;

  async function handleApplyCoupon() {
    const code = couponCode.trim();
    if (!code || busy) return;
    setCouponNote(null);
    try {
      const next = await applyCoupon(cartId, code, token);
      onStartRefresh(next);
      if (next.couponError) {
        setAppliedCoupon(undefined);
        setCouponNote(next.couponError);
      } else {
        setAppliedCoupon(code);
        setCouponNote('Code applied.');
      }
    } catch {
      setCouponNote("That code didn't go through. Try again.");
    }
  }

  async function handlePay() {
    if (!stripe || !elements || busy) return;
    const card = elements.getElement(CardNumberElement);
    if (!card) return;

    setStepError(null);
    setBusy(true);
    try {
      const ports: PaymentPorts = {
        createPaymentMethod: async () => {
          const result = await stripe.createPaymentMethod({
            type: 'card',
            card,
            billing_details: {
              name: contactName,
              email: contactEmail,
              address: {
                line1: shipping.address1,
                line2: shipping.address2,
                city: shipping.city,
                state: shipping.provinceCode,
                postal_code: shipping.postalCode,
                country: shipping.countryCode,
              },
            },
          });
          if (result.error) {
            return {
              ok: false,
              message: result.error.message ?? 'Check your card details and try again.',
            };
          }
          return { ok: true, paymentMethodId: result.paymentMethod.id };
        },
        submitPayment: (paymentMethodId) =>
          submitPayment(
            cartId,
            {
              returnUrl: `${window.location.origin}/shop/checkout/complete?cart=${encodeURIComponent(cartId)}`,
              shippingAddress: shipping,
              paymentMethodId,
              isNewShippingAddress: true,
              couponCode: appliedCoupon,
            },
            token,
          ),
        handleNextAction: async (clientSecret) => {
          const result = await stripe.handleNextAction({ clientSecret });
          if (result.error) throw new Error(result.error.message ?? '3DS failed');
        },
        getPaymentStatus: () => getPaymentStatus(cartId, token),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      };

      onOutcome(await runPayment(ports));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start">
      <StepShell
        stepKey="payment"
        title="Payment"
        help="Card details are handled by Stripe and never touch Joice systems."
        error={stepError}
        busy={busy}
        submitLabel={total !== undefined ? `Pay ${formatPrice(total)} +` : 'Pay +'}
        onSubmit={handlePay}
        onBack={onBack}
      >
        <CardFields />
      </StepShell>

      <div className="mt-6 flex w-full max-w-md flex-col items-start gap-3">
        {couponOpen ? (
          <div className="flex w-full items-center gap-3">
            <Input
              aria-label="Coupon code"
              placeholder="Coupon code"
              value={couponCode}
              disabled={busy}
              onChange={(e) => setCouponCode(e.target.value)}
              className="max-w-56"
            />
            <Button type="button" size="sm" disabled={busy} onClick={handleApplyCoupon}>
              Apply +
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="mono-label text-muted transition-colors hover:text-ink"
            onClick={() => setCouponOpen(true)}
          >
            Have a code?
          </button>
        )}
        {couponNote ? (
          <p className="mono-label text-muted" role="status">
            {couponNote}
          </p>
        ) : null}
      </div>
    </div>
  );
}
