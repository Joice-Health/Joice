import Link from 'next/link';
import { Eyebrow } from '@/components/ui/eyebrow';

/** Side-by-side brand story + education (Learn) teasers. */
export function Teasers() {
  return (
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
  );
}
