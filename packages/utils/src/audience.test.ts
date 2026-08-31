import { describe, expect, test } from 'bun:test';
import { AUDIENCE_TIERS, tierAtLeast } from './audience';

describe('audience tiers', () => {
  test('the order is the contract', () => {
    expect(AUDIENCE_TIERS).toEqual(['visitor', 'lead', 'user', 'subscriber']);
  });

  test('tierAtLeast walks the ladder', () => {
    expect(tierAtLeast('subscriber', 'visitor')).toBe(true);
    expect(tierAtLeast('subscriber', 'subscriber')).toBe(true);
    expect(tierAtLeast('user', 'subscriber')).toBe(false);
    expect(tierAtLeast('lead', 'user')).toBe(false);
    expect(tierAtLeast('visitor', 'visitor')).toBe(true);
    expect(tierAtLeast('visitor', 'lead')).toBe(false);
  });
});
