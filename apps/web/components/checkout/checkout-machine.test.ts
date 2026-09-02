import { describe, expect, test } from 'bun:test';
import type { PaymentPollResult, PaymentSubmitResult } from '@/lib/careportals/types';
import { PatientAuthError } from '@/lib/careportals/patient.client';
import { PaymentDeclinedError } from '@/lib/careportals/checkout.client';
import {
  CHECKOUT_STEPS,
  checkExistingPayment,
  nextStep,
  prevStep,
  runPayment,
  type PaymentPorts,
} from './checkout-machine';

const ORDERS = [{ _id: 'o1', status: 'awaiting_requirements' }];

/** Scripted ports: each array entry answers one call, in order. */
function makePorts(script: {
  tokenize?: Array<{ ok: true; paymentMethodId: string } | { ok: false; message: string }>;
  submit?: Array<PaymentSubmitResult | Error>;
  nextAction?: Array<'ok' | Error>;
  poll?: Array<PaymentPollResult | Error>;
}) {
  const calls = { tokenize: 0, submit: 0, nextAction: 0, poll: 0, sleeps: [] as number[] };
  const secrets: string[] = [];
  const ports: PaymentPorts = {
    createPaymentMethod: async () => {
      const r = script.tokenize?.[calls.tokenize++];
      if (!r) throw new Error('unexpected tokenize call');
      return r;
    },
    submitPayment: async () => {
      const r = script.submit?.[calls.submit++];
      if (!r) throw new Error('unexpected submit call');
      if (r instanceof Error) throw r;
      return r;
    },
    handleNextAction: async (secret) => {
      secrets.push(secret);
      const r = script.nextAction?.[calls.nextAction++];
      if (!r) throw new Error('unexpected nextAction call');
      if (r instanceof Error) throw r;
    },
    getPaymentStatus: async () => {
      const list = script.poll ?? [];
      const r = list[Math.min(calls.poll++, list.length - 1)];
      if (!r) throw new Error('unexpected poll call');
      if (r instanceof Error) throw r;
      return r;
    },
    sleep: async (ms) => {
      calls.sleeps.push(ms);
    },
  };
  return { ports, calls, secrets };
}

const ok = { ok: true, paymentMethodId: 'pm_test' } as const;
const succeeded: PaymentSubmitResult = { kind: 'succeeded', orders: ORDERS };
const challenge: PaymentSubmitResult = { kind: 'requires_action', clientSecret: 'cs_1' };
const pollSucceeded: PaymentPollResult = { paymentStatus: 'succeeded', orders: ORDERS };
const pollFailed: PaymentPollResult = { paymentStatus: 'failed', orders: [] };
const pollPending: PaymentPollResult = { paymentStatus: 'pending', orders: [] };

describe('runPayment', () => {
  test('happy path: tokenize, submit, done', async () => {
    const { ports, calls } = makePorts({ tokenize: [ok], submit: [succeeded] });
    const outcome = await runPayment(ports);
    expect(outcome).toEqual({ kind: 'succeeded', orders: ORDERS });
    expect(calls.poll).toBe(0);
  });

  test('a fixable card stops before anything leaves the page', async () => {
    const { ports, calls } = makePorts({
      tokenize: [{ ok: false, message: 'Your card number is invalid.' }],
    });
    const outcome = await runPayment(ports);
    expect(outcome).toEqual({ kind: 'card_error', message: 'Your card number is invalid.' });
    expect(calls.submit).toBe(0);
  });

  test('a decline surfaces the message and never polls', async () => {
    const { ports, calls } = makePorts({
      tokenize: [ok],
      submit: [new PaymentDeclinedError('Your card was declined.')],
    });
    const outcome = await runPayment(ports);
    expect(outcome).toEqual({ kind: 'declined', message: 'Your card was declined.' });
    expect(calls.poll).toBe(0);
  });

  test('a rejected JWT routes back to sign-in', async () => {
    const { ports } = makePorts({ tokenize: [ok], submit: [new PatientAuthError()] });
    expect(await runPayment(ports)).toEqual({ kind: 'auth_expired' });
  });

  test('3DS: challenge, then RE-SUBMIT, not poll', async () => {
    const { ports, calls, secrets } = makePorts({
      tokenize: [ok],
      submit: [challenge, succeeded],
      nextAction: ['ok'],
    });
    const outcome = await runPayment(ports);
    expect(outcome).toEqual({ kind: 'succeeded', orders: ORDERS });
    expect(secrets).toEqual(['cs_1']);
    expect(calls.submit).toBe(2);
    expect(calls.poll).toBe(0);
  });

  test('an abandoned challenge is a decline, submitted once', async () => {
    const { ports, calls } = makePorts({
      tokenize: [ok],
      submit: [challenge],
      nextAction: [new Error('abandoned')],
    });
    const outcome = await runPayment(ports);
    expect(outcome.kind).toBe('declined');
    expect(calls.submit).toBe(1);
  });

  test('a second challenge in a row resolves by polling', async () => {
    const { ports } = makePorts({
      tokenize: [ok],
      submit: [challenge, challenge],
      nextAction: ['ok'],
      poll: [pollSucceeded],
    });
    expect(await runPayment(ports)).toEqual({ kind: 'succeeded', orders: ORDERS });
  });

  test('ambiguous network failure polls first and finds the success', async () => {
    const { ports, calls } = makePorts({
      tokenize: [ok],
      submit: [new Error('network dropped')],
      poll: [pollPending, pollSucceeded],
    });
    const outcome = await runPayment(ports);
    expect(outcome).toEqual({ kind: 'succeeded', orders: ORDERS });
    expect(calls.sleeps[0]).toBe(1500);
  });

  test('ambiguous failure with a proven no-payment permits retry', async () => {
    const { ports } = makePorts({
      tokenize: [ok],
      submit: [new Error('network dropped')],
      poll: [pollFailed],
    });
    const outcome = await runPayment(ports);
    expect(outcome.kind).toBe('ambiguous');
    if (outcome.kind === 'ambiguous') expect(outcome.mayRetry).toBe(true);
  });

  test('a payment stuck pending exhausts the budget into processing, with backoff', async () => {
    const { ports, calls } = makePorts({
      tokenize: [ok],
      submit: [new Error('network dropped')],
      poll: [pollPending],
    });
    const outcome = await runPayment(ports);
    expect(outcome).toEqual({ kind: 'processing' });
    const total = calls.sleeps.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(45_000);
    expect(calls.sleeps[1]!).toBeGreaterThan(calls.sleeps[0]!);
  });

  test('poll never reachable: ambiguous and retry is NOT offered', async () => {
    const { ports } = makePorts({
      tokenize: [ok],
      submit: [new Error('network dropped')],
      poll: [new Error('down')],
    });
    const outcome = await runPayment(ports);
    expect(outcome.kind).toBe('ambiguous');
    if (outcome.kind === 'ambiguous') expect(outcome.mayRetry).toBe(false);
  });

  test('auth expiry during the poll routes to sign-in', async () => {
    const { ports } = makePorts({
      tokenize: [ok],
      submit: [new Error('network dropped')],
      poll: [new PatientAuthError()],
    });
    expect(await runPayment(ports)).toEqual({ kind: 'auth_expired' });
  });
});

describe('checkExistingPayment', () => {
  const readPorts = (poll: Array<PaymentPollResult | Error>) =>
    makePorts({ poll }).ports;

  test('maps the four settled states', async () => {
    expect(await checkExistingPayment(readPorts([pollSucceeded]))).toEqual({
      kind: 'succeeded',
      orders: ORDERS,
    });
    expect(await checkExistingPayment(readPorts([pollFailed]))).toEqual({ kind: 'none' });
    expect(await checkExistingPayment(readPorts([pollPending]))).toEqual({ kind: 'processing' });
    expect(await checkExistingPayment(readPorts([new Error('down')]))).toEqual({
      kind: 'unknown',
    });
    expect(await checkExistingPayment(readPorts([new PatientAuthError()]))).toEqual({
      kind: 'auth_expired',
    });
  });

  test('never submits anything', async () => {
    const { ports, calls } = makePorts({ poll: [pollSucceeded] });
    await checkExistingPayment(ports);
    expect(calls.submit).toBe(0);
    expect(calls.tokenize).toBe(0);
  });
});

describe('step helpers', () => {
  test('walk forward and back with clamping', () => {
    expect(CHECKOUT_STEPS).toEqual(['contact', 'shipping', 'payment']);
    expect(nextStep('contact')).toBe('shipping');
    expect(nextStep('payment')).toBe('payment');
    expect(prevStep('shipping')).toBe('contact');
    expect(prevStep('contact')).toBe('contact');
  });
});
