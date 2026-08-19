import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';
import { ProductRow } from '@/components/ui/product-row';
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
          className="mono-label text-muted transition-colors hover:text-ink"
        >
          ← Learn
        </Link>
        <div className="mt-6">
          <Eyebrow>{article.topic}</Eyebrow>
        </div>
        <h1 className="mt-4 text-balance text-3xl leading-[1.15] text-ink sm:text-5xl">
          {article.title}
        </h1>

        {/* By-line + Clinical Team */}
        <Link href="/clinical-team" className="group mt-6 flex w-fit items-center gap-3">
          <span className="h-9 w-9 rounded-full border border-line bg-stone/40" />
          <span>
            <span className="block text-sm text-ink group-hover:underline">
              Joice clinical team
            </span>
            <span className="block mono-label text-muted">
              Reviewed · medically accurate
            </span>
          </span>
        </Link>

        {/* Body: placeholder until the content pass */}
        <div className="mt-10 space-y-4 border-t border-line pt-10">
          <p className="text-lg leading-relaxed text-muted">{article.excerpt}</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2.5 pt-4" aria-hidden>
              <span className="block h-2 w-full rounded-full bg-line" />
              <span className="block h-2 w-11/12 rounded-full bg-line" />
              <span className="block h-2 w-3/5 rounded-full bg-line" />
            </div>
          ))}
          <p className="pt-2 mono-label text-muted">
            Full article pending content pass
          </p>
        </div>
      </article>

      {/* Bidirectional: article + related protocols */}
      <section className="border-t border-line py-16 sm:py-20">
        <Eyebrow as="h2">Related protocols</Eyebrow>
        <ul className="mt-8 border-t border-line">
          {PRODUCTS.slice(0, 3).map((product, i) => (
            <ProductRow key={product.slug} product={product} hue={[128, 96, 60][i % 3]} />
          ))}
        </ul>
      </section>

      {/* Companion nudge */}
      <section className="border-t border-line py-16 text-center sm:py-20">
        <p className="mx-auto max-w-xl text-balance text-xl leading-snug text-ink sm:text-2xl">
          Questions this article didn&apos;t answer?
        </p>
        <CtaLink href="/ask" className="mt-6">
          Ask Joice +
        </CtaLink>
      </section>
    </>
  );
}
