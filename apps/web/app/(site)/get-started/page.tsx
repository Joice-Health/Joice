import type { Metadata } from 'next';
import { FLAG_KEYS } from '@joice/core/schemas';
import { Eyebrow } from '@/components/ui/eyebrow';
import { LeadSummary } from '@/components/get-started/lead-summary';
import { OnboardingFlow } from '@/components/onboarding/flow';
import { flagEnabled } from '@/lib/flags';

export const metadata: Metadata = {
  title: 'Get Started · Joice',
  description: 'Tell us where you are. A licensed clinician decides with you.',
};

/**
 * Get Started: the intake flow when the `onboarding` flag is on, the companion
 * lead summary when it is off. The flow is server-driven (the api decides the
 * next step); this page only picks which experience to mount. The flag is
 * read here (server) so the right one renders first paint, and again by the
 * runner (the api answers 404 when off) so a toggle mid-session degrades to
 * the summary instead of an error.
 */
export default async function GetStartedPage() {
  const open = await flagEnabled(FLAG_KEYS.onboarding);
  const fallback = (
    <div className="mx-auto w-full max-w-2xl py-16 sm:py-24">
      <div className="text-center">
        <Eyebrow>Get started</Eyebrow>
        <h1 className="display mt-6 text-balance text-5xl text-ink sm:text-7xl">Tell us where you are.</h1>
        <p className="mx-auto mt-6 max-w-md text-pretty text-lg leading-relaxed text-muted">
          A few questions, your concerns, labs if you have them. Then a licensed clinician takes it from there.
        </p>
      </div>
      <LeadSummary />
      <p className="mono-label mt-6 text-center text-muted">Conversation + intake + clinician consult · flow in progress</p>
    </div>
  );
  if (!open) return fallback;
  // Accounts exist when Clerk is configured at build time (the member tree).
  const accountsOpen = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return <OnboardingFlow fallback={fallback} accountsOpen={accountsOpen} />;
}
