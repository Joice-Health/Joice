import { describe, expect, test } from 'bun:test';
import {
  adminWaitlistQuerySchema,
  createFeatureFlagSchema,
  paginationQuerySchema,
  settingKeySchema,
} from './schemas';

describe('paginationQuerySchema', () => {
  test('coerces string query params to numbers', () => {
    expect(paginationQuerySchema.parse({ page: '3', limit: '50' })).toEqual({
      page: 3,
      limit: 50,
    });
  });

  test('applies defaults and caps limit at 100', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 25 });
    expect(paginationQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('adminWaitlistQuerySchema', () => {
  test('accepts search/status/sort and defaults sort to newest', () => {
    const parsed = adminWaitlistQuerySchema.parse({ search: 'a@b.co', status: 'invited' });
    expect(parsed.sort).toBe('newest');
    expect(parsed.status).toBe('invited');
  });

  test('rejects unknown status', () => {
    expect(adminWaitlistQuerySchema.safeParse({ status: 'banned' }).success).toBe(false);
  });
});

describe('flag and setting keys', () => {
  test('accepts slug-style keys', () => {
    expect(createFeatureFlagSchema.parse({ key: 'member_signups.v2' }).enabled).toBe(false);
    expect(settingKeySchema.parse('support-email')).toBe('support-email');
  });

  test('rejects uppercase, spaces, and empty keys', () => {
    for (const key of ['Member', 'has space', '', 'emoji🙂']) {
      expect(createFeatureFlagSchema.safeParse({ key }).success).toBe(false);
    }
  });
});
