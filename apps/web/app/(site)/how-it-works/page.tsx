import type { Metadata } from 'next';
import Link from 'next/link';
import { Index } from '@joice/ui';
import { PageIntro } from '@/components/ui/page-intro';
import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';
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
        From first conversation to ongoing oversight: one membership, clinician oversight, no guesswork.
      </PageIntro>

      {/* End-to-end model, reusing the 3-step snapshot */}
      <div className="border-t border-line">
        <StepsSnapshot eyebrow="The end-to-end model" />
      </div>

      {/* Why prescription-gated + clinical oversight */}
      <div className="grid gap-x-16 gap-y-10 border-t border-line py-16 sm:py-20 lg:grid-cols-2">
        <section>
          <Eyebrow as="h2">Why prescription-gated</Eyebrow>
          <p className="mt-4 text-pretty text-xl leading-snug text-ink sm:text-2xl">
            Peptides are medicine. We treat them that way.
          </p>
          <p className="mt-3 text-base leading-relaxed text-muted">
            Every protocol requires a licensed clinician&apos;s prescription. That&apos;s the
            point, not a hurdle. It&apos;s how the wrong protocol never ships.
          </p>
        </section>

        <section>
          <Eyebrow as="h2">Clinical oversight</Eyebrow>
          <p className="mt-4 text-pretty text-xl leading-snug text-ink sm:text-2xl">
            A standing team sets the protocols, and says no.
          </p>
          <p className="mt-3 text-base leading-relaxed text-muted">
            Standards, sourcing, dosing guardrails, and exclusions are owned by our clinical
            board.
          </p>
          <CtaLink href="/clinical-team" className="mt-6">
            Meet the team +
          </CtaLink>
        </section>
      </div>

      {/* Membership + pricing philosophy */}
      <div className="grid gap-x-16 gap-y-10 border-t border-line py-16 sm:py-20 lg:grid-cols-2">
        <section>
          <Eyebrow as="h2">What membership includes</Eyebrow>
          <ol className="mt-5 border-t border-line">
            {MEMBERSHIP_INCLUDES.map((item, i) => (
              <li
                key={item}
                className="flex items-baseline gap-5 border-b border-line py-3 text-base text-ink"
              >
                <span className="mono-label text-muted">
                  <Index n={i + 1} />
                </span>
                {item}
              </li>
            ))}
          </ol>
        </section>

        <section>
          <Eyebrow as="h2">Pricing philosophy</Eyebrow>
          <p className="mt-4 text-pretty text-xl italic leading-snug text-ink sm:text-2xl">
            Near cost, on purpose.
          </p>
          <p className="mt-3 text-base leading-relaxed text-muted">
            Medication priced near cost; the membership pays for care. Every product page
            shows the breakdown.
          </p>
          <CtaLink href="/explore" className="mt-6">
            See product pricing +
          </CtaLink>
        </section>
      </div>

      {/* Provider structure + cancellation: quiet compliance strip */}
      <section className="border-t border-line py-12 sm:py-14">
        <div className="grid gap-x-16 gap-y-8 sm:grid-cols-2">
          <div>
            <Eyebrow as="h2">Independent providers</Eyebrow>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Care is delivered by independent licensed providers. Details in the{' '}
              <Link href="/legal/provider-disclosure" className="text-ink underline underline-offset-4">
                provider disclosure
              </Link>
              .
            </p>
          </div>
          <div>
            <Eyebrow as="h2">Easy cancellation</Eyebrow>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Cancel anytime from your account. No calls, no hoops, no guilt trip.
            </p>
          </div>
        </div>
      </section>

      <GetStartedCta />
    </>
  );
}
