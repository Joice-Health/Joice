import { describe, expect, test } from 'bun:test';
import { allowedOpsFor, validateCondition } from './validate';

const codes = (issues: ReturnType<typeof validateCondition>) => issues.map((i) => i.code);

describe('validateCondition', () => {
  test('a well-formed rule over registered traits has no issues', () => {
    expect(
      validateCondition({
        all: [
          { trait: 'goal', op: 'eq', value: 'weight-metabolic' },
          { trait: 'age', op: 'gte', value: { setting: 'onboarding.minimumAge' } },
          { trait: 'weight_approaches_tried', op: 'contains', value: 'diet' },
          { not: { trait: 'us_state', op: 'in', value: ['TX', 'NY'] } },
          { trait: 'first_name', op: 'exists' },
        ],
      }),
    ).toEqual([]);
  });

  test('unknown traits are refused, with the path', () => {
    const issues = validateCondition({ all: [{ trait: 'goal', op: 'exists' }, { trait: 'height_cm', op: 'gt', value: 1 }] });
    expect(issues).toEqual([
      { path: 'all.1', code: 'unknown_trait', message: 'Unknown trait height_cm' },
    ]);
  });

  test('operators are checked against the trait type', () => {
    expect(codes(validateCondition({ trait: 'goal', op: 'gt', value: 'energy' }))).toEqual(['op_not_allowed']);
    expect(codes(validateCondition({ trait: 'consent_terms', op: 'in', value: [true] }))).toEqual(['op_not_allowed']);
    expect(codes(validateCondition({ trait: 'date_of_birth', op: 'contains', value: '19' }))).toEqual(['op_not_allowed']);
    expect(allowedOpsFor('enum')).toEqual(['eq', 'neq', 'in', 'nin', 'exists']);
    expect(allowedOpsFor('height_weight')).toEqual(['exists']);
  });

  test('values must be in the vocabulary and the right shape', () => {
    expect(codes(validateCondition({ trait: 'goal', op: 'eq', value: 'cognition' }))).toEqual(['value_not_in_vocabulary']);
    expect(codes(validateCondition({ trait: 'goal', op: 'in', value: ['energy', 'longevity'] }))).toEqual(['value_not_in_vocabulary']);
    expect(codes(validateCondition({ trait: 'goal', op: 'in', value: 'energy' }))).toEqual(['value_shape']);
    expect(codes(validateCondition({ trait: 'age', op: 'between', value: [18] }))).toEqual(['value_shape']);
    expect(codes(validateCondition({ trait: 'age', op: 'gte', value: '18' }))).toEqual(['value_shape']);
    expect(codes(validateCondition({ trait: 'us_state', op: 'eq', value: 'ZZ' }))).toEqual(['value_not_in_vocabulary']);
    expect(codes(validateCondition({ trait: 'weight_approaches_tried', op: 'eq', value: ['diet', 'nope'] }))).toEqual(['value_not_in_vocabulary']);
    expect(codes(validateCondition({ trait: 'weight_approaches_tried', op: 'contains', value: 'nope' }))).toEqual(['value_not_in_vocabulary']);
  });

  test('exists takes no value; other ops need one', () => {
    expect(codes(validateCondition({ trait: 'goal', op: 'exists', value: 'x' }))).toEqual(['value_shape']);
    expect(codes(validateCondition({ trait: 'goal', op: 'eq' }))).toEqual(['value_required']);
  });

  test('setting refs are only allowed on numbers and dates', () => {
    expect(validateCondition({ trait: 'date_of_birth', op: 'lt', value: { setting: 'x.cutoff' } })).toEqual([]);
    expect(codes(validateCondition({ trait: 'goal', op: 'eq', value: { setting: 'x.goal' } }))).toEqual([
      'setting_ref_not_allowed',
    ]);
  });

  test('custom traits are typed by their question', () => {
    expect(codes(validateCondition({ trait: 'custom.days', op: 'gte', value: 3 }))).toEqual(['unknown_trait']);
    expect(validateCondition({ trait: 'custom.days', op: 'gte', value: 3 }, { customTypes: { 'custom.days': 'number' } })).toEqual([]);
    expect(
      codes(validateCondition({ trait: 'custom.mood', op: 'gte', value: 3 }, { customTypes: { 'custom.mood': 'string' } })),
    ).toEqual(['op_not_allowed']);
  });

  test('paths point into nested groups', () => {
    const issues = validateCondition({ any: [{ not: { trait: 'goal', op: 'gt', value: 1 } }] });
    expect(issues[0]?.path).toBe('any.0.not');
  });
});
