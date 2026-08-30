import { evaluateCondition, type TraitMap } from '../rules/evaluate';
import type { ProtocolMatch, ProtocolRules } from './schemas';

/**
 * Every rule whose condition holds for the traits, ranked by priority (higher
 * first, authoring order on ties). Pure: no db, no clock. Unlike segments this
 * returns ALL matches, not one winner: a clinician reviewing a recommendation
 * wants the alternatives visible, and the simulator wants to show an admin
 * everything a persona qualifies for.
 */
export function evaluateProtocolRules(rules: ProtocolRules, traits: TraitMap): ProtocolMatch[] {
  const matches: ProtocolMatch[] = [];
  for (const rule of rules) {
    const { value, why } = evaluateCondition(rule.when, traits);
    if (!value) continue;
    matches.push({
      protocolKey: rule.protocolKey,
      label: rule.label,
      priority: rule.priority,
      requiresClinician: rule.requiresClinician,
      why,
    });
  }
  return matches.sort((a, b) => b.priority - a.priority);
}
