'use client';

import {
  QUESTION_TYPES,
  TRAITS,
  TRAIT_TYPE_FOR_QUESTION,
  isCustomTrait,
  sensitivityOf,
  type FlowDefinition,
  type FlowQuestion,
} from '@joice/core/schemas';
import { Button, Input, cn } from '@joice/ui';
import { Badge } from '@/components/admin/ui';
import { ConditionBuilder } from './condition-builder';

/**
 * One question: its copy, options, binding and rule. Locked questions
 * (eligibility, consent terms) show everything and let nothing structural
 * change: the publish validator refuses removals anyway, so the editor says it
 * up front. A health-tier binding wears the lock in plain words.
 */
export function QuestionEditor({
  definition,
  questionKey,
  onChange,
}: {
  definition: FlowDefinition;
  questionKey: string;
  onChange: (next: FlowQuestion) => void;
}) {
  const question = definition.questions[questionKey];
  if (!question) return null;
  const tier = sensitivityOf(question.trait);
  const locked = question.locked;
  const isSelect = question.type === 'single_select' || question.type === 'multi_select';
  const registered = TRAITS[question.trait as keyof typeof TRAITS];
  const set = (patch: Partial<FlowQuestion>) => onChange({ ...question, ...patch });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mono-label text-muted">{question.key}</span>
        {tier ? <Badge tone={tier === 'health' ? 'suspended' : tier === 'personal' ? 'invited' : 'active'}>{tier}</Badge> : null}
        {locked ? <Badge tone="pending">locked</Badge> : null}
        {!question.required ? <Badge tone="pending">optional</Badge> : null}
      </div>

      {tier === 'health' ? (
        <p className="rounded-xl bg-canvas p-3 text-sm text-ink">
          Medical question. Publishing is locked until the Before-PHI checklist is complete and both PHI
          keys are on. Everything else here can still be edited and saved as a draft.
        </p>
      ) : null}
      {locked ? (
        <p className="text-xs text-muted">
          A locked question keeps its binding, type and required flag; the wording is yours to change.
        </p>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="mono-label text-muted">Question</span>
        <Input value={question.copy.label} onChange={(e) => set({ copy: { ...question.copy, label: e.target.value } })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="mono-label text-muted">Help text</span>
        <Input
          value={question.copy.help ?? ''}
          placeholder="Why we ask, in one line"
          onChange={(e) => set({ copy: { ...question.copy, help: e.target.value || undefined } })}
        />
      </label>
      {question.type === 'text' ? (
        <label className="flex flex-col gap-1">
          <span className="mono-label text-muted">Placeholder</span>
          <Input
            value={question.copy.placeholder ?? ''}
            onChange={(e) => set({ copy: { ...question.copy, placeholder: e.target.value || undefined } })}
          />
        </label>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="mono-label text-muted">Type</span>
          <select
            value={question.type}
            disabled={locked}
            onChange={(e) => {
              const type = e.target.value as FlowQuestion['type'];
              const select = type === 'single_select' || type === 'multi_select';
              set({ type, options: select ? (question.options ?? []) : undefined });
            }}
            className="h-10 rounded-full bg-canvas px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50 disabled:text-muted"
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="mono-label text-muted">Writes the trait</span>
          <select
            value={isCustomTrait(question.trait) ? '__custom__' : question.trait}
            disabled={locked}
            onChange={(e) => set({ trait: e.target.value === '__custom__' ? 'custom.new_trait' : e.target.value })}
            className="h-10 rounded-full bg-canvas px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50 disabled:text-muted"
          >
            {Object.values(TRAITS)
              .filter((t) => !t.derived && (t.type === TRAIT_TYPE_FOR_QUESTION[question.type] || t.key === question.trait))
              .map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label} ({t.key})
                </option>
              ))}
            <option value="__custom__">custom trait…</option>
          </select>
        </label>
      </div>
      {isCustomTrait(question.trait) ? (
        <label className="flex flex-col gap-1">
          <span className="mono-label text-muted">Custom trait key (custom.snake_case; always marketing tier)</span>
          <Input value={question.trait} onChange={(e) => set({ trait: e.target.value })} className="max-w-sm font-mono text-sm" />
        </label>
      ) : null}

      <label className={cn('flex items-center gap-2', locked && 'opacity-60')}>
        <input
          type="checkbox"
          checked={question.required}
          disabled={locked}
          onChange={(e) => set({ required: e.target.checked })}
          className="size-4 accent-ink"
        />
        <span className="text-sm text-ink">An answer is required</span>
      </label>

      {isSelect ? (
        <OptionList
          options={question.options ?? []}
          vocabulary={registered?.values}
          onChange={(options) => set({ options })}
        />
      ) : null}

      <ConditionBuilder
        definition={definition}
        value={question.showIf}
        onChange={(showIf) => set({ showIf })}
        label="Show this question when"
      />
    </div>
  );
}

function OptionList({
  options,
  vocabulary,
  onChange,
}: {
  options: NonNullable<FlowQuestion['options']>;
  vocabulary?: readonly string[];
  onChange: (next: NonNullable<FlowQuestion['options']>) => void;
}) {
  return (
    <div>
      <p className="mono-label text-muted">Options</p>
      {vocabulary ? (
        <p className="mt-1 text-xs text-muted">Values must come from the trait's vocabulary: {vocabulary.join(', ')}</p>
      ) : null}
      <div className="mt-2 flex flex-col gap-2">
        {options.map((option, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Value"
              value={option.value}
              placeholder="value"
              onChange={(e) => onChange(options.map((o, j) => (j === i ? { ...o, value: e.target.value } : o)))}
              className="h-9 max-w-44 px-3 font-mono text-xs"
            />
            <Input
              aria-label="Label"
              value={option.label}
              placeholder="What the visitor reads"
              onChange={(e) => onChange(options.map((o, j) => (j === i ? { ...o, label: e.target.value } : o)))}
              className="h-9 max-w-72 px-3 text-sm"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(options.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => onChange([...options, { value: '', label: '' }])}>
        Add an option +
      </Button>
    </div>
  );
}
