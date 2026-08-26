import { describe, expect, test } from 'bun:test';
import { DEFAULT_INTAKE_FLOW } from '../onboarding/default-flow';
import { validateFlowDefinition } from '../onboarding/validate-flow';
import { answersAsObservations, projectObservations, type ObservationLike } from './projector';

const report = validateFlowDefinition(DEFAULT_INTAKE_FLOW, { phiEnabled: false });
if (!report.ok) throw new Error('fixture');
const ctx = {
  minimumAge: 18,
  serviceAreas: { CA: 'open' as const },
  now: new Date('2026-08-19T12:00:00Z'),
  segmentRules: report.definition.segmentRules,
};

const obs = (
  trait: string,
  value: unknown,
  source: ObservationLike['source'],
  observedAt: string,
  confidence?: number,
): ObservationLike => ({ trait, value, source, observedAt, ...(confidence !== undefined ? { confidence } : {}) });

describe('projectObservations', () => {
  test('folds to one value per trait with provenance, then derives', () => {
    const p = projectObservations(
      [
        obs('us_state', 'CA', 'onboarding', '2026-08-01T00:00:00Z'),
        obs('date_of_birth', '1992-03-04', 'onboarding', '2026-08-01T00:00:00Z'),
        obs('goal', 'weight-metabolic', 'onboarding', '2026-08-01T00:00:00Z'),
        obs('peptide_experience', 'some', 'onboarding', '2026-08-01T00:00:00Z'),
      ],
      ctx,
    );
    expect(p.flat).toMatchObject({
      us_state: 'CA',
      goal: 'weight-metabolic',
      age: 34,
      age_band: '25_34',
      age_eligible: true,
      state_status: 'open',
      segment: 'weight-experienced',
    });
    expect(p.traits.goal).toEqual({ value: 'weight-metabolic', source: 'onboarding', observedAt: '2026-08-01T00:00:00.000Z' });
    expect(p.traits.segment).toMatchObject({ value: 'weight-experienced', source: 'derived' });
    expect(p.segment).toBe('weight-experienced');
    expect(p.projectorVersion).toBe(1);
    expect(p.projectedAt).toBe('2026-08-19T12:00:00.000Z');
  });

  test('precedence: clinician > onboarding > companion > system; latest within a source', () => {
    const p = projectObservations(
      [
        obs('goal', 'energy', 'companion', '2026-08-10T00:00:00Z'),
        obs('goal', 'stress-sleep', 'onboarding', '2026-08-01T00:00:00Z'),
        obs('goal', 'beauty-skin', 'system', '2026-08-12T00:00:00Z'),
        obs('first_name', 'Sam', 'onboarding', '2026-08-01T00:00:00Z'),
        obs('first_name', 'Samantha', 'onboarding', '2026-08-02T00:00:00Z'),
        obs('first_name', 'S.', 'companion', '2026-08-03T00:00:00Z'),
        obs('peptide_experience', 'none', 'onboarding', '2026-08-03T00:00:00Z'),
        obs('peptide_experience', 'regular', 'clinician', '2026-07-01T00:00:00Z'),
      ],
      ctx,
    );
    expect(p.traits.goal?.source).toBe('onboarding');
    expect(p.flat.goal).toBe('stress-sleep');
    expect(p.flat.first_name).toBe('Samantha');
    expect(p.traits.peptide_experience).toMatchObject({ value: 'regular', source: 'clinician' });
  });

  test('confidence breaks exact ties; derived and empty observations are ignored', () => {
    const p = projectObservations(
      [
        obs('goal', 'energy', 'companion', '2026-08-10T00:00:00Z', 0.4),
        obs('goal', 'stress-sleep', 'companion', '2026-08-10T00:00:00Z', 0.9),
        obs('segment', 'hacked', 'onboarding', '2026-08-10T00:00:00Z'),
        obs('age', 99, 'derived', '2026-08-10T00:00:00Z'),
        obs('first_name', null, 'onboarding', '2026-08-10T00:00:00Z'),
      ],
      ctx,
    );
    expect(p.flat.goal).toBe('stress-sleep');
    expect(p.flat.segment).toBe('energy' === p.flat.goal ? 'energy' : 'sleep-first');
    expect(p.flat.age).toBeUndefined();
    expect(p.flat.first_name).toBeUndefined();
  });

  test('answersAsObservations reshapes path answers', () => {
    const at = new Date('2026-08-19T12:00:00Z');
    expect(
      answersAsObservations(
        [
          { trait: 'goal', value: 'energy', source: 'companion' },
          { trait: 'us_state', value: 'CA', source: 'onboarding' },
        ],
        at,
      ),
    ).toEqual([
      { trait: 'goal', value: 'energy', source: 'companion', observedAt: at },
      { trait: 'us_state', value: 'CA', source: 'onboarding', observedAt: at },
    ]);
  });
});
