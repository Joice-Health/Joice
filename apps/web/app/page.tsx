import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@joice/ui';
import { BrandMark } from '@/components/brand-mark';

/** Server-side check so a missing hero asset shows a quiet slot, not a broken image. */
function heroImageExists(): boolean {
  return existsSync(join(process.cwd(), 'public', 'hero.jpg'));
}

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
  { n: '01', label: 'Intake', detail: 'Tell us where you are and where you want to be.' },
  { n: '02', label: 'Clinician consult', detail: 'A licensed clinician reviews and prescribes.' },
  { n: '03', label: 'Prescribe + access', detail: 'Protocols shipped, tracked, adjusted.' },
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

/* Primary CTA — the brand's stone-brown gradient (matches the Button primary variant). */
const ctaDark = cn(
  'inline-flex items-center justify-center rounded-full font-medium text-white',
  'bg-gradient-to-b from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500',
  'shadow-[0_14px_34px_-12px_rgba(90,85,75,0.5)] ring-1 ring-inset ring-white/25',
  'transition-all duration-200 outline-none',
  'focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
);

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-brand-700">
      {children}
    </span>
  );
}

export default function Home() {
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-4 sm:px-6">
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

        <Link href="/get-started" className={cn(ctaDark, 'h-11 px-5 text-sm')}>
          Get Started
        </Link>
      </header>

      {/* Hero — open, no box; the page's biggest type moment */}
      <section className="grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-[1.15fr_1fr]">
        <div className="animate-fade-up">
          <Eyebrow>Clinician-guided peptide care</Eyebrow>
          <h1 className="mt-4 text-balance text-5xl leading-[1.02] tracking-[-0.03em] text-ink sm:text-6xl">
            Built to keep you yourself.
          </h1>
          <p className="mt-6 max-w-md text-pretty text-lg leading-relaxed text-muted">
            Protocols set by clinicians, sourced and tested with proof, priced near cost — on
            purpose.
          </p>
          <div className="mt-9 flex items-center gap-5">
            <Link href="/get-started" className={cn(ctaDark, 'h-14 px-7 text-base')}>
              Get Started
            </Link>
            <Link
              href="/how-it-works"
              className="text-sm font-medium text-ink/80 underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              How it works →
            </Link>
          </div>
        </div>

        {/* Hero image — drop the real asset at apps/web/public/hero.jpg */}
        <div className="relative aspect-4/3 overflow-hidden rounded-card shadow-[0_40px_80px_-32px_rgba(40,30,10,0.45)]">
          {heroImageExists() ? (
            <Image
              src="/hero.jpg"
              alt="Joice"
              fill
              priority
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-brand-100/60">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                Add public/hero.jpg
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Who this is for — open pull-quote, no box */}
      <section className="border-t border-line/60 py-16 sm:py-20">
        <Eyebrow>Who this is for</Eyebrow>
        <p className="mt-6 max-w-3xl text-balance text-2xl leading-snug tracking-[-0.01em] text-ink sm:text-4xl">
          For people who feel the body drifting from the person inside it — and want a clinical
          path back, <span className="italic text-muted">without the hype.</span>
        </p>
      </section>

      {/* Clinical team — glass card (refracts the auras) */}
      <section className="glass rounded-card p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_24px_60px_-32px_rgba(40,35,25,0.4)] sm:p-8">
        <Eyebrow>Clinical team</Eyebrow>
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
              “Meet the clinicians who set our protocols”
            </p>
          </div>
          <Link
            href="/clinical-team"
            className={cn(ctaDark, 'h-11 shrink-0 px-5 text-sm')}
          >
            Meet the team →
          </Link>
        </div>
      </section>

      {/* How it works — ghost numerals give the row rhythm */}
      <section className="py-16 sm:py-20">
        <Eyebrow>How it works</Eyebrow>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="relative overflow-hidden rounded-card bg-surface p-6 pt-5 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)]"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -right-2 -top-6 font-mono text-[7rem] font-bold leading-none text-brand-100"
              >
                {step.n}
              </span>
              <div className="relative">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-brand-700">
                  Step {step.n}
                </span>
                <h3 className="mt-3 text-xl font-semibold tracking-tight text-ink">
                  {step.label}
                </h3>
                <p className="mt-2 max-w-[16rem] text-sm leading-relaxed text-muted">
                  {step.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Explore by care area */}
      <section className="pb-16 sm:pb-20">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Explore by care area</Eyebrow>
          <Link
            href="/explore"
            className="font-mono text-[11px] uppercase tracking-wider text-muted transition-colors hover:text-ink"
          >
            All areas →
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {CARE_AREAS.map((area, i) => (
            <Link
              key={area}
              href="/explore"
              className="group flex min-h-32 flex-col justify-between rounded-card bg-surface p-4 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_56px_-28px_rgba(40,35,25,0.6)]"
            >
              <span className="font-mono text-[10px] tracking-[0.15em] text-muted">
                0{i + 1}
              </span>
              <span className="text-sm font-medium leading-snug text-ink">
                {area}
                <span className="ml-1 inline-block text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink">
                  →
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Brand story + education teasers */}
      <div className="grid gap-4 pb-16 sm:pb-20 lg:grid-cols-2">
        <section className="relative overflow-hidden rounded-card p-6 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)] sm:p-8">
          <div className="absolute inset-0 bg-gradient-to-br from-card-to/40 via-surface to-surface" />
          <div className="relative">
            <Eyebrow>Our story</Eyebrow>
            <p className="mt-5 text-pretty text-2xl italic leading-snug tracking-[-0.01em] text-ink">
              The body drifts. The person doesn&apos;t.
            </p>
            <p className="mt-3 max-w-md text-base leading-relaxed text-muted">
              Why we built Joice, and the standard we hold every protocol to.
            </p>
            <Link
              href="/story"
              className="mt-6 inline-block font-mono text-[11px] uppercase tracking-wider text-ink underline-offset-4 hover:underline"
            >
              Read the story →
            </Link>
          </div>
        </section>

        <section className="rounded-card bg-surface p-6 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)] sm:p-8">
          <Eyebrow>Learn</Eyebrow>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <Link
                key={i}
                href="/learn"
                className="group rounded-2xl bg-canvas p-5 shadow-[0_12px_32px_-24px_rgba(40,35,25,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-24px_rgba(40,35,25,0.6)]"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
                  Article
                </span>
                <span className="mt-8 block h-2 w-3/4 rounded-full bg-line" aria-hidden />
                <span className="mt-2 block h-2 w-1/2 rounded-full bg-line" aria-hidden />
                <span className="mt-5 block font-mono text-[11px] uppercase tracking-wider text-muted transition-colors group-hover:text-ink">
                  Read →
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* Secondary CTA — the page's one dark, high-contrast moment */}
      <section className="relative overflow-hidden rounded-card bg-ink px-6 py-16 text-center sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            background:
              'radial-gradient(60% 80% at 50% 120%, var(--color-card-from) 0%, transparent 70%)',
          }}
        />
        <div className="relative">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-card-to">
            Ready when you are
          </span>
          <p className="mx-auto mt-4 max-w-xl text-balance text-3xl leading-snug tracking-[-0.02em] text-canvas sm:text-4xl">
            The new standard of you.
          </p>
          <Link
            href="/get-started"
            className="mt-8 inline-flex h-14 items-center justify-center rounded-full bg-canvas px-7 text-base font-medium text-ink shadow-[0_14px_34px_-12px_rgba(0,0,0,0.5)] transition-all duration-200 hover:bg-white"
          >
            Get Started
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-4 px-2 py-6">
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
