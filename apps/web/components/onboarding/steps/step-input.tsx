'use client';

import { US_STATES } from '@joice/utils';
import { Input } from '@joice/ui';
import { cn } from '@joice/ui';
import type { StepView } from '@joice/api-client';
import { ChoicePills } from './choice-pills';

type QuestionView = Extract<StepView, { kind: 'question' }>['question'];

/**
 * One input per question type, all controlled: the runner owns the draft
 * value, validates nothing itself (the server does, against the pinned
 * definition) and only decides whether "Continue" is enabled. Height/weight
 * arrives with the health tier (story 5.2).
 */
export function StepInput({
  question,
  value,
  onChange,
  today,
}: {
  question: QuestionView;
  value: unknown;
  onChange: (value: unknown) => void;
  /** ISO date of today, for the date max. */
  today: string;
}) {
  const id = `q-${question.key}`;
  switch (question.type) {
    case 'single_select':
      return (
        <ChoicePills
          name={question.key}
          options={question.options ?? []}
          selected={typeof value === 'string' ? [value] : []}
          multiple={false}
          onChange={(next) => onChange(next[0] ?? null)}
        />
      );
    case 'multi_select':
      return (
        <ChoicePills
          name={question.key}
          options={question.options ?? []}
          selected={Array.isArray(value) ? (value as string[]) : []}
          multiple
          onChange={(next) => onChange(next.length > 0 ? next : null)}
        />
      );
    case 'us_state':
      return (
        <select
          id={id}
          aria-label={question.copy.label}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={cn(
            'h-12 w-full max-w-sm appearance-none rounded-full bg-surface px-5 text-base text-ink',
            'outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-brand-600/50',
          )}
        >
          <option value="">Choose your state</option>
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      );
    case 'date':
      return (
        <Input
          id={id}
          type="date"
          aria-label={question.copy.label}
          value={typeof value === 'string' ? value : ''}
          min={question.constraints?.minDate ?? '1900-01-01'}
          max={question.constraints?.maxDate ?? today}
          onChange={(e) => onChange(e.target.value || null)}
          className="max-w-xs"
        />
      );
    case 'text':
      return (
        <Input
          id={id}
          type="text"
          aria-label={question.copy.label}
          placeholder={question.copy.placeholder}
          value={typeof value === 'string' ? value : ''}
          maxLength={question.constraints?.maxLength ?? 500}
          autoComplete={question.key === 'first_name' ? 'given-name' : 'off'}
          onChange={(e) => onChange(e.target.value || null)}
          className="max-w-md"
        />
      );
    case 'number':
    case 'scale': {
      if (question.type === 'scale') {
        const min = question.constraints?.min ?? 1;
        const max = question.constraints?.max ?? 5;
        const options = Array.from({ length: max - min + 1 }, (_, i) => String(min + i)).map((v) => ({ value: v, label: v }));
        return (
          <ChoicePills
            name={question.key}
            options={options}
            selected={typeof value === 'number' ? [String(value)] : []}
            multiple={false}
            onChange={(next) => onChange(next[0] !== undefined ? Number(next[0]) : null)}
          />
        );
      }
      return (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          aria-label={question.copy.label}
          placeholder={question.copy.placeholder}
          value={typeof value === 'number' ? String(value) : ''}
          min={question.constraints?.min}
          max={question.constraints?.max}
          step={question.constraints?.step}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="max-w-xs"
        />
      );
    }
    case 'boolean':
      return (
        <label className="flex cursor-pointer items-center gap-3 text-base text-ink">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="size-5 accent-ink"
          />
          <span>{question.key.startsWith('consent') ? 'Yes, I agree' : 'Yes'}</span>
        </label>
      );
    case 'height_weight':
      return (
        <p className="text-sm text-muted">This question type is not available yet.</p>
      );
    default:
      return null;
  }
}

/** Whether the draft value is enough to submit (the server does the real validation). */
export function hasValue(question: QuestionView, value: unknown): boolean {
  // An optional checkbox may be submitted unticked (as false).
  if (question.type === 'boolean') return question.required ? value === true : true;
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** The value to send: an unticked checkbox is `false`, not missing. */
export function valueToSubmit(question: QuestionView, value: unknown): unknown {
  if (question.type === 'boolean') return value === true;
  return value;
}
