import type { Metadata } from 'next';
import { PageIntro } from '@/components/ui/page-intro';
import { Eyebrow } from '@/components/ui/eyebrow';
import { ArticleRow } from '@/components/ui/article-row';
import { GetStartedCta } from '@/components/ui/get-started-cta';
import { ARTICLES } from '@/lib/site-content';

export const metadata: Metadata = {
  title: 'Learn · Joice',
  description:
    'Clinician-reviewed education on peptides, sourcing, labs, and protocols. No hype.',
};

/** Learn hub (L2): topic organization + article list. SEO/AEO engine. */
export default function LearnPage() {
  const topics = [...new Set(ARTICLES.map((a) => a.topic))];

  return (
    <>
      <PageIntro eyebrow="Learn" title="Understand it before you take it.">
        Everything here is written or reviewed by the clinical team that sets our protocols,
        with by-lines, citations, and no hype.
      </PageIntro>

      <section className="border-t border-line py-16 sm:py-20">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <Eyebrow as="h2">All articles</Eyebrow>
          {/* Topic organization: becomes filterable when the hub grows */}
          <div className="flex flex-wrap gap-2">
            {topics.map((topic) => (
              <span
                key={topic}
                className="mono-label rounded-full border border-line px-3 py-1.5 text-muted"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
        <ul className="mt-8 border-t border-line">
          {ARTICLES.map((article) => (
            <ArticleRow key={article.slug} article={article} />
          ))}
        </ul>
      </section>

      <GetStartedCta />
    </>
  );
}
