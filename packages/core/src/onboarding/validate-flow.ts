import {
  getTrait,
  isCustomTrait,
  isDerivedTrait,
  isRegisteredTrait,
  sensitivityOf,
  type TraitType,
} from '../profile/traits';
import { conditionTraits, type Condition } from '../rules/conditions';
import { validateCondition } from '../rules/validate';
import {
  ELIGIBILITY_SECTION_KEY,
  FLOW_SCHEMA_VERSION,
  LOCKED_SECTIONS,
  TRAIT_TYPE_FOR_QUESTION,
  flowDefinitionSchema,
  type FlowDefinition,
  type FlowQuestion,
} from './schemas';

/**
 * The publish validator. Every rule here is something the engine would
 * otherwise discover at runtime in front of a visitor: a question bound to a
 * trait that does not exist, a gate comparing an enum with `gt`, a health-tier
 * question published before the PHI keys are turned, a locked section quietly
 * removed. It runs on the server at publish and live in the admin editor, and
 * the report it returns is what the editor shows.
 *
 * Errors block publishing. Warnings are shown and do not.
 */

export type FlowIssueCode =
  | 'schema'
  | 'schema_version_unsupported'
  | 'question_key_mismatch'
  | 'duplicate_section_key'
  | 'unknown_question'
  | 'question_in_multiple_sections'
  | 'orphan_question'
  | 'unknown_trait'
  | 'derived_trait_asked'
  | 'type_mismatch'
  | 'options_required'
  | 'options_not_allowed'
  | 'option_not_in_vocabulary'
  | 'duplicate_option'
  | 'trait_asked_twice'
  | 'phi_locked'
  | 'condition'
  | 'trait_never_asked'
  | 'locked_section_missing'
  | 'locked_section_altered'
  | 'missing_copy'
  | 'duplicate_segment';

export interface FlowIssue {
  /** Where in the definition, e.g. `sections.2.gates.0.when.all.1`. */
  path: string;
  code: FlowIssueCode;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  errors: FlowIssue[];
  warnings: FlowIssue[];
}

export interface ValidateFlowOptions {
  /** Both PHI keys are on: `PHI_READY` and the `onboarding_health` flag. */
  phiEnabled: boolean;
  /** The newest schema version this build can run. */
  supportedSchemaVersion?: number;
}

export type ValidateFlowResult =
  | (ValidationReport & { ok: true; definition: FlowDefinition })
  | (ValidationReport & { ok: false; definition?: undefined });

export function validateFlowDefinition(input: unknown, options: ValidateFlowOptions): ValidateFlowResult {
  const errors: FlowIssue[] = [];
  const warnings: FlowIssue[] = [];
  const supported = options.supportedSchemaVersion ?? FLOW_SCHEMA_VERSION;

  // A definition from a newer build must be refused as a whole, before the
  // schema (which only knows this build's shape) produces a wall of noise.
  const declared = (input as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof declared === 'number' && declared > supported) {
    errors.push({
      path: 'schemaVersion',
      code: 'schema_version_unsupported',
      message: `This definition is schema version ${declared}; this build supports up to ${supported}`,
    });
    return { ok: false, errors, warnings };
  }

  const parsed = flowDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({ path: issue.path.join('.'), code: 'schema', message: issue.message });
    }
    return { ok: false, errors, warnings };
  }
  const def = parsed.data;

  // --- Keys and references -------------------------------------------------
  const sectionKeys = new Set<string>();
  def.sections.forEach((section, i) => {
    if (sectionKeys.has(section.key)) {
      errors.push({ path: `sections.${i}.key`, code: 'duplicate_section_key', message: `Section key ${section.key} is used twice` });
    }
    sectionKeys.add(section.key);
  });

  for (const [key, question] of Object.entries(def.questions)) {
    if (question.key !== key) {
      errors.push({
        path: `questions.${key}.key`,
        code: 'question_key_mismatch',
        message: `Question is stored under ${key} but says its key is ${question.key}`,
      });
    }
  }

  const sectionOfQuestion = new Map<string, string>();
  def.sections.forEach((section, si) => {
    section.questions.forEach((qKey, qi) => {
      const path = `sections.${si}.questions.${qi}`;
      if (!def.questions[qKey]) {
        errors.push({ path, code: 'unknown_question', message: `Section ${section.key} asks ${qKey}, which is not in the bank` });
        return;
      }
      const already = sectionOfQuestion.get(qKey);
      if (already) {
        errors.push({
          path,
          code: 'question_in_multiple_sections',
          message: `${qKey} is asked in both ${already} and ${section.key}`,
        });
        return;
      }
      sectionOfQuestion.set(qKey, section.key);
    });
  });
  for (const key of Object.keys(def.questions)) {
    if (!sectionOfQuestion.has(key)) {
      warnings.push({ path: `questions.${key}`, code: 'orphan_question', message: `${key} is in the bank but no section asks it` });
    }
  }

  // --- Trait bindings ------------------------------------------------------
  const customTypes: Record<string, TraitType> = {};
  const askedTraits = new Map<string, string>(); // trait -> question key
  for (const [key, question] of Object.entries(def.questions)) {
    const path = `questions.${key}`;
    validateQuestionBinding(question, path, options, errors, warnings);
    if (isCustomTrait(question.trait)) {
      customTypes[question.trait] = TRAIT_TYPE_FOR_QUESTION[question.type];
    }
    const earlier = askedTraits.get(question.trait);
    if (earlier && sectionOfQuestion.has(key) && sectionOfQuestion.has(earlier)) {
      warnings.push({
        path: `${path}.trait`,
        code: 'trait_asked_twice',
        message: `${question.trait} is asked by both ${earlier} and ${key}; the later answer wins`,
      });
    }
    if (!earlier) askedTraits.set(question.trait, key);
  }

  // --- Conditions ----------------------------------------------------------
  const checkCondition = (cond: Condition, path: string) => {
    for (const issue of validateCondition(cond, { customTypes })) {
      errors.push({ path: `${path}.${issue.path}`, code: 'condition', message: issue.message });
    }
    for (const trait of conditionTraits(cond)) {
      if (isDerivedTrait(trait)) continue;
      if (askedTraits.has(trait)) continue;
      if (!isRegisteredTrait(trait) && !isCustomTrait(trait)) continue; // already an error above
      warnings.push({
        path,
        code: 'trait_never_asked',
        message: `This rule reads ${trait}, which no question in this flow asks; it can only be true for a returning member`,
      });
    }
  };
  def.sections.forEach((section, si) => {
    if (section.showIf) checkCondition(section.showIf, `sections.${si}.showIf`);
    section.gates.forEach((gate, gi) => {
      checkCondition(gate.when, `sections.${si}.gates.${gi}.when`);
      for (const suffix of ['title', 'body']) {
        if (!(`${gate.copyKey}.${suffix}` in def.copy)) {
          errors.push({
            path: `sections.${si}.gates.${gi}.copyKey`,
            code: 'missing_copy',
            message: `Copy ${gate.copyKey}.${suffix} is missing`,
          });
        }
      }
    });
  });
  for (const [key, question] of Object.entries(def.questions)) {
    if (question.showIf) checkCondition(question.showIf, `questions.${key}.showIf`);
  }
  const seenSegments = new Set<string>();
  def.segmentRules.forEach((rule, i) => {
    checkCondition(rule.when, `segmentRules.${i}.when`);
    if (seenSegments.has(rule.segment)) {
      warnings.push({ path: `segmentRules.${i}.segment`, code: 'duplicate_segment', message: `Segment ${rule.segment} has more than one rule` });
    }
    seenSegments.add(rule.segment);
  });

  // --- Locked sections -----------------------------------------------------
  const first = def.sections[0];
  if (!first || first.key !== ELIGIBILITY_SECTION_KEY) {
    errors.push({
      path: 'sections.0',
      code: 'locked_section_missing',
      message: `The first section must be ${ELIGIBILITY_SECTION_KEY}`,
    });
  }
  for (const [sectionKey, rule] of Object.entries(LOCKED_SECTIONS)) {
    const index = def.sections.findIndex((s) => s.key === sectionKey);
    const section = def.sections[index];
    if (!section) {
      errors.push({ path: 'sections', code: 'locked_section_missing', message: `Section ${sectionKey} is required` });
      continue;
    }
    const path = `sections.${index}`;
    if (!section.locked) {
      errors.push({ path: `${path}.locked`, code: 'locked_section_altered', message: `Section ${sectionKey} must stay locked` });
    }
    const asked = section.questions.map((k) => def.questions[k]).filter((q): q is FlowQuestion => Boolean(q));
    for (const trait of rule.traits) {
      const q = asked.find((x) => x.trait === trait);
      if (!q) {
        errors.push({ path, code: 'locked_section_altered', message: `Section ${sectionKey} must ask ${trait}` });
        continue;
      }
      if (!q.locked) {
        errors.push({ path: `questions.${q.key}.locked`, code: 'locked_section_altered', message: `${q.key} must stay locked` });
      }
      if (rule.requiredTraits.includes(trait) && !q.required) {
        errors.push({ path: `questions.${q.key}.required`, code: 'locked_section_altered', message: `${q.key} must stay required` });
      }
    }
  }
  if (first?.key === ELIGIBILITY_SECTION_KEY) {
    const reasons = new Set(first.gates.map((g) => g.reason));
    if (!reasons.has('age') || !reasons.has('state')) {
      errors.push({
        path: 'sections.0.gates',
        code: 'locked_section_altered',
        message: 'The eligibility section must keep an age gate and a state gate',
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors, warnings };
  return { ok: true, errors, warnings, definition: def };
}

function validateQuestionBinding(
  question: FlowQuestion,
  path: string,
  options: ValidateFlowOptions,
  errors: FlowIssue[],
  warnings: FlowIssue[],
) {
  const registered = getTrait(question.trait);
  const custom = isCustomTrait(question.trait);
  if (!registered && !custom) {
    errors.push({ path: `${path}.trait`, code: 'unknown_trait', message: `Unknown trait ${question.trait}` });
    return;
  }
  if (registered?.derived) {
    errors.push({
      path: `${path}.trait`,
      code: 'derived_trait_asked',
      message: `${question.trait} is computed, it cannot be asked`,
    });
    return;
  }

  const produces = TRAIT_TYPE_FOR_QUESTION[question.type];
  if (registered && registered.type !== produces) {
    errors.push({
      path: `${path}.type`,
      code: 'type_mismatch',
      message: `A ${question.type} question produces a ${produces}; ${question.trait} is a ${registered.type}`,
    });
  }

  const isSelect = question.type === 'single_select' || question.type === 'multi_select';
  if (isSelect && !question.options) {
    errors.push({ path: `${path}.options`, code: 'options_required', message: `${question.type} questions need options` });
  }
  if (!isSelect && question.options) {
    errors.push({ path: `${path}.options`, code: 'options_not_allowed', message: `${question.type} questions do not take options` });
  }
  if (question.options) {
    const values = question.options.map((o) => o.value);
    if (new Set(values).size !== values.length) {
      errors.push({ path: `${path}.options`, code: 'duplicate_option', message: 'Option values must be unique' });
    }
    if (registered?.values) {
      for (const v of values) {
        if (!registered.values.includes(v)) {
          errors.push({
            path: `${path}.options`,
            code: 'option_not_in_vocabulary',
            message: `${v} is not a value ${question.trait} allows`,
          });
        }
      }
    }
  }

  const tier = sensitivityOf(question.trait);
  if (tier === 'health' && !options.phiEnabled) {
    errors.push({
      path: `${path}.trait`,
      code: 'phi_locked',
      message: `${question.trait} is a medical question. Publishing is locked until the Before-PHI checklist is complete and both PHI keys are on.`,
    });
  }
  if (tier === 'health' && options.phiEnabled) {
    warnings.push({ path: `${path}.trait`, code: 'phi_locked', message: `${question.trait} is health-tier; answers are PHI once linked to a member` });
  }
}

/**
 * A hash of the logic of a definition: structure, bindings, rules and options,
 * with every piece of copy stripped. Two versions with the same logic hash ask
 * the same things in the same order for the same reasons; a session can move
 * between them without losing its place. Used by the flow service to forward
 * in-progress sessions over copy-only publishes.
 */
export async function logicHash(def: FlowDefinition): Promise<string> {
  const logical = {
    schemaVersion: def.schemaVersion,
    key: def.key,
    sections: def.sections.map((s) => ({
      key: s.key,
      showIf: s.showIf ?? null,
      questions: s.questions,
      gates: s.gates.map((g) => ({ key: g.key, when: g.when, outcome: g.outcome, reason: g.reason })),
      locked: s.locked,
    })),
    questions: Object.fromEntries(
      Object.entries(def.questions)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, q]) => [
          key,
          {
            trait: q.trait,
            type: q.type,
            options: q.options?.map((o) => o.value) ?? null,
            constraints: q.constraints ?? null,
            required: q.required,
            showIf: q.showIf ?? null,
            locked: q.locked,
          },
        ]),
    ),
    segmentRules: def.segmentRules.map((r) => ({ segment: r.segment, when: r.when, priority: r.priority })),
  };
  const bytes = new TextEncoder().encode(canonicalJson(logical));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** JSON with object keys sorted at every level, so equal structures hash equal. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}
