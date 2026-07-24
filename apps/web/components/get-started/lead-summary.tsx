'use client';

import { useCompanionProfile } from '@joice/api-client';
import { Button, Input } from '@joice/ui';

/**
 * The intent-capture card on /get-started, now aware of what the companion
 * already learned. A visitor who came through the companion arrives with a
 * name and a goal, so we confirm the lead instead of asking cold. Someone who
 * landed here directly still sees the neutral prompt.
 *
 * The intake decision tree itself is a separate downstream workstream — this
 * only confirms the lead and holds its place.
 */

const PROMPTS = [
  'I want more energy through the day',
  'Recovery is slower than it used to be',
  'I have labs I want a clinician to look at',
  'Not sure — help me figure out where to start',
];

export function LeadSummary() {
  const { data: companion } = useCompanionProfile();
  const profile = companion?.profile;
  const hasLead = Boolean(profile?.name || profile?.goalLabel);

  return (
    <div className="glass mt-10 rounded-card p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_24px_60px_-24px_rgba(40,30,10,0.35)] sm:p-8">
      {hasLead ? (
        <div className="text-center">
          <p className="text-pretty text-lg leading-relaxed text-ink">
            {profile?.name ? `Got it, ${profile.name}. ` : 'Got it. '}
            {profile?.goalLabel
              ? `You're focused on ${profile.goalLabel.toLowerCase()}.`
              : "Let's find the right starting point."}
          </p>
          <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted">
            Next, a few quick questions and your labs if you have them — then a licensed
            clinician takes it from there.
          </p>
          <Button size="lg" className="mt-6 w-full" disabled>
            Continue — intake coming soon
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <Input placeholder="What would you change first?" aria-label="Your goal" disabled />
            <Button size="lg" className="w-full" disabled>
              Start the conversation
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {PROMPTS.map((prompt) => (
              <span
                key={prompt}
                className="rounded-full bg-surface px-3.5 py-2 text-xs text-muted shadow-[0_10px_24px_-16px_rgba(40,35,25,0.5)]"
              >
                {prompt}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Labs / concerns upload slot — arrives with the intake flow. */}
      <div className="mt-6 rounded-2xl border border-dashed border-line bg-canvas/60 p-6 text-center">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
          Labs / concerns upload — coming with the intake flow
        </span>
      </div>
    </div>
  );
}
