'use client';

import { useState, type FormEvent } from 'react';
import { Button, Input, cn } from '@joice/ui';
import { isValidEmail, type CaptureStep } from '@joice/brain/schemas';

/**
 * The inline capture widgets — the "UI renders the right input" half of the
 * companion. The assistant asks in words (a text turn); this renders the
 * matching control below it: a text field for name, an email field for email,
 * quick-reply chips for goal. Each is skippable, because knowledge is never
 * gated behind giving contact info.
 *
 * These only collect and validate on the client for immediate feedback; the
 * server validates again and is the authority (see the profile service).
 */

export interface CaptureHandlers {
  onSubmit: (value: string, note?: string) => void;
  onSkip: () => void;
  /** True while the submit is in flight — disables the controls. */
  busy: boolean;
  /** Server-side rejection for this field, shown inline. */
  error?: string;
}

export function CaptureWidget({ step, handlers }: { step: CaptureStep; handlers: CaptureHandlers }) {
  if (step.input.type === 'choice') {
    return <GoalChips step={step} handlers={handlers} />;
  }
  return <FreeTextCapture step={step} handlers={handlers} />;
}

function SkipButton({ onSkip, busy }: { onSkip: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onSkip}
      disabled={busy}
      className="font-mono text-[10px] tracking-[0.15em] text-muted/70 uppercase transition-colors hover:text-muted disabled:opacity-50"
    >
      Skip
    </button>
  );
}

/** Name (text) and email (email) — a labelled field with client validation. */
function FreeTextCapture({ step, handlers }: { step: CaptureStep; handlers: CaptureHandlers }) {
  const [value, setValue] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const isEmail = step.input.type === 'email';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    if (isEmail && !isValidEmail(trimmed)) {
      setLocalError("That doesn't look like an email address.");
      return;
    }
    setLocalError(null);
    handlers.onSubmit(trimmed);
  };

  const error = localError ?? handlers.error;

  return (
    <form onSubmit={submit} className="max-w-sm">
      <div className="flex items-center gap-2">
        <Input
          type={isEmail ? 'email' : 'text'}
          inputMode={isEmail ? 'email' : 'text'}
          autoComplete={isEmail ? 'email' : 'name'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={handlers.busy}
          autoFocus
          aria-label={step.prompt}
          aria-invalid={Boolean(error)}
          className={cn(error && 'ring-2 ring-red-400')}
        />
        <Button type="submit" disabled={handlers.busy || !value.trim()}>
          {handlers.busy ? '…' : 'Next'}
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-3">
        {step.skippable ? <SkipButton onSkip={handlers.onSkip} busy={handlers.busy} /> : null}
        {error ? (
          <span className="text-sm text-red-600" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </form>
  );
}

/** Goal — the care areas plus "not sure" as tappable chips. */
function GoalChips({ step, handlers }: { step: CaptureStep; handlers: CaptureHandlers }) {
  return (
    <div className="max-w-xl">
      <div className="flex flex-wrap gap-2">
        {step.input.choices?.map((choice) => (
          <button
            key={choice.value}
            type="button"
            disabled={handlers.busy}
            onClick={() => handlers.onSubmit(choice.value)}
            className="rounded-full bg-surface px-4 py-2 text-sm text-ink shadow-[0_10px_28px_-20px_rgba(40,35,25,0.6)] transition-all hover:-translate-y-0.5 hover:bg-brand-400/12 disabled:opacity-50"
          >
            {choice.label}
          </button>
        ))}
      </div>
      {step.skippable ? (
        <div className="mt-3">
          <SkipButton onSkip={handlers.onSkip} busy={handlers.busy} />
        </div>
      ) : null}
    </div>
  );
}
