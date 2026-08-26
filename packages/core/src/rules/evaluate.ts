import { isoDateSchema } from '../profile/traits';
import { isLeaf, isSettingRef, type Condition, type ConditionLeaf, type ConditionOp } from './conditions';

/**
 * Pure evaluation of a condition over a trait map, with a "why" trace.
 *
 * The trace exists for three readers: the admin simulator ("why did that
 * question appear?"), support ("why was this person gated?") and, later, a
 * clinician reviewing a protocol rule. Every leaf records what it expected,
 * what it saw, and whether the trait was present at all.
 *
 * Semantics worth knowing:
 * - A missing trait (undefined, null, empty string, empty list) makes every
 *   leaf false except `exists`, which is false too; use `{ not: { exists } }`
 *   for "is missing". Rules therefore never pass by accident on a trait that
 *   was skipped or not yet asked.
 * - Ordering ops compare numbers as numbers and ISO dates as dates; mixed or
 *   non-comparable types are false, never coerced.
 * - `in` / `nin` accept a list value; a list-valued trait (enum_list) matches
 *   `in` when any of its items is in the list and `nin` when none is.
 * - `contains` is "list contains item" for enum_list and a case-insensitive
 *   substring for strings.
 * - A `{ setting }` value is resolved from the settings map first; an unknown
 *   setting makes the leaf false and says so in the trace.
 */

export type TraitMap = Readonly<Record<string, unknown>>;
export type SettingsMap = Readonly<Record<string, unknown>>;

export interface WhyLeaf {
  kind: 'leaf';
  result: boolean;
  trait: string;
  op: ConditionOp;
  expected: unknown;
  actual: unknown;
  present: boolean;
  note?: string;
}
export interface WhyGroup {
  kind: 'all' | 'any' | 'not';
  result: boolean;
  children: WhyNode[];
}
export type WhyNode = WhyLeaf | WhyGroup;

export interface Evaluation {
  value: boolean;
  why: WhyNode;
}

export function evaluateCondition(
  cond: Condition,
  traits: TraitMap,
  settings: SettingsMap = {},
): Evaluation {
  if (isLeaf(cond)) {
    const why = evaluateLeaf(cond, traits, settings);
    return { value: why.result, why };
  }
  if ('all' in cond) {
    const children = cond.all.map((c) => evaluateCondition(c, traits, settings).why);
    const result = children.every((c) => c.result);
    return { value: result, why: { kind: 'all', result, children } };
  }
  if ('any' in cond) {
    const children = cond.any.map((c) => evaluateCondition(c, traits, settings).why);
    const result = children.some((c) => c.result);
    return { value: result, why: { kind: 'any', result, children } };
  }
  const inner = evaluateCondition(cond.not, traits, settings).why;
  return { value: !inner.result, why: { kind: 'not', result: !inner.result, children: [inner] } };
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function evaluateLeaf(leaf: ConditionLeaf, traits: TraitMap, settings: SettingsMap): WhyLeaf {
  const actual = traits[leaf.trait];
  const present = isPresent(actual);
  const base = { kind: 'leaf' as const, trait: leaf.trait, op: leaf.op, actual, present };

  let expected: unknown = leaf.value;
  if (isSettingRef(leaf.value)) {
    const resolved = settings[leaf.value.setting];
    if (resolved === undefined) {
      return { ...base, result: false, expected: leaf.value, note: `setting ${leaf.value.setting} is not set` };
    }
    expected = resolved;
  }

  if (leaf.op === 'exists') {
    return { ...base, result: present, expected: undefined };
  }
  if (!present) {
    return { ...base, result: false, expected, note: 'trait not present' };
  }

  switch (leaf.op) {
    case 'eq':
      return { ...base, result: looseEquals(actual, expected), expected };
    case 'neq':
      return { ...base, result: !looseEquals(actual, expected), expected };
    case 'in': {
      if (!Array.isArray(expected)) return { ...base, result: false, expected, note: 'expected a list' };
      return { ...base, result: anyIn(actual, expected), expected };
    }
    case 'nin': {
      if (!Array.isArray(expected)) return { ...base, result: false, expected, note: 'expected a list' };
      return { ...base, result: !anyIn(actual, expected), expected };
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const cmp = compare(actual, expected);
      if (cmp === null) return { ...base, result: false, expected, note: 'values are not comparable' };
      const result =
        leaf.op === 'gt' ? cmp > 0 : leaf.op === 'gte' ? cmp >= 0 : leaf.op === 'lt' ? cmp < 0 : cmp <= 0;
      return { ...base, result, expected };
    }
    case 'between': {
      if (!Array.isArray(expected) || expected.length !== 2) {
        return { ...base, result: false, expected, note: 'expected [min, max]' };
      }
      const lo = compare(actual, expected[0]);
      const hi = compare(actual, expected[1]);
      if (lo === null || hi === null) return { ...base, result: false, expected, note: 'values are not comparable' };
      return { ...base, result: lo >= 0 && hi <= 0, expected };
    }
    case 'contains': {
      if (Array.isArray(actual)) return { ...base, result: actual.some((v) => looseEquals(v, expected)), expected };
      if (typeof actual === 'string' && typeof expected === 'string') {
        return { ...base, result: actual.toLowerCase().includes(expected.toLowerCase()), expected };
      }
      return { ...base, result: false, expected, note: 'contains needs a list or a string' };
    }
  }
  return { ...base, result: false, expected, note: 'unknown operator' };
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].map(String).sort();
    const sb = [...b].map(String).sort();
    return sa.every((v, i) => v === sb[i]);
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

function anyIn(actual: unknown, list: unknown[]): boolean {
  const items = Array.isArray(actual) ? actual : [actual];
  return items.some((item) => list.some((candidate) => looseEquals(item, candidate)));
}

/** Numbers as numbers, ISO dates as dates; anything else is not comparable. */
function compare(a: unknown, b: unknown): number | null {
  if (typeof a === 'number' && typeof b === 'number') {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return a === b ? 0 : a < b ? -1 : 1;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    if (!isoDateSchema.safeParse(a).success || !isoDateSchema.safeParse(b).success) return null;
    return a === b ? 0 : a < b ? -1 : 1; // ISO dates order lexically
  }
  return null;
}
