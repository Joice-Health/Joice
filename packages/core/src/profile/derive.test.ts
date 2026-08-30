import { describe, expect, test } from 'bun:test';
import { deriveTraits, type DeriveContext } from './derive';

const ctx: DeriveContext = {
  minimumAge: 18,
  serviceAreas: {},
  now: new Date('2026-08-30T12:00:00Z'),
};

describe('bmi derivation', () => {
  test('computes from metric height_weight, one decimal', () => {
    const { traits, trace } = deriveTraits({ height_weight: { heightCm: 170, weightKg: 70 } }, ctx);
    expect(traits.bmi).toBe(24.2);
    expect(trace).toContainEqual({ trait: 'bmi', from: ['height_weight'], value: 24.2 });
  });

  test('rounds to one decimal', () => {
    const { traits } = deriveTraits({ height_weight: { heightCm: 180, weightKg: 81.5 } }, ctx);
    expect(traits.bmi).toBe(25.2);
  });

  test('absent or partial height_weight derives nothing', () => {
    expect(deriveTraits({}, ctx).traits.bmi).toBeUndefined();
    expect(deriveTraits({ height_weight: { heightCm: 170 } }, ctx).traits.bmi).toBeUndefined();
    expect(deriveTraits({ height_weight: { weightKg: 70 } }, ctx).traits.bmi).toBeUndefined();
    expect(deriveTraits({ height_weight: 'not-an-object' }, ctx).traits.bmi).toBeUndefined();
  });

  test('a supplied bmi is recomputed, never trusted', () => {
    const { traits } = deriveTraits(
      { bmi: 99, height_weight: { heightCm: 170, weightKg: 70 } },
      ctx,
    );
    expect(traits.bmi).toBe(24.2);
    expect(deriveTraits({ bmi: 99 }, ctx).traits.bmi).toBeUndefined();
  });
});
