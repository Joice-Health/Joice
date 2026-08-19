'use client';

import type { CaptureStep } from '@joice/brain/schemas';

/**
 * Goal quick-replies — the one capture step that stays a widget. Name and email
 * are answered in the main composer (they're free text); the goal is a fixed
 * choice, so tappable chips read as natural quick-replies and keep the data
 * clean. The chips live just above the composer so they're always reachable.
 */
/**
 * Tappable starter questions, shown when capture completes so the visitor is
 * handed their next move instead of a closing statement. One tap asks the
 * question through the normal chat path.
 */
export function SuggestionChips({
  suggestions,
  busy,
  onAsk,
}: {
  suggestions: string[];
  busy: boolean;
  onAsk: (question: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((question) => (
        <button
          key={question}
          type="button"
          disabled={busy}
          onClick={() => onAsk(question)}
          className="rounded-full bg-surface px-4 py-2 text-sm text-ink transition-all hover:bg-brand-400/12 disabled:opacity-50"
        >
          {question}
        </button>
      ))}
    </div>
  );
}

export function GoalChips({
  step,
  busy,
  onSelect,
  onSkip,
}: {
  step: CaptureStep;
  busy: boolean;
  onSelect: (value: string) => void;
  onSkip: () => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {step.input.choices?.map((choice) => (
          <button
            key={choice.value}
            type="button"
            disabled={busy}
            onClick={() => onSelect(choice.value)}
            className="rounded-full bg-surface px-4 py-2 text-sm text-ink transition-all hover:bg-brand-400/12 disabled:opacity-50"
          >
            {choice.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="rounded-full px-3 py-2 font-mono text-[11px] tracking-mono text-muted/70 uppercase transition-colors hover:text-muted disabled:opacity-50"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
