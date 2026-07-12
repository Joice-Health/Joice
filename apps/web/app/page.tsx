import Link from 'next/link';
import { cn } from '@joice/ui';
import { BrandMark } from '@/components/brand-mark';

/**
 * Main site home — team-gated until SITE_LAUNCHED (middleware redirects the
 * public to /waitlist). Layout follows the approved homepage wireframe; copy is
 * placeholder until the content pass.
 */

const NAV_LINKS = [
  { label: 'Explore', href: '/explore' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Learn', href: '/learn' },
  { label: 'Our Story', href: '/story' },
];

const STEPS = [
  { n: '1', label: 'Intake' },
  { n: '2', label: 'Clinician consult' },
  { n: '3', label: 'Prescribe + access' },
];

const CARE_AREAS = [
  'Weight & metabolic',
  'Body comp / recovery',
  'Beauty / skin',
  'Energy',
  'Stress & sleep',
];

const FOOTER_LINKS = [
  { label: 'Provider disclosure', href: '/legal/provider-disclosure' },
  { label: 'States', href: '/legal/states' },
  { label: 'HSA/FSA', href: '/hsa-fsa' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
  { label: 'Legal', href: '/legal' },
  { label: 'Clinical Team', href: '/clinical-team' },
];

const ctaClasses = cn(
  'inline-flex items-center justify-center rounded-full font-medium text-white',
  'bg-gradient-to-b from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500',
  'shadow-[0_14px_34px_-12px_rgba(90,85,75,0.5)] ring-1 ring-inset ring-white/25',
  'transition-all duration-200 outline-none',
  'focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
);

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
      {children}
    </span>
  );
}

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section
      className={cn(
        'rounded-card border border-line bg-surface/60 p-6 sm:p-8',
        'shadow-[0_10px_30px_-24px_rgba(40,35,25,0.4)]',
        className,
      )}
    >
      {children}
    </section>
  );
}

export default function Home() {
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6">
      {/* Nav */}
      <header className="glass sticky top-4 z-20 flex items-center justify-between rounded-full px-5 py-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_10px_28px_-14px_rgba(31,38,32,0.25)]">
        <Link href="/" aria-label="Joice home">
          <BrandMark />
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-ink/80 transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <Link href="/get-started" className={cn(ctaClasses, 'h-11 px-5 text-sm')}>
          Get Started
        </Link>
      </header>

      {/* Hero */}
      <Panel>
        <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div className="animate-fade-up">
            <h1 className="text-balance text-4xl leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl">
              Clinician-guided peptide care, built to keep you yourself.
            </h1>
            <p className="mt-5 max-w-md text-pretty text-lg leading-relaxed text-muted">
              Protocols set by clinicians, sourced and tested with proof, priced near cost — on
              purpose.
            </p>
            <Link href="/get-started" className={cn(ctaClasses, 'mt-8 h-14 px-7 text-base')}>
              Get Started
            </Link>
          </div>

          <div className="flex aspect-4/3 items-center justify-center rounded-2xl border border-line bg-brand-100/60">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              Image
            </span>
          </div>
        </div>
      </Panel>

      {/* Who this is for */}
      <Panel>
        <SectionLabel>Who this is for</SectionLabel>
        <p className="mt-4 max-w-3xl text-pretty text-xl leading-relaxed text-ink sm:text-2xl">
          For people who feel the body drifting from the person inside it — and want a clinical
          path back, without the hype.
        </p>
      </Panel>

      {/* Clinical team teaser */}
      <Panel>
        <SectionLabel>Clinical team</SectionLabel>
        <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex -space-x-3">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="h-12 w-12 rounded-full border-2 border-surface bg-brand-200"
                />
              ))}
            </div>
            <p className="max-w-sm text-base leading-relaxed text-ink">
              “Meet the clinicians who set our protocols”
            </p>
          </div>
          <Link
            href="/clinical-team"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full glass px-5 text-sm font-medium text-ink shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_10px_28px_-14px_rgba(31,38,32,0.3)] transition-all duration-200 hover:bg-white/75"
          >
            Meet the team →
          </Link>
        </div>
      </Panel>

      {/* How it works snapshot */}
      <Panel>
        <SectionLabel>How it works</SectionLabel>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="flex items-center justify-center gap-3 rounded-2xl border border-line bg-surface px-5 py-6"
            >
              <span className="font-mono text-sm text-muted">{step.n}</span>
              <span className="text-muted">·</span>
              <span className="font-medium text-ink">{step.label}</span>
            </div>
          ))}
        </div>
      </Panel>

      {/* Explore by care area */}
      <Panel>
        <SectionLabel>Explore by care area</SectionLabel>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {CARE_AREAS.map((area) => (
            <Link
              key={area}
              href="/explore"
              className="flex min-h-24 items-center justify-center rounded-2xl border border-line bg-surface px-4 py-6 text-center text-sm font-medium text-ink transition-all duration-200 hover:border-brand-300 hover:bg-brand-50"
            >
              {area}
            </Link>
          ))}
        </div>
      </Panel>

      {/* Brand story + education teasers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionLabel>Our story</SectionLabel>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-ink">
            The body drifts. The person doesn&apos;t.
          </p>
          <p className="mt-2 max-w-md text-pretty text-base leading-relaxed text-muted">
            Why we built Joice, and the standard we hold every protocol to.
          </p>
        </Panel>

        <Panel>
          <SectionLabel>Learn</SectionLabel>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <Link
                key={i}
                href="/learn"
                className="rounded-2xl border border-line bg-surface p-5 transition-all duration-200 hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
                  Article
                </span>
                <span className="mt-8 block h-2 w-3/4 rounded-full bg-line" aria-hidden />
                <span className="mt-2 block h-2 w-1/2 rounded-full bg-line" aria-hidden />
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      {/* Secondary CTA */}
      <Panel className="py-12 text-center sm:py-16">
        <SectionLabel>Ready when you are</SectionLabel>
        <div className="mt-5">
          <Link href="/get-started" className={cn(ctaClasses, 'h-14 px-7 text-base')}>
            Get Started
          </Link>
        </div>
      </Panel>

      {/* Footer */}
      <footer className="rounded-card border border-line bg-surface/60 px-6 py-5">
        <nav
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2"
          aria-label="Footer"
        >
          {FOOTER_LINKS.map((link, i) => (
            <span key={link.href} className="flex items-center gap-3">
              <Link
                href={link.href}
                className="font-mono text-[11px] uppercase tracking-wider text-muted transition-colors hover:text-ink"
              >
                {link.label}
              </Link>
              {i < FOOTER_LINKS.length - 1 ? <span className="text-line">·</span> : null}
            </span>
          ))}
        </nav>
      </footer>

      {/* Companion pill */}
      <button
        type="button"
        className="glass fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-ink shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_14px_34px_-14px_rgba(31,38,32,0.4)] transition-all duration-200 hover:bg-white/75"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
        </span>
        Companion · ask anything
      </button>
    </div>
  );
}
