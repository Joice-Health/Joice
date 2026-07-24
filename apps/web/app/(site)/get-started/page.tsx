import type { Metadata } from 'next';
import { Eyebrow } from '@/components/ui/eyebrow';
import { LeadSummary } from '@/components/get-started/lead-summary';

export const metadata: Metadata = {
  title: 'Get Started — Joice',
  description: 'Tell us where you are — a licensed clinician decides with you.',
};

/**
 * Get Started destination — where the companion hands off a captured lead. The
 * intake decision tree is a separate downstream workstream; this confirms the
 * lead (see LeadSummary) and holds its place.
 */
export default function GetStartedPage() {
  return (
    <div className="mx-auto w-full max-w-2xl py-16 sm:py-24">
      <div className="text-center">
        <Eyebrow>Get started</Eyebrow>
        <h1 className="mt-4 text-balance text-4xl leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl">
          Tell us where you are.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-pretty text-lg leading-relaxed text-muted">
          A few questions, your concerns, labs if you have them — then a licensed clinician
          takes it from there.
        </p>
      </div>

      <LeadSummary />

      <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-wider text-muted">
        Conversation → intake → clinician consult · flow in progress
      </p>
    </div>
  );
}
