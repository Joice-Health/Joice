import type { AGE_BANDS, ServiceAreaStatus } from './traits';
import { evaluateCondition, type TraitMap, type WhyNode } from '../rules/evaluate';
import type { SegmentRule } from '../onboarding/schemas';

/**
 * Derived traits: computed from other traits, never asked. The engine runs
 * this after every answer (gates read `age` and `state_status`), the projector
 * runs it when it folds observations into a profile, and the simulator shows
 * the trace. Versioned code, not config: a change here is a deploy.
 */

export interface DeriveContext {
  /** The age gate threshold (settings row `onboarding`, default 18). */
  minimumAge: number;
  /** State code to status; a state that is not listed is `notify`. */
  serviceAreas: Readonly<Record<string, ServiceAreaStatus>>;
  /** Injected clock, so tests and the simulator can pick a day. */
  now: Date;
  /** Segment rules from the flow definition; highest priority wins, first wins ties. */
  segmentRules?: readonly SegmentRule[];
}

export type AgeBand = (typeof AGE_BANDS)[number];

/** Whole years between an ISO date of birth and `now`, in UTC calendar terms. */
export function ageOn(dateOfBirth: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number) as [number, number, number, number];
  const birth = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(birth.getTime()) || birth.getTime() > now.getTime()) return null;
  let age = now.getUTCFullYear() - y;
  const hadBirthday =
    now.getUTCMonth() > mo - 1 || (now.getUTCMonth() === mo - 1 && now.getUTCDate() >= d);
  if (!hadBirthday) age -= 1;
  return age;
}

export function ageBand(age: number): AgeBand {
  if (age < 18) return 'under_18';
  if (age < 25) return '18_24';
  if (age < 35) return '25_34';
  if (age < 45) return '35_44';
  if (age < 55) return '45_54';
  if (age < 65) return '55_64';
  return '65_plus';
}

export interface DerivationTrace {
  trait: string;
  from: string[];
  value: unknown;
  why?: WhyNode;
}

export interface Derived {
  traits: TraitMap;
  trace: DerivationTrace[];
}

/**
 * Returns `base` plus every derived trait that can be computed from it. Derived
 * keys already present in `base` are recomputed, never trusted.
 */
export function deriveTraits(base: TraitMap, ctx: DeriveContext): Derived {
  const traits: Record<string, unknown> = { ...base };
  const trace: DerivationTrace[] = [];
  for (const key of ['age', 'age_band', 'age_eligible', 'state_status', 'bmi', 'segment']) delete traits[key];

  const dob = traits.date_of_birth;
  if (typeof dob === 'string') {
    const age = ageOn(dob, ctx.now);
    if (age !== null) {
      traits.age = age;
      traits.age_band = ageBand(age);
      traits.age_eligible = age >= ctx.minimumAge;
      trace.push({ trait: 'age', from: ['date_of_birth'], value: age });
      trace.push({ trait: 'age_band', from: ['age'], value: traits.age_band });
      trace.push({ trait: 'age_eligible', from: ['age', 'setting onboarding.minimumAge'], value: traits.age_eligible });
    }
  }

  // BMI from the metric height_weight value, one decimal. Health tier like its
  // source: it exists only when a health question was publishable and answered.
  const hw = traits.height_weight;
  if (
    typeof hw === 'object' &&
    hw !== null &&
    typeof (hw as { heightCm?: unknown }).heightCm === 'number' &&
    typeof (hw as { weightKg?: unknown }).weightKg === 'number'
  ) {
    const { heightCm, weightKg } = hw as { heightCm: number; weightKg: number };
    if (heightCm > 0) {
      const bmi = Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10;
      traits.bmi = bmi;
      trace.push({ trait: 'bmi', from: ['height_weight'], value: bmi });
    }
  }

  const state = traits.us_state;
  if (typeof state === 'string' && state.length > 0) {
    const status: ServiceAreaStatus = ctx.serviceAreas[state] ?? 'notify';
    traits.state_status = status;
    trace.push({ trait: 'state_status', from: ['us_state', 'service_areas'], value: status });
  }

  if (ctx.segmentRules && ctx.segmentRules.length > 0) {
    let best: { rule: SegmentRule; why: WhyNode } | null = null;
    for (const rule of ctx.segmentRules) {
      const { value, why } = evaluateCondition(rule.when, traits);
      if (!value) continue;
      if (!best || rule.priority > best.rule.priority) best = { rule, why };
    }
    if (best) {
      traits.segment = best.rule.segment;
      trace.push({ trait: 'segment', from: ['segment rules'], value: best.rule.segment, why: best.why });
    }
  }

  return { traits, trace };
}
