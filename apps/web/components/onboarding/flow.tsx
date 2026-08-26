'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  OnboardingActionError,
  OnboardingClosedError,
  useAnswerQuestion,
  useCompanionProfile,
  useEraseCompanion,
  useGoBack,
  useOnboardingSession,
  useRestartOnboarding,
  useSkipQuestion,
  useStartOnboarding,
  type CarryOverInput,
  type SessionState,
} from '@joice/api-client';
import { Eyebrow } from '@/components/ui/eyebrow';
import { track } from '@/lib/analytics';
import { CompleteScreen } from './complete-screen';
import { GateScreen } from './gate-screen';
import { Progress } from './progress';
import { QuestionShell } from './question-shell';
import { StepInput, hasValue, valueToSubmit } from './steps/step-input';

/**
 * The intake runner. The server decides what is next; this renders it and
 * sends answers back. One draft value for the current question, one error
 * line, the three actions. What the companion already knows is sent once as
 * carry-over and comes back as the prefilled value of the matching question,
 * marked "carried over", never applied silently.
 *
 * `fallback` renders when the `onboarding` flag is off (the API answers 404)
 * so the page never dead-ends: today that is the companion lead summary.
 */
export function OnboardingFlow({ fallback, accountsOpen = false }: { fallback: ReactNode; accountsOpen?: boolean }) {
  const session = useOnboardingSession();
  const companion = useCompanionProfile();
  const start = useStartOnboarding();
  const answer = useAnswerQuestion();
  const skip = useSkipQuestion();
  const back = useGoBack();
  const restart = useRestartOnboarding();
  const eraseCompanion = useEraseCompanion();

  const [draft, setDraft] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const viewedRef = useRef<string | null>(null);
  const resumedRef = useRef(false);
  /** The question the visitor resumed on, so the resume note shows once. */
  const resumedAtRef = useRef<string | null | undefined>(undefined);

  const state = session.data;
  const busy = answer.isPending || skip.isPending || back.isPending || restart.isPending || start.isPending;

  const companionCarryOver = (): CarryOverInput | undefined => {
    const profile = companion.data?.profile;
    if (!profile) return undefined;
    const carryOver: CarryOverInput = {
      ...(profile.name ? { firstName: profile.name } : {}),
      ...(profile.email ? { email: profile.email } : {}),
      ...(profile.goal ? { goal: profile.goal } : {}),
    };
    return Object.keys(carryOver).length > 0 ? carryOver : undefined;
  };

  // Carry the companion's capture over once, as soon as both are known.
  useEffect(() => {
    if (startedRef.current || !state || !companion.data) return;
    const carryOver = companionCarryOver() ?? {};
    startedRef.current = true;
    const already = state.carryOver ?? {};
    const isNew = Object.entries(carryOver).some(([k, v]) => v && !(already as Record<string, unknown>)[k]);
    if (state.status === 'in_progress' && isNew) {
      start.mutate({ carryOver });
    }
    track({ event: state.progress.answered > 0 ? 'onboarding_resumed' : 'onboarding_started', carriedOver: Object.keys(carryOver).length > 0 });
  }, [state, companion.data, start]);

  // A cold visitor (no companion data): record the start when the session first loads.
  useEffect(() => {
    if (!state || resumedRef.current || companion.isPending) return;
    if (companion.data) return; // handled above
    resumedRef.current = true;
    track({ event: state.progress.answered > 0 ? 'onboarding_resumed' : 'onboarding_started', carriedOver: false });
  }, [state, companion.data, companion.isPending]);

  // Remember where a returning visitor landed, for the resume note.
  useEffect(() => {
    if (!state || resumedAtRef.current !== undefined) return;
    resumedAtRef.current = state.progress.answered > 0 && state.step.kind === 'question' ? state.step.question.key : null;
  }, [state]);

  // Reset the draft and announce the step when the question changes.
  const step = state?.step;
  const questionKey = step?.kind === 'question' ? step.question.key : null;
  useEffect(() => {
    if (!step || step.kind !== 'question') return;
    if (viewedRef.current === step.question.key) return;
    viewedRef.current = step.question.key;
    setDraft(step.value ?? undefined);
    setError(null);
    track({ event: 'onboarding_step_viewed', questionKey: step.question.key });
  }, [step]);

  if (session.isPending) {
    return <p className="mono-label mt-12 text-center text-muted">Loading…</p>;
  }
  if (session.error instanceof OnboardingClosedError) {
    return <>{fallback}</>;
  }
  if (session.error || !state) {
    return (
      <p className="mt-12 text-center text-sm text-red-700" role="alert">
        We could not load your intake. Please refresh.
      </p>
    );
  }

  async function run(action: () => Promise<SessionState>, after?: (s: SessionState) => void) {
    setError(null);
    try {
      const next = await action();
      after?.(next);
    } catch (err) {
      if (err instanceof OnboardingActionError) {
        setError(err.message);
        if (err.code === 'no_session' || err.code === 'gated') session.refetch();
        return;
      }
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  const firstName = state.carryOver?.firstName;
  const showCarried = Boolean(state.copy.carriedTitle) && state.progress.answered === 0 && state.step.kind === 'question';

  return (
    <div className="mx-auto w-full max-w-2xl py-12 sm:py-20">
      <header className="mb-10">
        <Eyebrow>Get started</Eyebrow>
        {state.step.kind === 'question' ? (
          <>
            <h1 className="display mt-6 text-balance text-4xl text-ink sm:text-6xl">
              {showCarried ? state.copy.carriedTitle : state.copy.introTitle}
            </h1>
            {state.progress.answered === 0 ? (
              <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted">
                {showCarried ? state.copy.carriedBody : state.copy.introBody}
              </p>
            ) : null}
            {state.copy.resumeNote && resumedAtRef.current && resumedAtRef.current === state.step.question.key ? (
              <p className="mono-label mt-4 text-muted">{state.copy.resumeNote}</p>
            ) : null}
          </>
        ) : null}
      </header>

      {state.step.kind === 'question' ? (
        <>
          <div className="mb-8">
            <Progress progress={state.progress} />
          </div>
          {state.step.section.title ? (
            <p className="mono-label mb-4 text-muted">{state.step.section.title}</p>
          ) : null}
          <QuestionShell
            questionKey={state.step.question.key}
            label={state.step.question.copy.label}
            help={state.step.question.copy.help}
            error={error}
            required={state.step.question.required}
            canGoBack={state.step.canGoBack}
            canContinue={hasValue(state.step.question, draft)}
            busy={busy}
            onBack={() => run(() => back.mutateAsync(), () => track({ event: 'onboarding_back' }))}
            onSkip={() =>
              run(
                () => skip.mutateAsync({ questionKey: questionKey! }),
                () => track({ event: 'onboarding_step_skipped', questionKey: questionKey! }),
              )
            }
            onSubmit={() =>
              run(
                () => answer.mutateAsync({ questionKey: questionKey!, value: valueToSubmit(state.step.kind === 'question' ? state.step.question : ({} as never), draft) }),
                (next) => {
                  track({ event: 'onboarding_step_answered', questionKey: questionKey! });
                  if (next.step.kind === 'gate') {
                    track({ event: 'onboarding_gate_hit', outcome: gateOutcome(next) });
                    // A minor: the api has already purged the intake; erase the
                    // companion lead too, so nothing of theirs stays on either service.
                    if (next.step.gate.reason === 'age') eraseCompanion.mutate();
                  }
                  if (next.step.kind === 'complete') track({ event: 'onboarding_completed' });
                },
              )
            }
          >
            {state.step.carriedOver ? (
              <p className="mono-label mb-3 text-muted">Carried over from your conversation. Change it if it is not right.</p>
            ) : null}
            <StepInput question={state.step.question} value={draft} onChange={setDraft} today={new Date().toISOString().slice(0, 10)} />
          </QuestionShell>
        </>
      ) : null}

      {state.step.kind === 'gate' ? (
        <GateScreen
          gate={state.step.gate}
          carriedEmail={state.carryOver?.email}
          onRestart={() =>
            run(
              () => restart.mutateAsync({ carryOver: companionCarryOver() }),
              () => track({ event: 'onboarding_restarted' }),
            )
          }
        />
      ) : null}

      {state.step.kind === 'complete' ? <CompleteScreen step={state.step} accountsOpen={accountsOpen} /> : null}

      {state.step.kind !== 'question' && firstName ? (
        <p className="mono-label mt-8 text-muted">Saved for {firstName}</p>
      ) : null}
    </div>
  );
}

function gateOutcome(state: SessionState): 'stop_age' | 'notify_state' | 'closed_state' {
  if (state.step.kind !== 'gate') return 'stop_age';
  if (state.step.gate.outcome === 'notify') return 'notify_state';
  if (state.step.gate.outcome === 'closed') return 'closed_state';
  return 'stop_age';
}
