import type { Profile } from '@joice/db';
import { usStateName } from '@joice/utils';
import type { MemberProfileView, SessionState } from '../onboarding/schemas';
import type { ProjectedTrait } from './projector';
import { GOAL_LABELS, getTrait, isCustomTrait, sensitivityOf, type Sensitivity } from './traits';

/**
 * The member's own view of their profile: one row per trait with a label and
 * a readable value, filtered to the tiers the caller may see. Pure; the api
 * composes it from the profile row and the member's intake state.
 */
export function memberProfileView(input: {
  memberId: string;
  email: string | null;
  firstName: string | null;
  profile: Profile | null;
  intake: SessionState | null;
  /** Tiers the caller may see; health only with the PHI keys. */
  tiers?: readonly Sensitivity[];
}): MemberProfileView {
  const tiers = input.tiers ?? ['marketing', 'personal'];
  const traits = (input.profile?.traits ?? {}) as Record<string, ProjectedTrait>;
  const rows = Object.entries(traits)
    .filter(([key]) => {
      const tier = sensitivityOf(key);
      return tier !== null && tiers.includes(tier) && !key.startsWith('consent_');
    })
    .map(([key, t]) => ({
      key,
      label: getTrait(key)?.label ?? (isCustomTrait(key) ? key.slice('custom.'.length).replace(/_/g, ' ') : key),
      value: formatTraitValue(key, t.value),
      source: t.source,
      observedAt: t.observedAt,
    }));
  const goal = typeof traits.goal?.value === 'string' ? traits.goal.value : null;
  const firstName =
    (typeof traits.first_name?.value === 'string' ? traits.first_name.value : null) ?? input.firstName ?? null;
  return {
    memberId: input.memberId,
    email: input.email,
    firstName,
    goal,
    goalLabel: goal && goal in GOAL_LABELS ? GOAL_LABELS[goal as keyof typeof GOAL_LABELS] : null,
    segment: input.profile?.segment ?? null,
    traits: rows,
    intake: input.intake,
  };
}

function formatTraitValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (key === 'us_state' && typeof value === 'string') return usStateName(value);
  if (key === 'goal' && typeof value === 'string' && value in GOAL_LABELS) return GOAL_LABELS[value as keyof typeof GOAL_LABELS];
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
