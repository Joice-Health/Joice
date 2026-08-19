import Link from 'next/link';
import type { Article } from '@/lib/site-content';

/**
 * Learn-hub row: topic label, title, excerpt, by-line, hairline beneath.
 * Render inside a `<ul className="border-t border-line">`.
 */
export function ArticleRow({ article }: { article: Article }) {
  return (
    <li className="border-b border-line">
      <Link
        href={`/learn/${article.slug}`}
        className="group grid gap-2 py-6 sm:grid-cols-[9rem_1fr_auto] sm:items-baseline sm:gap-8"
      >
        <span className="mono-label text-muted">{article.topic}</span>
        <span>
          <span className="block text-xl leading-snug text-ink transition-colors group-hover:text-brand-700">
            {article.title}
          </span>
          <span className="mt-2 block max-w-xl text-base leading-relaxed text-muted">
            {article.excerpt}
          </span>
          <span className="mono-label mt-4 block text-muted">Joice clinical team</span>
        </span>
        <span className="mono-label hidden text-muted transition-colors group-hover:text-ink sm:block">
          Read +
        </span>
      </Link>
    </li>
  );
}
