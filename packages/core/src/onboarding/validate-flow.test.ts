import { describe, expect, test } from 'bun:test';
import { sensitivityOf } from '../profile/traits';
import { DEFAULT_INTAKE_FLOW } from './default-flow';
import { canonicalJson, logicHash, validateFlowDefinition, type FlowIssueCode } from './validate-flow';
import type { FlowDefinitionInput } from './schemas';

const base = (): FlowDefinitionInput => structuredClone(DEFAULT_INTAKE_FLOW) as FlowDefinitionInput;
const errorCodes = (input: unknown, phiEnabled = false): FlowIssueCode[] =>
  validateFlowDefinition(input, { phiEnabled }).errors.map((e) => e.code);
const warningCodes = (input: unknown): FlowIssueCode[] =>
  validateFlowDefinition(input, { phiEnabled: false }).warnings.map((e) => e.code);

describe('the default intake flow', () => {
  test('validates with no errors and no warnings', () => {
    const report = validateFlowDefinition(DEFAULT_INTAKE_FLOW, { phiEnabled: false });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
  });

  test('asks only marketing and personal traits', () => {
    expect(errorCodes(DEFAULT_INTAKE_FLOW, false)).not.toContain('phi_locked');
  });

  test('has copy for every gate and the intro', () => {
    const def = DEFAULT_INTAKE_FLOW;
    for (const key of ['intro.title', 'intro.body', 'gate.under_age.title', 'gate.state_notify.body']) {
      expect(def.copy[key as keyof typeof def.copy]).toBeTruthy();
    }
  });
});

describe('schema level', () => {
  test('refuses a newer schema version as a whole', () => {
    const def = { ...base(), schemaVersion: 2 };
    const report = validateFlowDefinition(def, { phiEnabled: false });
    expect(report.ok).toBe(false);
    expect(report.errors).toEqual([
      expect.objectContaining({ code: 'schema_version_unsupported', path: 'schemaVersion' }),
    ]);
  });

  test('zod issues surface with their path', () => {
    const def = base();
    def.sections[0]!.title = '';
    expect(validateFlowDefinition(def, { phiEnabled: false }).errors).toEqual([
      expect.objectContaining({ code: 'schema', path: 'sections.0.title' }),
    ]);
  });
});

describe('keys and references', () => {
  test('a section asking an unknown question', () => {
    const def = base();
    def.sections[1]!.questions.push('mystery');
    expect(errorCodes(def)).toContain('unknown_question');
  });

  test('a question stored under the wrong key', () => {
    const def = base();
    def.questions.goal!.key = 'primary_goal';
    expect(errorCodes(def)).toContain('question_key_mismatch');
  });

  test('duplicate section keys and a question in two sections', () => {
    const def = base();
    def.sections.push({ key: 'goal', title: 'Again', questions: ['goal'] });
    const codes = errorCodes(def);
    expect(codes).toContain('duplicate_section_key');
    expect(codes).toContain('question_in_multiple_sections');
  });

  test('a bank question no section asks is a warning', () => {
    const def = base();
    def.questions.spare = {
      key: 'spare',
      trait: 'custom.spare',
      type: 'text',
      copy: { label: 'Spare?' },
    };
    expect(warningCodes(def)).toContain('orphan_question');
    expect(errorCodes(def)).toEqual([]);
  });
});

describe('trait bindings', () => {
  test('unknown and derived traits cannot be asked', () => {
    const def = base();
    def.questions.goal!.trait = 'age';
    expect(errorCodes(def)).toContain('derived_trait_asked');
    const def2 = base();
    def2.questions.goal!.trait = 'nope';
    // traitRefSchema rejects it first, as a schema issue on the trait path.
    expect(validateFlowDefinition(def2, { phiEnabled: false }).errors[0]).toMatchObject({ path: 'questions.goal.trait' });
  });

  test('question type must produce the trait type', () => {
    const def = base();
    def.questions.goal!.type = 'text';
    delete def.questions.goal!.options;
    expect(errorCodes(def)).toContain('type_mismatch');
  });

  test('select questions need options drawn from the vocabulary, others take none', () => {
    const def = base();
    delete def.questions.goal!.options;
    expect(errorCodes(def)).toContain('options_required');

    const def2 = base();
    def2.questions.goal!.options!.push({ value: 'cognition', label: 'Cognition' });
    expect(errorCodes(def2)).toContain('option_not_in_vocabulary');

    const def3 = base();
    def3.questions.goal!.options!.push({ value: 'energy', label: 'Energy again' });
    expect(errorCodes(def3)).toContain('duplicate_option');

    const def4 = base();
    def4.questions.first_name!.options = [{ value: 'a', label: 'A' }];
    expect(errorCodes(def4)).toContain('options_not_allowed');
  });

  test('custom traits are allowed and typed by the question', () => {
    const def = base();
    def.questions.workout_days = {
      key: 'workout_days',
      trait: 'custom.workout_days',
      type: 'number',
      copy: { label: 'Workouts per week?' },
      constraints: { min: 0, max: 14 },
    };
    def.sections[3]!.questions.push('workout_days');
    def.sections[3]!.showIf = { trait: 'custom.workout_days', op: 'gte', value: 0 };
    const report = validateFlowDefinition(def, { phiEnabled: false });
    expect(report.errors).toEqual([]);
  });
});

describe('conditions', () => {
  test('a condition on a section, question, gate or segment rule is validated against the registry', () => {
    const def = base();
    def.sections[2]!.showIf = { trait: 'goal', op: 'gt', value: 'weight-metabolic' };
    def.questions.goal_note!.showIf = { trait: 'goal', op: 'eq', value: 'cognition' };
    def.sections[0]!.gates![1]!.when = { trait: 'state_status', op: 'contains', value: 'notify' };
    def.segmentRules![0]!.when = { trait: 'peptide_experience', op: 'contains', value: 'none' };
    const report = validateFlowDefinition(def, { phiEnabled: false });
    const conditionErrors = report.errors.filter((e) => e.code === 'condition');
    expect(conditionErrors).toHaveLength(4);
    expect(conditionErrors.map((e) => e.path)).toEqual([
      'sections.0.gates.1.when.leaf',
      'sections.2.showIf.leaf',
      'questions.goal_note.showIf.leaf',
      'segmentRules.0.when.leaf',
    ]);
  });

  test('an unknown trait inside a condition is refused by the schema with its path', () => {
    const def = base();
    def.sections[0]!.gates![0]!.when = { trait: 'height_cm', op: 'lt', value: 18 } as never;
    const report = validateFlowDefinition(def, { phiEnabled: false });
    expect(report.ok).toBe(false);
    expect(report.errors[0]?.code).toBe('schema');
    expect(report.errors[0]?.path).toContain('sections.0.gates.0.when');
  });

  test('a rule over a trait nothing asks is a warning', () => {
    const def = base();
    def.sections[3]!.showIf = { trait: 'goal_timeline', op: 'eq', value: '3mo' };
    // goal_timeline IS asked (weight_timeline), so no warning; a never-asked one warns.
    expect(warningCodes(def)).not.toContain('trait_never_asked');
    def.sections[3]!.showIf = { trait: 'consent_marketing', op: 'eq', value: true };
    expect(warningCodes(def)).not.toContain('trait_never_asked');
    def.sections[3]!.showIf = { trait: 'email', op: 'exists' };
    expect(warningCodes(def)).toContain('trait_never_asked');
  });

  test('gate copy must exist', () => {
    const def = base();
    def.sections[0]!.gates![0]!.copyKey = 'gate.nope';
    expect(errorCodes(def)).toContain('missing_copy');
  });
});

describe('locked sections', () => {
  test('eligibility must come first, stay locked, keep its questions and gates', () => {
    const def = base();
    const [eligibility, ...rest] = def.sections;
    def.sections = [...rest, eligibility!];
    expect(errorCodes(def)).toContain('locked_section_missing');

    const def2 = base();
    def2.sections[0]!.locked = false;
    expect(errorCodes(def2)).toContain('locked_section_altered');

    const def3 = base();
    def3.sections[0]!.questions = ['us_state'];
    expect(errorCodes(def3)).toContain('locked_section_altered');

    const def4 = base();
    def4.sections[0]!.gates = def4.sections[0]!.gates!.filter((g) => g.reason !== 'age');
    expect(errorCodes(def4)).toContain('locked_section_altered');

    const def5 = base();
    def5.questions.date_of_birth!.required = false;
    expect(errorCodes(def5)).toContain('locked_section_altered');
  });

  test('consent must exist and keep the terms question', () => {
    const def = base();
    def.sections = def.sections.filter((s) => s.key !== 'consent');
    expect(errorCodes(def)).toContain('locked_section_missing');
  });
});

describe('PHI lock', () => {
  // The v1 registry holds no health-tier trait by construction (story 5.2
  // registers the first), so these tests inject the tier through the tierOf
  // override the validator exposes for exactly this reason.
  const asHealth =
    (trait: string) =>
    (key: string) =>
      key === trait ? ('health' as const) : sensitivityOf(key);

  test('the registry-only flow produces no phi_locked either way', () => {
    expect(errorCodes(base(), false)).not.toContain('phi_locked');
    expect(errorCodes(base(), true)).not.toContain('phi_locked');
  });

  test('a health-tier question blocks publishing while the keys are off', () => {
    const report = validateFlowDefinition(base(), { phiEnabled: false, tierOf: asHealth('goal_note') });
    expect(report.ok).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: 'phi_locked', path: 'questions.goal_note.trait' }),
    );
  });

  test('with both keys on the same question publishes, downgraded to a PHI warning', () => {
    const report = validateFlowDefinition(base(), { phiEnabled: true, tierOf: asHealth('goal_note') });
    expect(report.ok).toBe(true);
    expect(report.errors.map((e) => e.code)).not.toContain('phi_locked');
    expect(report.warnings).toContainEqual(
      expect.objectContaining({ code: 'phi_locked', path: 'questions.goal_note.trait' }),
    );
  });

  test('every key combination: only PHI_READY and the flag together unlock', () => {
    // phiEnabled is the AND of the two keys, composed in apps/api/src/services.ts;
    // this mirrors that composition through the validator for each combination.
    for (const ready of [false, true]) {
      for (const flag of [false, true]) {
        const phiEnabled = ready && flag;
        const codes = validateFlowDefinition(base(), { phiEnabled, tierOf: asHealth('goal_note') }).errors.map(
          (e) => e.code,
        );
        if (phiEnabled) expect(codes).not.toContain('phi_locked');
        else expect(codes).toContain('phi_locked');
      }
    }
  });
});

describe('logic hash', () => {
  test('ignores copy, respects structure', async () => {
    const a = validateFlowDefinition(base(), { phiEnabled: false });
    const copyChanged = base();
    copyChanged.copy['intro.title'] = 'Hello there.';
    copyChanged.questions.goal!.copy.label = 'What first?';
    copyChanged.sections[1]!.title = 'Your goal';
    copyChanged.completion.body = 'Different words.';
    const b = validateFlowDefinition(copyChanged, { phiEnabled: false });
    const logicChanged = base();
    logicChanged.sections[2]!.showIf = { trait: 'goal', op: 'in', value: ['weight-metabolic', 'energy'] };
    const c = validateFlowDefinition(logicChanged, { phiEnabled: false });
    if (!a.ok || !b.ok || !c.ok) throw new Error('fixtures must validate');
    const [ha, hb, hc] = await Promise.all([logicHash(a.definition), logicHash(b.definition), logicHash(c.definition)]);
    expect(ha).toBe(hb);
    expect(ha).not.toBe(hc);
    expect(ha).toMatch(/^[0-9a-f]{64}$/);
  });

  test('canonical json sorts keys at every level', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [{ f: 1, e: 2 }] } })).toBe('{"a":{"c":[{"e":2,"f":1}],"d":2},"b":1}');
  });
});
