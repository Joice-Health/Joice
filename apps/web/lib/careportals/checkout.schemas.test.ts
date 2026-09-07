import { describe, expect, test } from 'bun:test';
import {
  contactSchema,
  isAtLeastAge,
  normalizeUsPhone,
  shippingSchema,
  signInSchema,
} from './checkout.schemas';

describe('isAtLeastAge', () => {
  const today = new Date(Date.UTC(2026, 8, 1)); // 2026-09-01

  test('the 18th birthday itself passes', () => {
    expect(isAtLeastAge('2008-09-01', 18, today)).toBe(true);
  });

  test('one day short of 18 fails', () => {
    expect(isAtLeastAge('2008-09-02', 18, today)).toBe(false);
  });

  test('clearly adult and clearly minor', () => {
    expect(isAtLeastAge('1990-01-01', 18, today)).toBe(true);
    expect(isAtLeastAge('2015-06-15', 18, today)).toBe(false);
  });

  test('garbage never passes', () => {
    expect(isAtLeastAge('not-a-date', 18, today)).toBe(false);
    expect(isAtLeastAge('', 18, today)).toBe(false);
  });
});

describe('normalizeUsPhone', () => {
  test('accepts the ways people type a US number', () => {
    expect(normalizeUsPhone('(555) 555-0100')).toBe('+15555550100');
    expect(normalizeUsPhone('555.555.0100')).toBe('+15555550100');
    expect(normalizeUsPhone('1 555 555 0100')).toBe('+15555550100');
    expect(normalizeUsPhone('+1 555 555 0100')).toBe('+15555550100');
  });

  test('rejects wrong lengths and impossible prefixes', () => {
    expect(normalizeUsPhone('555-0100')).toBeNull();
    expect(normalizeUsPhone('05555550100')).toBeNull();
    expect(normalizeUsPhone('555 155 0100')).toBeNull();
    expect(normalizeUsPhone('')).toBeNull();
  });
});

describe('contactSchema', () => {
  const valid = {
    email: '  Buyer@Example.com ',
    firstName: 'Test',
    lastName: 'Buyer',
    phone: '(555) 555-0100',
    dob: '1990-01-01',
    gender: 'female',
    password: 'a-long-password',
  };

  test('normalizes email and phone on the way through', () => {
    const parsed = contactSchema.parse(valid);
    expect(parsed.email).toBe('buyer@example.com');
    expect(parsed.phone).toBe('+15555550100');
  });

  test('a minor is refused with the age message', () => {
    const result = contactSchema.safeParse({ ...valid, dob: '2015-06-15' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('You must be 18 or older to order.');
    }
  });

  test('a short password is refused', () => {
    expect(contactSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
  });
});

describe('signInSchema', () => {
  test('wants an email and any non-empty password', () => {
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(signInSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});

describe('shippingSchema', () => {
  const valid = {
    address1: '456 Oak Avenue',
    address2: '',
    city: 'Austin',
    provinceCode: 'TX',
    postalCode: '78701',
  };

  test('parses and defaults the country, dropping an empty address2', () => {
    const parsed = shippingSchema.parse(valid);
    expect(parsed.countryCode).toBe('US');
    expect(parsed.address2).toBeUndefined();
  });

  test('zip accepts 5 and 9 digit forms only', () => {
    expect(shippingSchema.safeParse({ ...valid, postalCode: '78701-1234' }).success).toBe(true);
    expect(shippingSchema.safeParse({ ...valid, postalCode: '7870' }).success).toBe(false);
    expect(shippingSchema.safeParse({ ...valid, postalCode: 'ABCDE' }).success).toBe(false);
  });

  test('state must be a real USPS code', () => {
    expect(shippingSchema.safeParse({ ...valid, provinceCode: 'ZZ' }).success).toBe(false);
  });
});
