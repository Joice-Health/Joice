'use client';

import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { Button } from '@joice/ui';
import { cn } from '@joice/ui';

/**
 * The frame every question renders in: a fieldset whose legend is the
 * question, help text wired through aria-describedby, an error that announces
 * itself, and the three actions (Back, Skip when optional, Continue +). Focus
 * moves to the legend on every new question so keyboard and screen-reader
 * visitors land on the question, not on the page top.
 */
export function QuestionShell({
  questionKey,
  label,
  help,
  error,
  required,
  canGoBack,
  canContinue,
  busy,
  onBack,
  onSkip,
  onSubmit,
  children,
}: {
  questionKey: string;
  label: string;
  help?: string;
  error?: string | null;
  required: boolean;
  canGoBack: boolean;
  canContinue: boolean;
  busy: boolean;
  onBack: () => void;
  onSkip: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const legendRef = useRef<HTMLLegendElement>(null);
  useEffect(() => {
    legendRef.current?.focus();
  }, [questionKey]);

  const helpId = `${questionKey}-help`;
  const errorId = `${questionKey}-error`;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (canContinue && !busy) onSubmit();
  }

  return (
    <form onSubmit={submit} noValidate className="animate-fade-up" key={questionKey}>
      <fieldset aria-describedby={cn(help && helpId, error && errorId) || undefined} disabled={busy}>
        <legend
          ref={legendRef}
          tabIndex={-1}
          className="text-balance text-2xl leading-snug text-ink outline-none sm:text-3xl"
        >
          {label}
          {!required ? (
            <>
              {' '}
              <span className="mono-label ml-3 align-middle text-muted">(optional)</span>
            </>
          ) : null}
        </legend>
        {help ? (
          <p id={helpId} className="mt-3 max-w-xl text-pretty text-sm leading-relaxed text-muted">
            {help}
          </p>
        ) : null}
        <div className="mt-8">{children}</div>
        {error ? (
          <p id={errorId} className="mt-4 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </fieldset>

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <Button type="submit" variant="solid" size="lg" disabled={!canContinue || busy}>
          {busy ? 'Saving…' : 'Continue +'}
        </Button>
        {!required ? (
          <Button type="button" variant="ghost" size="lg" onClick={onSkip} disabled={busy}>
            Skip for now
          </Button>
        ) : null}
        {canGoBack ? (
          <Button type="button" variant="ghost" size="lg" onClick={onBack} disabled={busy} className="ml-auto">
            Back
          </Button>
        ) : null}
      </div>
    </form>
  );
}
