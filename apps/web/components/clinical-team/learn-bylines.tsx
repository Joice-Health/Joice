import Link from 'next/link';
import { Eyebrow } from '@/components/ui/eyebrow';

/** Articles authored/reviewed by the board — routes into Learn. */
export function LearnBylines() {
  return (
    <section className="pb-16 sm:pb-20">
      <div className="flex items-baseline justify-between">
        <Eyebrow>How they inform our content</Eyebrow>
        <Link
          href="/learn"
          className="font-mono text-[11px] uppercase tracking-wider text-muted transition-colors hover:text-ink"
        >
          All of Learn →
        </Link>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <Link
            key={i}
            href="/learn"
            className="group rounded-card bg-surface p-6 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_56px_-28px_rgba(40,35,25,0.6)]"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
              Article
            </span>
            <span className="mt-8 block h-2 w-3/4 rounded-full bg-line" aria-hidden />
            <span className="mt-2 block h-2 w-1/2 rounded-full bg-line" aria-hidden />
            {/* By-line: author slot ties the article back to the board */}
            <span className="mt-6 flex items-center gap-2.5">
              <span className="h-6 w-6 rounded-full bg-gradient-to-br from-card-to to-brand-200" />
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted transition-colors group-hover:text-ink">
                By-line
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
