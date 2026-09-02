import { describe, expect, test } from 'bun:test';
import { PatientAuthError } from './patient.client';
import {
  PaymentDeclinedError,
  applyCoupon,
  getPaymentStatus,
  startCheckout,
  submitPayment,
} from './checkout.client';

const BODY = {
  returnUrl: 'https://joicehealth.com/shop/checkout/complete?cart=c1',
  shippingAddress: {
    address1: '456 Oak Avenue',
    city: 'Austin',
    provinceCode: 'TX',
    postalCode: '78701',
    countryCode: 'US',
  },
  paymentMethodId: 'pm_test',
  isNewShippingAddress: true,
};

function fakeFetch(status: number, body?: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { impl, calls };
}

describe('startCheckout', () => {
  test('sends Bearer plus organization and returns the context', async () => {
    const { impl, calls } = fakeFetch(200, { cart: { _id: 'c1' }, paymentMethods: [] });
    const start = await startCheckout('c1', 'jwt', impl);
    expect(start.paymentMethods).toEqual([]);
    expect(calls[0]!.url).toBe('https://patient-api.portals.care/v2/checkout/c1/start');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.organization).toBe('joicehealth_com');
    expect(headers.authorization?.startsWith('Bearer ')).toBe(true);
  });

  test('401 is a PatientAuthError', async () => {
    const { impl } = fakeFetch(401);
    expect(startCheckout('c1', 'jwt', impl)).rejects.toBeInstanceOf(PatientAuthError);
  });
});

describe('applyCoupon', () => {
  test('POSTs the code in the path, encoded', async () => {
    const { impl, calls } = fakeFetch(200, { cart: { _id: 'c1' }, paymentMethods: [] });
    await applyCoupon('c1', 'NEW 20', 'jwt', impl);
    expect(calls[0]!.url).toContain('/coupon/NEW%2020');
    expect(calls[0]!.init.method).toBe('POST');
  });
});

describe('submitPayment', () => {
  test('201 maps to succeeded with orders', async () => {
    const { impl } = fakeFetch(201, { orders: [{ _id: 'o1', status: 'processing' }] });
    const result = await submitPayment('c1', BODY, 'jwt', impl);
    expect(result).toEqual({ kind: 'succeeded', orders: [{ _id: 'o1', status: 'processing' }] });
  });

  test('402 with a client_secret maps to requires_action', async () => {
    const { impl } = fakeFetch(402, {
      intent: { status: 'requires_action', client_secret: 'cs_1' },
    });
    const result = await submitPayment('c1', BODY, 'jwt', impl);
    expect(result).toEqual({ kind: 'requires_action', clientSecret: 'cs_1' });
  });

  test('402 without a secret is a decline, not a crash', async () => {
    const { impl } = fakeFetch(402, { intent: { status: 'requires_action' } });
    expect(submitPayment('c1', BODY, 'jwt', impl)).rejects.toBeInstanceOf(PaymentDeclinedError);
  });

  test('a 4xx decline carries the upstream message', async () => {
    const { impl } = fakeFetch(400, { message: 'Insufficient funds' });
    expect(submitPayment('c1', BODY, 'jwt', impl)).rejects.toThrow('Insufficient funds');
  });

  test('401 is a PatientAuthError and 500 stays a plain (ambiguous) error', async () => {
    expect(submitPayment('c1', BODY, 'jwt', fakeFetch(401).impl)).rejects.toBeInstanceOf(
      PatientAuthError,
    );
    expect(submitPayment('c1', BODY, 'jwt', fakeFetch(500).impl)).rejects.toThrow(
      'Payment failed (500)',
    );
  });
});

describe('getPaymentStatus', () => {
  test('maps a settled answer through', async () => {
    const { impl } = fakeFetch(200, { paymentStatus: 'succeeded', orders: [{ _id: 'o1', status: 'shipped' }] });
    const status = await getPaymentStatus('c1', 'jwt', impl);
    expect(status.paymentStatus).toBe('succeeded');
    expect(status.orders).toHaveLength(1);
  });

  test('400 and 404 are PROOF of no payment: failed, retry-safe', async () => {
    expect((await getPaymentStatus('c1', 'jwt', fakeFetch(404).impl)).paymentStatus).toBe(
      'failed',
    );
    expect((await getPaymentStatus('c1', 'jwt', fakeFetch(400).impl)).paymentStatus).toBe(
      'failed',
    );
  });

  test('a missing status reads as pending, never as settled', async () => {
    const { impl } = fakeFetch(200, {});
    expect((await getPaymentStatus('c1', 'jwt', impl)).paymentStatus).toBe('pending');
  });
});
