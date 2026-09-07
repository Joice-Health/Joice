'use client';

import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { Button } from '@joice/ui';

/**
 * The checkout step chrome, the intake's QuestionShell idioms without its
 * server-driven runner: one form per step, a fieldset whose single disabled
 * flag stills the whole step while a call is in flight, a legend that takes
 * focus when the step changes (keyboard and screen-reader users land on the
 * question, not in a void), one solid forward action, a ghost Back.
 */
export function StepShell({
  stepKey,
  title,
  help,
  error,
  busy,
  submitLabel,
  onSubmit,
  onBack,
  children,
}: {
  stepKey: string;
  title: string;
  help?: string;
  /** The step-level error line; field-level errors live on the fields. */
  error?: string | null;
  busy: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onBack?: () => void;
  children: ReactNode;
}) {
  const legendRef = useRef<HTMLLegendElement>(null);
  useEffect(() => {
    legendRef.current?.focus();
  }, [stepKey]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} noValidate key={stepKey}>
      <fieldset disabled={busy} className="flex flex-col items-start">
        <legend
          ref={legendRef}
          tabIndex={-1}
          className="display text-balance text-3xl text-ink outline-none sm:text-4xl"
        >
          {title}
        </legend>
        {help ? (
          <p className="mt-4 max-w-md text-pretty leading-relaxed text-muted">{help}</p>
        ) : null}

        <div className="mt-8 flex w-full max-w-md flex-col gap-6">{children}</div>

        {error ? (
          <p className="mt-6 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-10 flex w-full max-w-md flex-wrap items-center gap-3 border-t border-line pt-6">
          <Button type="submit" variant="solid">
            {busy ? 'One moment…' : submitLabel}
          </Button>
          {onBack ? (
            <Button type="button" variant="ghost" className="ml-auto" onClick={onBack}>
              ← Back
            </Button>
          ) : null}
        </div>
      </fieldset>
    </form>
  );
}
