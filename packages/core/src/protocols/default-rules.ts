import type { ProtocolRules } from './schemas';

/**
 * The example rule set: the default the settings row falls back to, the
 * fixture the tests table over, and the shape an admin sees before anyone
 * authors real rules. Deliberately small and legible. Real protocols arrive
 * with the protocol catalogue and clinical sign-off; until then these only
 * ever surface in the admin simulator.
 */
export const DEFAULT_PROTOCOL_RULES: ProtocolRules = [
  {
    protocolKey: 'weight-clinical-priority',
    label: 'Weight: clinical priority review',
    when: {
      all: [
        { trait: 'goal', op: 'eq', value: 'weight-metabolic' },
        { trait: 'bmi', op: 'gte', value: 30 },
      ],
    },
    priority: 30,
    requiresClinician: true,
  },
  {
    protocolKey: 'weight-experienced',
    label: 'Weight: experienced starter',
    when: {
      all: [
        { trait: 'goal', op: 'eq', value: 'weight-metabolic' },
        { trait: 'peptide_experience', op: 'in', value: ['some', 'regular'] },
      ],
    },
    priority: 20,
    requiresClinician: true,
  },
  {
    protocolKey: 'weight-newcomer',
    label: 'Weight: first protocol',
    when: {
      all: [
        { trait: 'goal', op: 'eq', value: 'weight-metabolic' },
        { trait: 'peptide_experience', op: 'eq', value: 'none' },
      ],
    },
    priority: 10,
    requiresClinician: true,
  },
  {
    protocolKey: 'sleep-first',
    label: 'Stress and sleep: foundations',
    when: { trait: 'goal', op: 'eq', value: 'stress-sleep' },
    priority: 10,
    requiresClinician: true,
  },
];
