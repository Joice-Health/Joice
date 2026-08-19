import Link from 'next/link';
import { Eyebrow } from '@/components/ui/eyebrow';
import { ArticleRow } from '@/components/ui/article-row';
import { ARTICLES } from '@/lib/site-content';

/** Articles authored/reviewed by the board, routing into Learn. */
export function LearnBylines() {
  return (
    <section className="border-t border-line py-16 sm:py-20">
      <div className="flex items-baseline justify-between">
        <Eyebrow as="h2">How they inform our content</Eyebrow>
        <Link href="/learn" className="mono-label text-muted transition-colors hover:text-ink">
          All of Learn +
        </Link>
      </div>
      <ul className="mt-8 border-t border-line">
        {ARTICLES.slice(0, 2).map((article) => (
          <ArticleRow key={article.slug} article={article} />
        ))}
      </ul>
    </section>
  );
}
