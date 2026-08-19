import { describe, expect, test } from 'bun:test';
import { conditionSchema, conditionTraits, type Condition } from './conditions';
import { evaluateCondition, type WhyGroup, type WhyLeaf } from './evaluate';

const traits = {
  goal: 'energy',
  us_state: 'CA',
  age: 34,
  date_of_birth: '1992-03-04',
  weight_approaches_tried: ['diet', 'training'],
  first_name: 'Sam',
  consent_terms: true,
  empty_note: '',
  empty_list: [],
};

const ev = (cond: Condition, settings?: Record<string, unknown>) =>
  evaluateCondition(cond, traits, settings).value;

describe('leaf operators', () => {
  test('eq / neq on scalars and lists', () => {
    expect(ev({ trait: 'goal', op: 'eq', value: 'energy' })).toBe(true);
    expect(ev({ trait: 'goal', op: 'eq', value: 'stress-sleep' })).toBe(false);
    expect(ev({ trait: 'goal', op: 'neq', value: 'stress-sleep' })).toBe(true);
    expect(ev({ trait: 'consent_terms', op: 'eq', value: true })).toBe(true);
    expect(ev({ trait: 'weight_approaches_tried', op: 'eq', value: ['training', 'diet'] })).toBe(true);
    expect(ev({ trait: 'weight_approaches_tried', op: 'eq', value: ['diet'] })).toBe(false);
  });

  test('in / nin on scalars and on list-valued traits', () => {
    expect(ev({ trait: 'us_state', op: 'in', value: ['CA', 'NY'] })).toBe(true);
    expect(ev({ trait: 'us_state', op: 'nin', value: ['CA', 'NY'] })).toBe(false);
    expect(ev({ trait: 'weight_approaches_tried', op: 'in', value: ['coaching', 'diet'] })).toBe(true);
    expect(ev({ trait: 'weight_approaches_tried', op: 'nin', value: ['coaching'] })).toBe(true);
    expect(ev({ trait: 'us_state', op: 'in', value: 'CA' })).toBe(false);
  });

  test('ordering on numbers and ISO dates, never on mixed types', () => {
    expect(ev({ trait: 'age', op: 'gte', value: 18 })).toBe(true);
    expect(ev({ trait: 'age', op: 'lt', value: 18 })).toBe(false);
    expect(ev({ trait: 'age', op: 'between', value: [30, 40] })).toBe(true);
    expect(ev({ trait: 'age', op: 'between', value: [35, 40] })).toBe(false);
    expect(ev({ trait: 'date_of_birth', op: 'lt', value: '2000-01-01' })).toBe(true);
    expect(ev({ trait: 'date_of_birth', op: 'gt', value: '2000-01-01' })).toBe(false);
    expect(ev({ trait: 'age', op: 'gt', value: '17' })).toBe(false);
    expect(ev({ trait: 'first_name', op: 'gt', value: 'A' })).toBe(false);
  });

  test('contains on lists and strings', () => {
    expect(ev({ trait: 'weight_approaches_tried', op: 'contains', value: 'diet' })).toBe(true);
    expect(ev({ trait: 'weight_approaches_tried', op: 'contains', value: 'coaching' })).toBe(false);
    expect(ev({ trait: 'first_name', op: 'contains', value: 'sa' })).toBe(true);
    expect(ev({ trait: 'age', op: 'contains', value: 3 })).toBe(false);
  });

  test('exists and the missing-trait rule', () => {
    expect(ev({ trait: 'goal', op: 'exists' })).toBe(true);
    expect(ev({ trait: 'goal_note', op: 'exists' })).toBe(false);
    expect(ev({ trait: 'empty_note', op: 'exists' })).toBe(false);
    expect(ev({ trait: 'empty_list', op: 'exists' })).toBe(false);
    // Every other op is false on a missing trait, including neq.
    expect(ev({ trait: 'goal_note', op: 'neq', value: 'x' })).toBe(false);
    expect(ev({ trait: 'goal_note', op: 'nin', value: ['x'] })).toBe(false);
    expect(ev({ not: { trait: 'goal_note', op: 'exists' } })).toBe(true);
  });
});

describe('composition', () => {
  test('all / any / not nest', () => {
    const cond: Condition = {
      all: [
        { trait: 'age', op: 'gte', value: 18 },
        { any: [{ trait: 'goal', op: 'eq', value: 'energy' }, { trait: 'goal', op: 'eq', value: 'not-sure' }] },
        { not: { trait: 'us_state', op: 'eq', value: 'TX' } },
      ],
    };
    expect(ev(cond)).toBe(true);
    expect(evaluateCondition(cond, { ...traits, us_state: 'TX' }).value).toBe(false);
  });

  test('the why trace names every leaf with expected and actual', () => {
    const cond: Condition = {
      all: [{ trait: 'goal', op: 'eq', value: 'energy' }, { trait: 'age', op: 'gte', value: 40 }],
    };
    const { value, why } = evaluateCondition(cond, traits);
    expect(value).toBe(false);
    const group = why as WhyGroup;
    expect(group.kind).toBe('all');
    expect(group.result).toBe(false);
    const [first, second] = group.children as [WhyLeaf, WhyLeaf];
    expect(first).toMatchObject({ kind: 'leaf', trait: 'goal', op: 'eq', expected: 'energy', actual: 'energy', present: true, result: true });
    expect(second).toMatchObject({ kind: 'leaf', trait: 'age', op: 'gte', expected: 40, actual: 34, present: true, result: false });
  });

  test('a missing trait is explained in the trace', () => {
    const { why } = evaluateCondition({ trait: 'goal_note', op: 'eq', value: 'x' }, traits);
    expect(why).toMatchObject({ kind: 'leaf', present: false, result: false, note: 'trait not present' });
  });
});

describe('setting references', () => {
  test('resolve from the settings map', () => {
    const cond: Condition = { trait: 'age', op: 'lt', value: { setting: 'onboarding.minimumAge' } };
    expect(ev(cond, { 'onboarding.minimumAge': 18 })).toBe(false);
    expect(ev(cond, { 'onboarding.minimumAge': 40 })).toBe(true);
  });

  test('an unset setting makes the leaf false and says so', () => {
    const { value, why } = evaluateCondition(
      { trait: 'age', op: 'lt', value: { setting: 'onboarding.minimumAge' } },
      traits,
      {},
    );
    expect(value).toBe(false);
    expect((why as WhyLeaf).note).toContain('onboarding.minimumAge');
  });
});

describe('schema and helpers', () => {
  test('conditionSchema accepts the shapes and rejects stray keys', () => {
    expect(conditionSchema.safeParse({ trait: 'goal', op: 'eq', value: 'energy' }).success).toBe(true);
    expect(conditionSchema.safeParse({ all: [{ trait: 'goal', op: 'exists' }] }).success).toBe(true);
    expect(conditionSchema.safeParse({ all: [] }).success).toBe(false);
    expect(conditionSchema.safeParse({ trait: 'goal', op: 'like', value: 'x' }).success).toBe(false);
    expect(conditionSchema.safeParse({ trait: 'height_cm', op: 'gt', value: 1 }).success).toBe(false);
    expect(conditionSchema.safeParse({ trait: 'goal', op: 'eq', value: 'x', extra: 1 }).success).toBe(false);
  });

  test('conditionTraits lists referenced traits once', () => {
    expect(
      conditionTraits({
        all: [
          { trait: 'goal', op: 'eq', value: 'energy' },
          { any: [{ trait: 'age', op: 'gte', value: 18 }, { trait: 'goal', op: 'exists' }] },
        ],
      }),
    ).toEqual(['goal', 'age']);
  });
});
