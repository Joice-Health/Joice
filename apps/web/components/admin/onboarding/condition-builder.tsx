'use client';

import {
  CONDITION_OPS,
  TRAITS,
  TRAIT_TYPE_FOR_QUESTION,
  allowedOpsFor,
  isCustomTrait,
  type Condition,
  type ConditionOp,
  type FlowDefinition,
} from '@joice/core/schemas';
import { Button, Input, cn } from '@joice/ui';
import { AdminSelect } from '@/components/admin/fields';

/**
 * "Show this when": rows of trait / operator / value joined by ALL or ANY.
 * Admins never see an expression; the builder emits the condition DSL. It
 * covers what the flows actually use (a leaf, or one all/any group of
 * leaves); a hand-written deeper rule is shown read-only as JSON and kept
 * intact until an engineer edits it.
 */

type Leaf = { trait: string; op: ConditionOp; value?: unknown };

function asLeafGroup(cond: Condition | undefined): { mode: 'all' | 'any'; leaves: Leaf[] } | null {
  if (!cond) return { mode: 'all', leaves: [] };
  if ('trait' in cond) return { mode: 'all', leaves: [cond as Leaf] };
  if ('all' in cond && cond.all.every((c) => 'trait' in c)) return { mode: 'all', leaves: cond.all as Leaf[] };
  if ('any' in cond && cond.any.every((c) => 'trait' in c)) return { mode: 'any', leaves: cond.any as Leaf[] };
  return null;
}

function toCondition(mode: 'all' | 'any', leaves: Leaf[]): Condition | undefined {
  if (leaves.length === 0) return undefined;
  if (leaves.length === 1) return leaves[0] as Condition;
  return (mode === 'all' ? { all: leaves } : { any: leaves }) as Condition;
}

/** Traits a rule may reference: every registered trait plus the flow's custom ones. */
function traitOptions(definition: FlowDefinition): Array<{ key: string; label: string }> {
  const custom = Object.values(definition.questions)
    .map((q) => q.trait)
    .filter((t) => isCustomTrait(t))
    .map((t) => ({ key: t, label: t }));
  const registered = Object.values(TRAITS).map((t) => ({ key: t.key, label: t.label }));
  return [...registered, ...custom.filter((c, i, all) => all.findIndex((x) => x.key === c.key) === i)];
}

function opsFor(definition: FlowDefinition, trait: string): readonly ConditionOp[] {
  const def = TRAITS[trait as keyof typeof TRAITS];
  if (def) return allowedOpsFor(def.type);
  const question = Object.values(definition.questions).find((q) => q.trait === trait);
  if (question) return allowedOpsFor(TRAIT_TYPE_FOR_QUESTION[question.type]);
  return CONDITION_OPS;
}

export function ConditionBuilder({
  definition,
  value,
  onChange,
  label,
}: {
  definition: FlowDefinition;
  value: Condition | undefined;
  onChange: (next: Condition | undefined) => void;
  label: string;
}) {
  const group = asLeafGroup(value);
  if (!group) {
    return (
      <div>
        <p className="mono-label text-muted">{label}</p>
        <p className="mt-1 text-xs text-muted">
          This rule is nested beyond what the builder edits; it is kept as written.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-canvas p-3 text-xs">{JSON.stringify(value, null, 2)}</pre>
      </div>
    );
  }
  const { mode, leaves } = group;
  const options = traitOptions(definition);
  const set = (leavesNext: Leaf[], modeNext: 'all' | 'any' = mode) => onChange(toCondition(modeNext, leavesNext));

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="mono-label text-muted">{label}</p>
        {leaves.length > 1 ? (
          <div className="flex gap-1">
            {(['all', 'any'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set(leaves, m)}
                className={cn(
                  'mono-label rounded-full px-2 py-1',
                  m === mode ? 'bg-ink text-canvas' : 'text-muted hover:text-ink',
                )}
              >
                {m === 'all' ? 'All must match' : 'Any may match'}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {leaves.length === 0 ? <p className="mt-1 text-xs text-muted">Always shown.</p> : null}

      <div className="mt-2 flex flex-col gap-2">
        {leaves.map((leaf, i) => {
          const ops = opsFor(definition, leaf.trait);
          const needsValue = leaf.op !== 'exists';
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <AdminSelect
                size="sm"
                aria-label="Trait"
                value={leaf.trait}
                onChange={(e) => {
                  const trait = e.target.value;
                  const nextOps = opsFor(definition, trait);
                  set(leaves.map((l, j) => (j === i ? { trait, op: nextOps.includes(l.op) ? l.op : nextOps[0]!, value: undefined } : l)));
                }}
              >
                {options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
              <AdminSelect
                size="sm"
                aria-label="Operator"
                value={leaf.op}
                onChange={(e) => set(leaves.map((l, j) => (j === i ? { ...l, op: e.target.value as ConditionOp } : l)))}
              >
                {ops.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </AdminSelect>
              {needsValue ? (
                <Input
                  aria-label="Value"
                  value={valueToText(leaf.value)}
                  placeholder={['in', 'nin', 'between'].includes(leaf.op) ? 'a, b' : 'value'}
                  onChange={(e) => set(leaves.map((l, j) => (j === i ? { ...l, value: textToValue(e.target.value, leaf.op) } : l)))}
                  className="h-9 max-w-56 bg-canvas px-3 text-sm"
                />
              ) : null}
              <Button type="button" variant="ghost" size="sm" onClick={() => set(leaves.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2"
        onClick={() => set([...leaves, { trait: 'goal', op: 'eq', value: '' }])}
      >
        Add a rule +
      </Button>
    </div>
  );
}

function valueToText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Lists for in/nin/between; numbers and booleans typed as themselves; else text. */
function textToValue(text: string, op: ConditionOp): unknown {
  const scalar = (s: string): unknown => {
    const t = s.trim();
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t !== '' && !Number.isNaN(Number(t)) && !/^0\d/.test(t) && !/^\d{4}-/.test(t)) return Number(t);
    return t;
  };
  if (['in', 'nin', 'between'].includes(op)) return text.split(',').map(scalar);
  return scalar(text);
}
