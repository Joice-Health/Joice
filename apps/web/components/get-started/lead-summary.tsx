'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCompanionProfile } from '@joice/api-client';
import { Button } from '@joice/ui';
import { track } from '@/lib/analytics';

/**
 * The intent-capture card on /get-started, aware of what the companion already
 * learned. A visitor who came through the companion arrives with a name and a
 * goal, so we confirm the lead instead of asking cold.
 *
 * The intake decision tree is a separate downstream workstream. Until it
 * ships, this page must not dead-end on a disabled button: a lead with an
 * email gets confirmation their details are saved, and everyone else gets a
 * live path back to the companion. Deliberately NO "we'll email you" promise:
 * companion emails are imported to marketing without subscription consent, so
 * promising an email would promise something the consent posture forbids.
 */

export function LeadSummary() {
  const { data: companion } = useCompanionProfile();
  const router = useRouter();
  const profile = companion?.profile;
  const hasLead = Boolean(profile?.name || profile?.goalLabel || profile?.email);

  useEffect(() => {
    track({ event: 'handoff_viewed' });
  }, []);

  return (
    <div className="panel mt-10 rounded-card p-6 sm:p-8">
      {hasLead ? (
        <div className="text-center">
          <p className="text-pretty text-lg leading-relaxed text-ink">
            {profile?.name ? `Got it, ${profile.name}. ` : 'Got it. '}
            {profile?.goalLabel
              ? `You're focused on ${profile.goalLabel.toLowerCase()}.`
              : "Let's find the right starting point."}
          </p>
          {profile?.email ? (
            <>
              <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted">
                Intake opens soon: a few quick questions, your labs if you have them, then a
                licensed clinician takes it from there.
              </p>
              <p className="mt-6 rounded-2xl bg-canvas px-5 py-4 text-sm leading-relaxed text-ink">
                Your details are saved under <span className="font-mono">{profile.email}</span>.
                You&rsquo;re set for the
                moment intake opens. In the meantime, the companion is right where you left it.
              </p>
              <Button size="lg" className="mt-6 w-full" onClick={() => router.push('/ask')}>
                Keep exploring with the companion +
              </Button>
            </>
          ) : (
            <>
              <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted">
                Intake opens soon. Leave your email with the companion and your details will be
                ready the moment it does.
              </p>
              <Button size="lg" className="mt-6 w-full" onClick={() => router.push('/ask')}>
                Leave my email with the companion +
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="text-center">
          <p className="text-pretty text-lg leading-relaxed text-ink">
            Start with a conversation.
          </p>
          <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted">
            Tell the companion what you&rsquo;d change first (energy, recovery, sleep) and
            it&rsquo;ll point you at the research and save your place for intake.
          </p>
          <Button size="lg" className="mt-6 w-full" onClick={() => router.push('/ask')}>
            Talk to the companion +
          </Button>
        </div>
      )}

      {/* Labs / concerns upload slot, arrives with the intake flow. */}
      <div className="mt-6 rounded-2xl border border-dashed border-line p-6 text-center">
        <span className="mono-label text-muted">Labs / concerns upload: coming with the intake flow</span>
      </div>
    </div>
  );
}
