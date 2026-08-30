import { describe, expect, test } from 'bun:test';
import {
  GOAL_VALUES,
  TRAITS,
  TRAIT_KEYS,
  customTraitKeySchema,
  getTrait,
  isCustomTrait,
  isDerivedTrait,
  isRegisteredTrait,
  isoDateSchema,
  sensitivityOf,
  traitRefSchema,
  traitValueSchema,
  traitsWithSensitivity,
  validateTraitValue,
} from './traits';

describe('trait registry', () => {
  test('keys are unique, snake_case, and match their definition', () => {
    const keys = Object.keys(TRAITS);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(TRAITS[key as keyof typeof TRAITS].key).toBe(key);
    }
    expect([...TRAIT_KEYS] as string[]).toEqual(keys);
  });

  test('every enum trait declares a non-empty vocabulary', () => {
    for (const def of Object.values(TRAITS)) {
      if (def.type === 'enum' || def.type === 'enum_list') {
        expect(def.values?.length ?? 0).toBeGreaterThan(0);
      } else {
        expect(def.values).toBeUndefined();
      }
    }
  });

  test('derived traits are flagged and never asked directly', () => {
    for (const key of ['age', 'age_band', 'age_eligible', 'state_status', 'bmi', 'segment']) {
      expect(isDerivedTrait(key)).toBe(true);
    }
    expect(isDerivedTrait('goal')).toBe(false);
    expect(isDerivedTrait('custom.anything')).toBe(false);
  });

  test('health-tier traits are registered (story 5.2) and exactly these', () => {
    // The registry says what the intake CAN ask; the publish validator still
    // refuses these until both PHI keys are on. Growing this list is a
    // deliberate act with compliance review, so the test pins it exactly.
    expect(traitsWithSensitivity('health').map((t) => t.key)).toEqual([
      'height_weight',
      'bmi',
      'medications',
      'conditions',
      'glp1_history',
      'pregnancy',
    ]);
    expect(traitsWithSensitivity('personal').map((t) => t.key)).toContain('date_of_birth');
    expect(traitsWithSensitivity('marketing').map((t) => t.key)).toContain('goal');
  });

  test('goal vocabulary is the five care areas plus not-sure', () => {
    expect(GOAL_VALUES).toEqual([
      'weight-metabolic',
      'body-comp-recovery',
      'beauty-skin',
      'energy',
      'stress-sleep',
      'not-sure',
    ]);
    expect(getTrait('goal')?.values).toEqual(GOAL_VALUES);
  });
});

describe('custom traits', () => {
  test('custom.<slug> keys are accepted and are marketing tier', () => {
    expect(customTraitKeySchema.safeParse('custom.workout_days').success).toBe(true);
    expect(isCustomTrait('custom.workout_days')).toBe(true);
    expect(sensitivityOf('custom.workout_days')).toBe('marketing');
    expect(isRegisteredTrait('custom.workout_days')).toBe(false);
    expect(getTrait('custom.workout_days')).toBeNull();
  });

  test('malformed custom keys are rejected', () => {
    for (const bad of ['custom.', 'custom.Workout', 'custom.1abc', 'custom.a-b', 'workout_days', 'custom..x']) {
      expect(isCustomTrait(bad)).toBe(false);
    }
    expect(sensitivityOf('nope')).toBeNull();
  });

  test('traitRef accepts registered and custom keys only', () => {
    expect(traitRefSchema.safeParse('goal').success).toBe(true);
    expect(traitRefSchema.safeParse('custom.goal_detail').success).toBe(true);
    expect(traitRefSchema.safeParse('height_cm').success).toBe(false);
  });
});

describe('trait values', () => {
  test('registered traits validate by type and vocabulary', () => {
    expect(validateTraitValue('goal', 'energy').success).toBe(true);
    expect(validateTraitValue('goal', 'cognition').success).toBe(false);
    expect(validateTraitValue('us_state', 'CA').success).toBe(true);
    expect(validateTraitValue('us_state', 'ZZ').success).toBe(false);
    expect(validateTraitValue('date_of_birth', '2000-02-29').success).toBe(true);
    expect(validateTraitValue('date_of_birth', '2001-02-29').success).toBe(false);
    expect(validateTraitValue('date_of_birth', '2026-13-40').success).toBe(false);
    expect(validateTraitValue('consent_terms', true).success).toBe(true);
    expect(validateTraitValue('consent_terms', 'yes').success).toBe(false);
    expect(validateTraitValue('weight_approaches_tried', ['diet', 'training']).success).toBe(true);
    expect(validateTraitValue('weight_approaches_tried', ['diet', 'diet']).success).toBe(false);
    expect(validateTraitValue('weight_approaches_tried', []).success).toBe(false);
    expect(validateTraitValue('first_name', '   ').success).toBe(false);
  });

  test('custom traits validate with the type their question declares', () => {
    expect(validateTraitValue('custom.days', 3, 'number').success).toBe(true);
    expect(validateTraitValue('custom.days', 'three', 'number').success).toBe(false);
    expect(validateTraitValue('custom.days', 3).success).toBe(false);
    expect(validateTraitValue('unknown_key', 3).success).toBe(false);
  });

  test('enum schemas without a vocabulary accept nothing', () => {
    expect(traitValueSchema('enum').safeParse('x').success).toBe(false);
    expect(traitValueSchema('enum_list').safeParse(['x']).success).toBe(false);
  });

  test('height and weight carry metric numbers within human bounds', () => {
    expect(traitValueSchema('height_weight').safeParse({ heightCm: 180, weightKg: 80 }).success).toBe(true);
    expect(traitValueSchema('height_weight').safeParse({ heightCm: 10, weightKg: 80 }).success).toBe(false);
  });

  test('iso dates must be real days', () => {
    expect(isoDateSchema.safeParse('2024-02-29').success).toBe(true);
    expect(isoDateSchema.safeParse('2023-02-29').success).toBe(false);
    expect(isoDateSchema.safeParse('2023-2-9').success).toBe(false);
  });
});

