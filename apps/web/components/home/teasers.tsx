import Link from 'next/link';
import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';
import { ARTICLES } from '@/lib/site-content';

/** Side-by-side brand story + education (Learn) teasers. */
export function Teasers() {
  return (
    <div className="grid gap-x-16 gap-y-12 py-16 sm:py-24 lg:grid-cols-2">
      <section>
        <Eyebrow as="h2">Our story</Eyebrow>
        <p className="mt-5 text-pretty text-2xl italic leading-snug text-ink sm:text-3xl">
          The body drifts. The person doesn&apos;t.
        </p>
        <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
          Why we built Joice, and the standard we hold every protocol to.
        </p>
        <CtaLink href="/story" className="mt-7">
          Read the story +
        </CtaLink>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <Eyebrow as="h2">Learn</Eyebrow>
          <Link href="/learn" className="mono-label text-muted transition-colors hover:text-ink">
            All articles +
          </Link>
        </div>
        <ul className="mt-5 border-t border-line">
          {ARTICLES.slice(0, 3).map((article) => (
            <li key={article.slug} className="border-b border-line">
              <Link
                href={`/learn/${article.slug}`}
                className="group grid gap-1 py-4 sm:grid-cols-[7rem_1fr] sm:items-baseline sm:gap-6"
              >
                <span className="mono-label text-muted">{article.topic}</span>
                <span className="text-lg leading-snug text-ink transition-colors group-hover:text-brand-700">
                  {article.title}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
