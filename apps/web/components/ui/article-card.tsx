import Link from 'next/link';
import type { Article } from '@/lib/site-content';

/** Learn-hub article card with clinician by-line slot. */
export function ArticleCard({ article }: { article: Article }) {
  return (
    <Link
      href={`/learn/${article.slug}`}
      className="group flex flex-col rounded-card bg-surface p-6 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_56px_-28px_rgba(40,35,25,0.6)]"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-brand-700">
        {article.topic}
      </span>
      <h3 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-ink">
        {article.title}
      </h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{article.excerpt}</p>
      <span className="mt-5 flex items-center gap-2.5">
        <span className="h-6 w-6 rounded-full bg-gradient-to-br from-card-to to-brand-200" />
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted transition-colors group-hover:text-ink">
          Joice clinical team
        </span>
      </span>
    </Link>
  );
}
