'use client';

import {
  QUESTION_TYPES,
  TRAITS,
  TRAIT_TYPE_FOR_QUESTION,
  isCustomTrait,
  isProtectedQuestion,
  sensitivityOf,
  type FlowDefinition,
  type FlowQuestion,
} from '@joice/core/schemas';
import { Button, Input, cn } from '@joice/ui';
import { Badge } from '@/components/admin/ui';
import { AdminSelect } from '@/components/admin/fields';
import { ConditionBuilder } from './condition-builder';

/**
 * One question: its copy, options, binding and rule. Locked questions (the
 * eligibility core: state and date of birth) show everything and let nothing
 * structural change: the publish validator refuses removals anyway, so the
 * editor says it up front. A health-tier binding wears the lock in plain words.
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
  // Protection comes from LOCKED_SECTIONS in core (what the publish validator
  // enforces), not the stored locked flag, so the editor and the validator
  // can never disagree about what is editable.
  const sectionKey = definition.sections.find((s) => s.questions.includes(questionKey))?.key ?? '';
  const locked = isProtectedQuestion(sectionKey, question.trait);
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
        <Input
          value={question.copy.label}
          onChange={(e) => set({ copy: { ...question.copy, label: e.target.value } })}
          className="bg-canvas"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="mono-label text-muted">Help text</span>
        <Input
          value={question.copy.help ?? ''}
          placeholder="Why we ask, in one line"
          onChange={(e) => set({ copy: { ...question.copy, help: e.target.value || undefined } })}
          className="bg-canvas"
        />
      </label>
      {question.type === 'text' ? (
        <label className="flex flex-col gap-1">
          <span className="mono-label text-muted">Placeholder</span>
          <Input
            value={question.copy.placeholder ?? ''}
            onChange={(e) => set({ copy: { ...question.copy, placeholder: e.target.value || undefined } })}
            className="bg-canvas"
          />
        </label>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="mono-label text-muted">Type</span>
          <AdminSelect
            value={question.type}
            disabled={locked}
            onChange={(e) => {
              const type = e.target.value as FlowQuestion['type'];
              const select = type === 'single_select' || type === 'multi_select';
              set({ type, options: select ? (question.options ?? []) : undefined });
            }}
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </AdminSelect>
        </label>
        <label className="flex flex-col gap-1">
          <span className="mono-label text-muted">Writes the trait</span>
          <AdminSelect
            value={isCustomTrait(question.trait) ? '__custom__' : question.trait}
            disabled={locked}
            onChange={(e) => set({ trait: e.target.value === '__custom__' ? 'custom.new_trait' : e.target.value })}
          >
            {Object.values(TRAITS)
              .filter((t) => !t.derived && (t.type === TRAIT_TYPE_FOR_QUESTION[question.type] || t.key === question.trait))
              .map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label} ({t.key})
                </option>
              ))}
            <option value="__custom__">custom trait…</option>
          </AdminSelect>
        </label>
      </div>
      {isCustomTrait(question.trait) ? (
        <label className="flex flex-col gap-1">
          <span className="mono-label text-muted">Custom trait key (custom.snake_case; always marketing tier)</span>
          <Input value={question.trait} onChange={(e) => set({ trait: e.target.value })} className="max-w-sm bg-canvas font-code text-sm" />
        </label>
      ) : null}

      <label className={cn('flex items-center gap-2', locked && 'opacity-60')}>
        <input
          type="checkbox"
          checked={question.required}
          disabled={locked}
          onChange={(e) => set({ required: e.target.checked })}
          className="size-4 accent-brand-600"
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
              className="h-9 max-w-44 bg-canvas px-3 font-code text-xs"
            />
            <Input
              aria-label="Label"
              value={option.label}
              placeholder="What the visitor reads"
              onChange={(e) => onChange(options.map((o, j) => (j === i ? { ...o, label: e.target.value } : o)))}
              className="h-9 max-w-72 bg-canvas px-3 text-sm"
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
