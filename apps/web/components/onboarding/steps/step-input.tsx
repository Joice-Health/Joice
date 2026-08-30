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
 * is collected imperial and stored metric; see the draft helpers below.
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
    case 'height_weight': {
      const draft = heightWeightDraft(value);
      const set = (patch: Partial<HeightWeightDraft>) => {
        const next = { ...draft, ...patch };
        onChange(next.feet == null && next.inches == null && next.pounds == null ? null : next);
      };
      const field = (
        label: string,
        key: keyof HeightWeightDraft,
        max: number,
        width = 'w-24',
      ) => (
        <label className="flex flex-col gap-1.5">
          <span className="mono-label text-muted">{label}</span>
          <Input
            type="number"
            inputMode="numeric"
            aria-label={`${question.copy.label}: ${label}`}
            value={draft[key] == null ? '' : String(draft[key])}
            min={0}
            max={max}
            onChange={(e) =>
              set({ [key]: e.target.value === '' ? undefined : Number(e.target.value) })
            }
            className={width}
          />
        </label>
      );
      return (
        <div className="flex flex-wrap items-end gap-4">
          {field('Height ft', 'feet', 8)}
          {field('in', 'inches', 11)}
          <span aria-hidden className="pb-3 text-stone">
            ·
          </span>
          {field('Weight lb', 'pounds', 1100, 'w-28')}
        </div>
      );
    }
    default:
      return null;
  }
}

/**
 * The height/weight draft is what the member typed (imperial, the US product
 * default); the stored trait value is metric (`{ heightCm, weightKg }`,
 * traits.ts heightWeightSchema). Conversion happens once at the submit
 * boundary, and a server-sent metric value converts once for display, so
 * neither side ever round-trips through the other mid-typing.
 */
interface HeightWeightDraft {
  feet?: number;
  inches?: number;
  pounds?: number;
}

function heightWeightDraft(value: unknown): HeightWeightDraft {
  if (typeof value !== 'object' || value === null) return {};
  const v = value as Record<string, unknown>;
  if (typeof v.heightCm === 'number' && typeof v.weightKg === 'number') {
    const totalIn = Math.round(v.heightCm / 2.54);
    return {
      feet: Math.floor(totalIn / 12),
      inches: totalIn % 12,
      pounds: Math.round(v.weightKg / 0.45359237),
    };
  }
  return v as HeightWeightDraft;
}

function heightWeightToMetric(value: unknown): { heightCm: number; weightKg: number } | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.heightCm === 'number' && typeof v.weightKg === 'number') {
    return { heightCm: v.heightCm, weightKg: v.weightKg };
  }
  const { feet, inches, pounds } = v as HeightWeightDraft;
  if (typeof feet !== 'number' || typeof pounds !== 'number') return null;
  const totalIn = feet * 12 + (typeof inches === 'number' ? inches : 0);
  if (totalIn <= 0 || pounds <= 0) return null;
  return {
    heightCm: Math.round(totalIn * 2.54 * 10) / 10,
    weightKg: Math.round(pounds * 0.45359237 * 10) / 10,
  };
}

/** Whether the draft value is enough to submit (the server does the real validation). */
export function hasValue(question: QuestionView, value: unknown): boolean {
  // An optional checkbox may be submitted unticked (as false).
  if (question.type === 'boolean') return question.required ? value === true : true;
  if (question.type === 'height_weight') return heightWeightToMetric(value) !== null;
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** The value to send: an unticked checkbox is `false`, not missing. */
export function valueToSubmit(question: QuestionView, value: unknown): unknown {
  if (question.type === 'boolean') return value === true;
  if (question.type === 'height_weight') return heightWeightToMetric(value);
  return value;
}
