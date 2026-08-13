import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';
import { ProductCard } from '@/components/ui/product-card';
import { ARTICLES, PRODUCTS, getArticle } from '@/lib/site-content';

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const article = getArticle((await params).slug);
  return article
    ? { title: `${article.title} · Joice Learn`, description: article.excerpt }
    : { title: 'Learn · Joice' };
}

/**
 * Article/explainer template. Body is placeholder pending the content pass.
 * Schema-first: JSON-LD Article markup for SEO/AEO.
 */
export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const article = getArticle((await params).slug);
  if (!article) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.excerpt,
    author: { '@type': 'Organization', name: 'Joice Clinical Team' },
    publisher: { '@type': 'Organization', name: 'Joice' },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="mx-auto w-full max-w-3xl py-16 sm:py-20">
        <Link
          href="/learn"
          className="font-mono text-[11px] uppercase tracking-wider text-muted transition-colors hover:text-ink"
        >
          ← Learn
        </Link>
        <div className="mt-6">
          <Eyebrow>{article.topic}</Eyebrow>
        </div>
        <h1 className="mt-4 text-balance text-4xl leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl">
          {article.title}
        </h1>

        {/* By-line → Clinical Team */}
        <Link href="/clinical-team" className="group mt-6 flex w-fit items-center gap-3">
          <span className="h-9 w-9 rounded-full bg-gradient-to-br from-card-to to-brand-200" />
          <span>
            <span className="block text-sm font-medium text-ink group-hover:underline">
              Joice clinical team
            </span>
            <span className="block font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
              Reviewed · medically accurate
            </span>
          </span>
        </Link>

        {/* Body — placeholder until the content pass */}
        <div className="mt-10 space-y-4 border-t border-line/60 pt-10">
          <p className="text-lg leading-relaxed text-muted">{article.excerpt}</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2.5 pt-4" aria-hidden>
              <span className="block h-2 w-full rounded-full bg-line" />
              <span className="block h-2 w-11/12 rounded-full bg-line" />
              <span className="block h-2 w-3/5 rounded-full bg-line" />
            </div>
          ))}
          <p className="pt-2 font-mono text-[11px] uppercase tracking-wider text-muted">
            Full article pending content pass
          </p>
        </div>
      </article>

      {/* ★ Bidirectional: article → related protocols */}
      <section className="pb-16 sm:pb-20">
        <Eyebrow>Related protocols</Eyebrow>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.slice(0, 3).map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      </section>

      {/* Companion nudge */}
      <section className="glass mb-16 rounded-card p-6 text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_24px_60px_-32px_rgba(40,35,25,0.4)] sm:mb-20 sm:p-10">
        <p className="mx-auto max-w-xl text-balance text-xl leading-snug text-ink">
          Questions this article didn&apos;t answer?
        </p>
        <CtaLink href="/get-started" className="mt-6">
          Ask the Companion
        </CtaLink>
      </section>
    </>
  );
}
