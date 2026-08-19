import {
  getTrait,
  isCustomTrait,
  traitValueSchema,
  type TraitType,
} from '../profile/traits';
import { isLeaf, isSettingRef, type Condition, type ConditionLeaf, type ConditionOp } from './conditions';

/**
 * Static validation of a condition against the trait registry.
 *
 * Run at publish (and live in the admin builder): a rule that names an
 * unknown trait, uses `gt` on an enum, or compares against a value outside the
 * vocabulary is refused before it can ever evaluate. Custom traits are typed by
 * the question that asks them, so the caller passes their types in.
 */

export type ConditionIssueCode =
  | 'unknown_trait'
  | 'op_not_allowed'
  | 'value_required'
  | 'value_shape'
  | 'value_not_in_vocabulary'
  | 'setting_ref_not_allowed';

export interface ConditionIssue {
  /** JSON-pointer-ish path inside the condition, e.g. `all.1.not`. */
  path: string;
  code: ConditionIssueCode;
  message: string;
}

/** Which operators make sense for which trait types. */
const OPS_BY_TYPE: Readonly<Record<TraitType, readonly ConditionOp[]>> = {
  string: ['eq', 'neq', 'in', 'nin', 'contains', 'exists'],
  number: ['eq', 'neq', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'between', 'exists'],
  boolean: ['eq', 'neq', 'exists'],
  date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'exists'],
  enum: ['eq', 'neq', 'in', 'nin', 'exists'],
  enum_list: ['eq', 'neq', 'in', 'nin', 'contains', 'exists'],
  us_state: ['eq', 'neq', 'in', 'nin', 'exists'],
  height_weight: ['exists'],
};

export function allowedOpsFor(type: TraitType): readonly ConditionOp[] {
  return OPS_BY_TYPE[type];
}

export interface ValidateConditionOptions {
  /** Types of `custom.*` traits, from the questions that ask them. */
  customTypes?: Readonly<Record<string, TraitType>>;
}

export function validateCondition(
  cond: Condition,
  options: ValidateConditionOptions = {},
): ConditionIssue[] {
  const issues: ConditionIssue[] = [];
  walk(cond, '', options, issues);
  return issues;
}

function walk(cond: Condition, path: string, options: ValidateConditionOptions, issues: ConditionIssue[]) {
  if (isLeaf(cond)) {
    validateLeaf(cond, path || 'leaf', options, issues);
    return;
  }
  if ('all' in cond) {
    cond.all.forEach((c, i) => walk(c, `${path ? `${path}.` : ''}all.${i}`, options, issues));
  } else if ('any' in cond) {
    cond.any.forEach((c, i) => walk(c, `${path ? `${path}.` : ''}any.${i}`, options, issues));
  } else {
    walk(cond.not, `${path ? `${path}.` : ''}not`, options, issues);
  }
}

function validateLeaf(
  leaf: ConditionLeaf,
  path: string,
  options: ValidateConditionOptions,
  issues: ConditionIssue[],
) {
  const registered = getTrait(leaf.trait);
  const type: TraitType | undefined = registered
    ? registered.type
    : isCustomTrait(leaf.trait)
      ? options.customTypes?.[leaf.trait]
      : undefined;

  if (!type) {
    issues.push({
      path,
      code: 'unknown_trait',
      message: registered === null && isCustomTrait(leaf.trait)
        ? `No question asks ${leaf.trait}, so its type is unknown`
        : `Unknown trait ${leaf.trait}`,
    });
    return;
  }

  if (!OPS_BY_TYPE[type].includes(leaf.op)) {
    issues.push({ path, code: 'op_not_allowed', message: `${leaf.op} is not allowed on a ${type} trait` });
    return;
  }

  if (leaf.op === 'exists') {
    if (leaf.value !== undefined) {
      issues.push({ path, code: 'value_shape', message: 'exists takes no value' });
    }
    return;
  }

  if (leaf.value === undefined) {
    issues.push({ path, code: 'value_required', message: `${leaf.op} needs a value` });
    return;
  }

  if (isSettingRef(leaf.value)) {
    if (type !== 'number' && type !== 'date') {
      issues.push({
        path,
        code: 'setting_ref_not_allowed',
        message: 'Settings can only stand in for numbers and dates',
      });
    }
    return;
  }

  const vocabulary = registered?.values;
  // States have a closed vocabulary too (US_STATE_CODES), just not in `values`.
  const hasVocabulary = vocabulary !== undefined || type === 'us_state';
  const item = traitValueSchema(
    type === 'enum_list' ? 'enum' : type,
    vocabulary,
  );

  switch (leaf.op) {
    case 'in':
    case 'nin': {
      if (!Array.isArray(leaf.value) || leaf.value.length === 0) {
        issues.push({ path, code: 'value_shape', message: `${leaf.op} needs a non-empty list` });
        return;
      }
      for (const v of leaf.value) checkItem(v, item, hasVocabulary, path, issues);
      return;
    }
    case 'between': {
      if (!Array.isArray(leaf.value) || leaf.value.length !== 2) {
        issues.push({ path, code: 'value_shape', message: 'between needs [min, max]' });
        return;
      }
      for (const v of leaf.value) checkItem(v, item, false, path, issues);
      return;
    }
    case 'contains': {
      if (type === 'string') {
        if (typeof leaf.value !== 'string' || leaf.value.length === 0) {
          issues.push({ path, code: 'value_shape', message: 'contains needs text to look for' });
        }
        return;
      }
      checkItem(leaf.value, item, hasVocabulary, path, issues);
      return;
    }
    case 'eq':
    case 'neq': {
      if (type === 'enum_list') {
        const listSchema = traitValueSchema('enum_list', vocabulary);
        if (!listSchema.safeParse(leaf.value).success) {
          issues.push({
            path,
            code: hasVocabulary ? 'value_not_in_vocabulary' : 'value_shape',
            message: 'Value must be a list drawn from the vocabulary',
          });
        }
        return;
      }
      checkItem(leaf.value, item, hasVocabulary, path, issues);
      return;
    }
    default:
      checkItem(leaf.value, item, false, path, issues);
  }
}

function checkItem(
  value: unknown,
  schema: ReturnType<typeof traitValueSchema>,
  hasVocabulary: boolean,
  path: string,
  issues: ConditionIssue[],
) {
  if (schema.safeParse(value).success) return;
  issues.push({
    path,
    code: hasVocabulary ? 'value_not_in_vocabulary' : 'value_shape',
    message: hasVocabulary
      ? `${JSON.stringify(value)} is not one of the allowed values`
      : `${JSON.stringify(value)} has the wrong shape for this trait`,
  });
}
