import { describe, expect, test } from 'bun:test';
import { US_STATES, US_STATE_CODES, usStateName } from './us-states';

describe('us states', () => {
  test('fifty states plus DC, unique codes', () => {
    expect(US_STATES).toHaveLength(51);
    expect(new Set(US_STATE_CODES).size).toBe(51);
    expect(US_STATE_CODES).toContain('DC');
  });

  test('usStateName never throws in copy', () => {
    expect(usStateName('CA')).toBe('California');
    expect(usStateName('ZZ')).toBe('ZZ');
  });
});
