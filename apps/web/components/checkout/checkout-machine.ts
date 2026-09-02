import type { CareportalsOrder, PaymentPollResult, PaymentSubmitResult } from '@/lib/careportals/types';
import { PatientAuthError } from '@/lib/careportals/patient.client';
import { PaymentDeclinedError } from '@/lib/careportals/checkout.client';

/**
 * The checkout's money-moving logic, pure (docs/shop/01-commerce.md section
 * 6): every effect comes in through ports and time comes in through an
 * injected sleep, so the whole failure matrix is unit-tested without a
 * network. This is the code that can double-charge someone if it is wrong;
 * pixels live elsewhere.
 *
 * The two load-bearing rules:
 * - After a 3DS challenge the payment is RE-SUBMITTED, not polled: the cart
 *   stores its paymentIntentId server-side and the second POST verifies it
 *   and creates the orders (the documented flow).
 * - An AMBIGUOUS failure (the POST reached the network, the answer never
 *   arrived) is resolved poll-first, and a retry is only ever offered once
 *   the poll proves no payment settled. Never auto-resubmit into ambiguity.
 */

export const CHECKOUT_STEPS = ['contact', 'shipping', 'payment'] as const;
export type CheckoutStep = (typeof CHECKOUT_STEPS)[number];

export function nextStep(step: CheckoutStep): CheckoutStep {
  const i = CHECKOUT_STEPS.indexOf(step);
  return CHECKOUT_STEPS[Math.min(i + 1, CHECKOUT_STEPS.length - 1)]!;
}

export function prevStep(step: CheckoutStep): CheckoutStep {
  const i = CHECKOUT_STEPS.indexOf(step);
  return CHECKOUT_STEPS[Math.max(i - 1, 0)]!;
}

export interface PaymentPorts {
  /** Stripe tokenization. A card the buyer can fix returns ok:false with Stripe's message. */
  createPaymentMethod(): Promise<
    { ok: true; paymentMethodId: string } | { ok: false; message: string }
  >;
  /** POST /payments, pre-bound to the cart/body; throws the client's typed errors. */
  submitPayment(paymentMethodId: string): Promise<PaymentSubmitResult>;
  /** Stripe's 3DS runner; rejects when the challenge fails or is abandoned. */
  handleNextAction(clientSecret: string): Promise<void>;
  /** GET /payments, pre-bound; throws on transport failure. */
  getPaymentStatus(): Promise<PaymentPollResult>;
  sleep(ms: number): Promise<void>;
}

export type PaymentOutcome =
  | { kind: 'succeeded'; orders: CareportalsOrder[] }
  /** Tokenization failed; no request left the page and no money moved. */
  | { kind: 'card_error'; message: string }
  /** The bank said no; the cart is intact and another card may be tried. */
  | { kind: 'declined'; message: string }
  /** The patient JWT was rejected; return to the contact step's sign-in mode. */
  | { kind: 'auth_expired' }
  /** A payment may exist but has not settled inside the budget; offer Check again, never resubmit. */
  | { kind: 'processing' }
  /** The outcome is unknowable right now. mayRetry is true only when the poll proved no payment settled. */
  | { kind: 'ambiguous'; message: string; mayRetry: boolean };

export const POLL_INTERVAL_MS = 1_500;
export const POLL_BACKOFF = 1.25;
export const POLL_BUDGET_MS = 45_000;

const STILL_PROCESSING =
  'Your payment is still processing. Do not submit again; check back in a moment.';

type Settled =
  | { kind: 'succeeded'; orders: CareportalsOrder[] }
  | { kind: 'failed' }
  | { kind: 'pending' }
  | { kind: 'auth_expired' }
  | { kind: 'unreachable' };

/** Poll until settled or the budget runs out; transport errors spend budget, never throw. */
async function pollUntilSettled(ports: PaymentPorts): Promise<Settled> {
  let waited = 0;
  let interval = POLL_INTERVAL_MS;
  let sawAnswer = false;
  for (;;) {
    try {
      const status = await ports.getPaymentStatus();
      sawAnswer = true;
      if (status.paymentStatus === 'succeeded') return { kind: 'succeeded', orders: status.orders };
      if (status.paymentStatus === 'failed') return { kind: 'failed' };
    } catch (err) {
      if (err instanceof PatientAuthError) return { kind: 'auth_expired' };
      // Transport noise: spend budget and keep asking.
    }
    if (waited >= POLL_BUDGET_MS) return sawAnswer ? { kind: 'pending' } : { kind: 'unreachable' };
    await ports.sleep(interval);
    waited += interval;
    interval = Math.round(interval * POLL_BACKOFF);
  }
}

/**
 * The resume/check path: after a reload mid-payment, an ambiguous outcome, or
 * the Check again button. It only ever READS: 'none' means the poll proved no
 * payment stands (a fresh attempt is safe and stays a human decision, never
 * an automatic one), 'processing' means keep waiting, 'unknown' means even
 * the poll could not be reached.
 */
export async function checkExistingPayment(
  ports: Pick<PaymentPorts, 'getPaymentStatus' | 'sleep'>,
): Promise<
  | { kind: 'succeeded'; orders: CareportalsOrder[] }
  | { kind: 'auth_expired' }
  | { kind: 'processing' }
  | { kind: 'none' }
  | { kind: 'unknown' }
> {
  const settled = await pollUntilSettled({ ...noopPorts, ...ports });
  switch (settled.kind) {
    case 'succeeded':
      return settled;
    case 'auth_expired':
      return { kind: 'auth_expired' };
    case 'pending':
      return { kind: 'processing' };
    case 'unreachable':
      return { kind: 'unknown' };
    case 'failed':
      return { kind: 'none' };
  }
}

const noopPorts: PaymentPorts = {
  createPaymentMethod: () => Promise.reject(new Error('read-only')),
  submitPayment: () => Promise.reject(new Error('read-only')),
  handleNextAction: () => Promise.reject(new Error('read-only')),
  getPaymentStatus: () => Promise.reject(new Error('read-only')),
  sleep: () => Promise.resolve(),
};

/** One fresh payment attempt, end to end: tokenize, submit, 3DS, re-submit. */
export async function runPayment(ports: PaymentPorts): Promise<PaymentOutcome> {
  const tokenized = await ports.createPaymentMethod();
  if (!tokenized.ok) return { kind: 'card_error', message: tokenized.message };

  const first = await trySubmit(ports, tokenized.paymentMethodId);
  if (first.outcome) return first.outcome;

  if (first.result.kind === 'succeeded') {
    return { kind: 'succeeded', orders: first.result.orders };
  }

  // 3DS: run the challenge, then re-submit (the cart holds the intent).
  try {
    await ports.handleNextAction(first.result.clientSecret);
  } catch {
    return {
      kind: 'declined',
      message: 'The verification was not completed. You can try again.',
    };
  }

  const second = await trySubmit(ports, tokenized.paymentMethodId);
  if (second.outcome) return second.outcome;
  if (second.result.kind === 'succeeded') {
    return { kind: 'succeeded', orders: second.result.orders };
  }
  // A second challenge in a row: something is off upstream; resolve by polling.
  return resolveAmbiguity(ports);
}

type SubmitAttempt =
  | { outcome: PaymentOutcome; result?: never }
  | { outcome?: never; result: PaymentSubmitResult };

async function trySubmit(ports: PaymentPorts, paymentMethodId: string): Promise<SubmitAttempt> {
  try {
    return { result: await ports.submitPayment(paymentMethodId) };
  } catch (err) {
    if (err instanceof PatientAuthError) return { outcome: { kind: 'auth_expired' } };
    if (err instanceof PaymentDeclinedError) {
      return { outcome: { kind: 'declined', message: err.message } };
    }
    // The POST may or may not have executed: never guess, ask the API.
    return { outcome: await resolveAmbiguity(ports) };
  }
}

async function resolveAmbiguity(ports: PaymentPorts): Promise<PaymentOutcome> {
  const settled = await pollUntilSettled(ports);
  switch (settled.kind) {
    case 'succeeded':
      return settled;
    case 'auth_expired':
      return { kind: 'auth_expired' };
    case 'failed':
      // Proven: no payment stands. A retry is safe.
      return {
        kind: 'ambiguous',
        message: 'That didn’t go through. No charge was made; you can try again.',
        mayRetry: true,
      };
    case 'pending':
      return { kind: 'processing' };
    case 'unreachable':
      return { kind: 'ambiguous', message: STILL_PROCESSING, mayRetry: false };
  }
}
