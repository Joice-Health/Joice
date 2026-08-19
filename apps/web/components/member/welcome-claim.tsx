'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  OnboardingActionError,
  useClaimCompanion,
  useClaimOnboarding,
  useMyProfile,
  type MemberProfileView,
} from '@joice/api-client';
import { Button } from '@joice/ui';
import { CtaLink } from '@/components/ui/cta-link';
import { Eyebrow } from '@/components/ui/eyebrow';
import { track } from '@/lib/analytics';

/**
 * /welcome. On first render: claim the intake in this browser for the signed-in
 * member (idempotent; `no_session` means they signed up without one), then the
 * companion lead (best-effort, never shown failing), then show what we know:
 * first name, what they told us, their segment, and what happens next, so the
 * account never reads as a data grab. Promises no email.
 */
export function WelcomeClaim() {
  const router = useRouter();
  const claim = useClaimOnboarding();
  const claimCompanion = useClaimCompanion();
  const profile = useMyProfile({ enabled: false });
  const [phase, setPhase] = useState<'claiming' | 'ready' | 'verify' | 'no_intake' | 'error'>('claiming');
  const [message, setMessage] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const result = await claim.mutateAsync({});
        if (!result.alreadyClaimed) track({ event: 'onboarding_registration_completed' });
        claimCompanion.mutate(undefined, { onError: () => {} });
        setPhase('ready');
      } catch (err) {
        if (err instanceof OnboardingActionError) {
          if (err.code === 'no_session') {
            setPhase('no_intake');
          } else if (err.status === 409) {
            // Unverified email, or a gated intake: say what to do.
            setPhase('verify');
            setMessage(err.message);
          } else {
            setPhase('error');
            setMessage(err.message);
          }
        } else {
          setPhase('error');
          setMessage(err instanceof Error ? err.message : 'Something went wrong.');
        }
      }
      await profile.refetch();
    })();
  }, [claim, claimCompanion, profile]);

  if (phase === 'claiming') {
    return <p className="mono-label mx-auto max-w-2xl py-20 text-muted">Saving your intake…</p>;
  }

  const me: MemberProfileView | undefined = profile.data;
  const firstName = me?.firstName ?? me?.intake?.carryOver?.firstName ?? null;

  return (
    <div className="mx-auto w-full max-w-2xl py-12 sm:py-20">
      <Eyebrow>Welcome</Eyebrow>
      <h1 className="display mt-6 text-balance text-4xl text-ink sm:text-6xl">
        {firstName ? `Welcome, ${firstName}.` : 'Welcome.'}
      </h1>

      {phase === 'no_intake' ? (
        <>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted">
            Your account is ready. The next step is a short intake so a licensed clinician can decide with you.
          </p>
          <div className="mt-10">
            <CtaLink href="/get-started" variant="solid" size="lg">
              Start your intake +
            </CtaLink>
          </div>
        </>
      ) : null}

      {phase === 'verify' || phase === 'error' ? (
        <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted" role="alert">
          {message}
        </p>
      ) : null}

      {phase === 'ready' || (me && me.traits.length > 0) ? (
        <>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted">
            Your intake is saved to your account. Here is what you told us.
          </p>
          {me && me.traits.length > 0 ? (
            <dl className="mt-10 border-t border-line">
              {me.traits
                .filter((t) => !['age', 'age_eligible', 'state_status', 'segment', 'email', 'first_name'].includes(t.key))
                .map((row) => (
                  <div key={row.key} className="flex items-baseline justify-between gap-6 border-b border-line py-3">
                    <dt className="mono-label text-muted">{row.label}</dt>
                    <dd className="text-right text-base text-ink">{row.value}</dd>
                  </div>
                ))}
            </dl>
          ) : null}

          <section className="mt-12">
            <Eyebrow>What happens next</Eyebrow>
            <ol className="mt-4 border-t border-line">
              {[
                ['A clinician reviews', 'A licensed clinician reads your intake before anything is suggested.'],
                ['Your starting point', 'We prepare a protocol and walk you through it, with no guesswork.'],
                ['The companion, meanwhile', 'Ask it anything about the research between now and then.'],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-6 border-b border-line py-4">
                  <span className="mono-label text-muted">[ {String(i + 1).padStart(2, '0')} ]</span>
                  <div>
                    <p className="text-base text-ink">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="mt-10 rounded-2xl bg-surface px-5 py-4">
            <p className="mono-label text-muted">Your protocol</p>
            <p className="mt-1 text-base text-ink">Being prepared. We will let you know here when it is ready.</p>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button type="button" variant="solid" size="lg" onClick={() => router.push('/ask')}>
              Talk to the companion +
            </Button>
            <CtaLink href="/explore" size="lg">
              Explore the research +
            </CtaLink>
          </div>
        </>
      ) : null}
    </div>
  );
}
