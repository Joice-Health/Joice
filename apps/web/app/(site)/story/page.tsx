import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '@/components/ui/page-intro';
import { Eyebrow } from '@/components/ui/eyebrow';
import { GetStartedCta } from '@/components/ui/get-started-cta';

export const metadata: Metadata = {
  title: 'Our Story · Joice',
  description: 'Why we built Joice, what the name means, and the standard we hold.',
};

export default function StoryPage() {
  return (
    <>
      <PageIntro eyebrow="Our story" title="The body drifts. The person doesn’t.">
        Joice exists for the gap between how you feel and who you are — and for closing it
        with real medicine instead of hype.
      </PageIntro>

      {/* The promise */}
      <section className="border-t border-line/60 py-16 sm:py-20">
        <Eyebrow>The promise</Eyebrow>
        <p className="mt-6 max-w-3xl text-balance text-2xl leading-snug tracking-[-0.01em] text-ink sm:text-4xl">
          Clinician-guided peptide care, built to keep you{' '}
          <span className="italic text-muted">yourself.</span>
        </p>
      </section>

      {/* The name story + mission */}
      <div className="grid gap-4 pb-16 sm:pb-20 lg:grid-cols-2">
        <section className="relative overflow-hidden rounded-card p-6 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)] sm:p-8">
          <div className="absolute inset-0 bg-gradient-to-br from-card-to/40 via-surface to-surface" />
          <div className="relative">
            <Eyebrow>The name</Eyebrow>
            <p className="mt-4 text-pretty text-xl italic leading-snug text-ink">
              Where the name comes from.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted">
              The story behind “Joice” — pending content pass.
            </p>
          </div>
        </section>

        <section className="rounded-card bg-surface p-6 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)] sm:p-8">
          <Eyebrow>Mission</Eyebrow>
          <p className="mt-4 text-pretty text-xl leading-snug text-ink">
            Make clinical-grade care the default, not the loophole.
          </p>
          <p className="mt-3 text-base leading-relaxed text-muted">
            Sourced and tested with proof. Priced near cost, on purpose. Prescribed only when
            it&apos;s right.
          </p>
        </section>
      </div>

      {/* People / clinical advisory */}
      <section className="glass mb-16 rounded-card p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_24px_60px_-32px_rgba(40,35,25,0.4)] sm:mb-20 sm:p-8">
        <Eyebrow>The people</Eyebrow>
        <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex -space-x-3">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="h-12 w-12 rounded-full border-2 border-surface bg-gradient-to-br from-card-to to-brand-200"
                />
              ))}
            </div>
            <p className="max-w-sm text-lg leading-snug text-ink">
              Built with a standing clinical board — not a logo wall.
            </p>
          </div>
          <Link
            href="/clinical-team"
            className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-ink underline-offset-4 hover:underline"
          >
            Meet the clinical team →
          </Link>
        </div>
      </section>

      <GetStartedCta />
    </>
  );
}
