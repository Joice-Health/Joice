import type { Metadata } from 'next';
import { PageIntro } from '@/components/ui/page-intro';
import { Eyebrow } from '@/components/ui/eyebrow';
import { ArticleCard } from '@/components/ui/article-card';
import { GetStartedCta } from '@/components/ui/get-started-cta';
import { ARTICLES } from '@/lib/site-content';

export const metadata: Metadata = {
  title: 'Learn · Joice',
  description:
    'Clinician-reviewed education on peptides, sourcing, labs, and protocols. No hype.',
};

/** Learn hub (L2): topic organization + article grid. SEO/AEO engine. */
export default function LearnPage() {
  const topics = [...new Set(ARTICLES.map((a) => a.topic))];

  return (
    <>
      <PageIntro eyebrow="Learn" title="Understand it before you take it.">
        Everything here is written or reviewed by the clinical team that sets our protocols —
        with by-lines, citations, and no hype.
      </PageIntro>

      <section className="border-t border-line/60 py-16 sm:py-20">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <Eyebrow>All articles</Eyebrow>
          {/* Topic organization — becomes filterable when the hub grows */}
          <div className="flex flex-wrap gap-2">
            {topics.map((topic) => (
              <span
                key={topic}
                className="glass rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {ARTICLES.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      </section>

      <GetStartedCta />
    </>
  );
}
