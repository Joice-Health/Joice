'use client';

import { useRouter } from 'next/navigation';
import type { SessionState } from '@joice/api-client';
import { Button } from '@joice/ui';
import { CtaLink } from '@/components/ui/cta-link';
import { track } from '@/lib/analytics';

type CompleteStep = Extract<SessionState['step'], { kind: 'complete' }>;

/**
 * The last screen before the account. Says what happens next and when, so the
 * sign-up does not read as a data grab; shows what they told us as hairline
 * rows; promises no email. Until member accounts ship (Phase 2) the forward
 * action points at the companion and the copy says intake is saved here.
 */
export function CompleteScreen({ step, accountsOpen }: { step: CompleteStep; accountsOpen: boolean }) {
  const router = useRouter();
  return (
    <section className="animate-fade-up" aria-live="polite">
      <h1 className="display text-balance text-4xl text-ink sm:text-6xl">{step.copy.title}</h1>
      <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted">{step.copy.body}</p>

      {step.summary.length > 0 ? (
        <dl className="mt-10 border-t border-line">
          {step.summary.map((row) => (
            <div key={row.questionKey} className="flex items-baseline justify-between gap-6 border-b border-line py-3">
              <dt className="mono-label text-muted">{row.label}</dt>
              <dd className="text-right text-base text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-10 flex flex-wrap items-center gap-3">
        {accountsOpen ? (
          <CtaLink
            href={step.nextHref}
            variant="solid"
            size="lg"
            onClick={() => track({ event: 'onboarding_registration_started' })}
          >
            {step.copy.cta}
          </CtaLink>
        ) : (
          <Button type="button" variant="solid" size="lg" onClick={() => router.push('/ask')}>
            Keep exploring with the companion +
          </Button>
        )}
      </div>
      {!accountsOpen ? (
        <p className="mono-label mt-4 text-muted">Your answers are saved in this browser. Accounts open soon.</p>
      ) : null}
    </section>
  );
}
