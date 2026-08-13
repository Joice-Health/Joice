import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '@/components/ui/page-intro';
import { Eyebrow } from '@/components/ui/eyebrow';
import { HowItWorks as StepsSnapshot } from '@/components/home/how-it-works';
import { GetStartedCta } from '@/components/ui/get-started-cta';

export const metadata: Metadata = {
  title: 'How It Works · Joice',
  description:
    'The end-to-end Joice model: clinician consult, prescription-gated protocols, membership, and transparent pricing.',
};

const MEMBERSHIP_INCLUDES = [
  'Clinician consults & protocol reviews',
  'Your prescribed protocol, shipped',
  'Dose adjustments as your labs change',
  'Companion access for questions between visits',
];

export default function HowItWorksPage() {
  return (
    <>
      <PageIntro eyebrow="How it works" title="Clinical care, end to end.">
        From first conversation to ongoing oversight — one membership, no cart, no guesswork.
      </PageIntro>

      {/* End-to-end model — reuse the 3-step snapshot */}
      <div className="border-t border-line/60">
        <StepsSnapshot eyebrow="The end-to-end model" />
      </div>

      {/* Why prescription-gated + clinical oversight */}
      <div className="grid gap-4 pb-16 sm:pb-20 lg:grid-cols-2">
        <section className="rounded-card bg-surface p-6 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)] sm:p-8">
          <Eyebrow>Why prescription-gated</Eyebrow>
          <p className="mt-4 text-pretty text-xl leading-snug text-ink">
            Peptides are medicine. We treat them that way.
          </p>
          <p className="mt-3 text-base leading-relaxed text-muted">
            Every protocol requires a licensed clinician&apos;s prescription — that&apos;s the
            point, not a hurdle. It&apos;s how the wrong protocol never ships.
          </p>
        </section>

        <section className="glass rounded-card p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_24px_60px_-32px_rgba(40,35,25,0.4)] sm:p-8">
          <Eyebrow>Clinical oversight</Eyebrow>
          <p className="mt-4 text-pretty text-xl leading-snug text-ink">
            A standing team sets the protocols — and says no.
          </p>
          <p className="mt-3 text-base leading-relaxed text-muted">
            Standards, sourcing, dosing guardrails, and exclusions are owned by our clinical
            board.
          </p>
          <Link
            href="/clinical-team"
            className="mt-5 inline-block font-mono text-[11px] uppercase tracking-wider text-ink underline-offset-4 hover:underline"
          >
            Meet the team →
          </Link>
        </section>
      </div>

      {/* Membership + pricing philosophy */}
      <div className="grid gap-4 pb-16 sm:pb-20 lg:grid-cols-2">
        <section className="rounded-card bg-surface p-6 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)] sm:p-8">
          <Eyebrow>What membership includes</Eyebrow>
          <ul className="mt-5 space-y-3">
            {MEMBERSHIP_INCLUDES.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                <span className="text-base text-ink">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="relative overflow-hidden rounded-card p-6 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)] sm:p-8">
          <div className="absolute inset-0 bg-gradient-to-br from-card-to/40 via-surface to-surface" />
          <div className="relative">
            <Eyebrow>Pricing philosophy</Eyebrow>
            <p className="mt-4 text-pretty text-xl italic leading-snug text-ink">
              Near cost, on purpose.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Medication priced near cost; the membership pays for care. Every product page
              shows the breakdown.
            </p>
            <Link
              href="/explore"
              className="mt-5 inline-block font-mono text-[11px] uppercase tracking-wider text-ink underline-offset-4 hover:underline"
            >
              See product pricing →
            </Link>
          </div>
        </section>
      </div>

      {/* Provider structure + cancellation — quiet compliance strip */}
      <section className="mb-16 rounded-card bg-surface p-6 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)] sm:mb-20 sm:p-8">
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <Eyebrow>Independent providers</Eyebrow>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Care is delivered by independent licensed providers. Details in the{' '}
              <Link href="/legal/provider-disclosure" className="text-ink underline underline-offset-4">
                provider disclosure
              </Link>
              .
            </p>
          </div>
          <div>
            <Eyebrow>Easy cancellation</Eyebrow>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Cancel anytime from your account — no calls, no hoops, no guilt trip.
            </p>
          </div>
        </div>
      </section>

      <GetStartedCta />
    </>
  );
}
