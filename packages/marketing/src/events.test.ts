import { describe, expect, test } from 'bun:test';
import { EVENTS } from './events';

describe('EVENTS', () => {
  test('no event type uses a character Attentive forbids in a type name', () => {
    const forbidden = /["'(){}[\]\\|,]/;
    for (const name of Object.values(EVENTS)) expect(name).not.toMatch(forbidden);
  });

  test('event types are unique', () => {
    const names = Object.values(EVENTS);
    expect(new Set(names).size).toBe(names.length);
  });
});
