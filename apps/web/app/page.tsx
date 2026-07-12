import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';

/**
 * Main site home — reached only with a valid team cookie until SITE_LAUNCHED.
 * The public is redirected to /waitlist by middleware. Build the real site here.
 */
export default function Home() {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 py-10">
      <header className="mb-16 flex w-full items-center justify-between">
        <BrandMark />
        <span className="glass rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]">
          Team preview
        </span>
      </header>

      <section className="flex flex-1 flex-col justify-center animate-fade-up">
        <h1 className="text-balance text-[2.75rem] leading-[1.02] tracking-[-0.03em] text-ink sm:text-6xl">
          The main site starts here.
        </h1>
        <p className="mt-6 max-w-md text-pretty text-lg leading-relaxed text-muted">
          This page is only visible to the team. Everything the public sees still lives on the{' '}
          <Link href="/waitlist" className="text-ink underline underline-offset-4">
            waitlist
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
