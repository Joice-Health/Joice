import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageIntro } from '@/components/ui/page-intro';
import { Eyebrow } from '@/components/ui/eyebrow';
import { ProductCard } from '@/components/ui/product-card';
import { ArticleCard } from '@/components/ui/article-card';
import { GetStartedCta } from '@/components/ui/get-started-cta';
import { ARTICLES, CARE_AREAS, getCareArea, getProductsByArea } from '@/lib/site-content';

export function generateStaticParams() {
  return CARE_AREAS.map((area) => ({ area: area.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ area: string }>;
}): Promise<Metadata> {
  const area = getCareArea((await params).area);
  return area
    ? { title: `${area.name} — Joice`, description: area.blurb }
    : { title: 'Explore — Joice' };
}

/** Care-area template (L3, ×5): header, products, related education, CTA. */
export default async function CareAreaPage({ params }: { params: Promise<{ area: string }> }) {
  const area = getCareArea((await params).area);
  if (!area) notFound();

  const products = getProductsByArea(area.slug);

  return (
    <>
      <PageIntro eyebrow="Care area" title={area.name}>
        {area.blurb}
      </PageIntro>

      {/* Products in this area */}
      <section className="border-t border-line/60 py-16 sm:py-20">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Protocols in this area</Eyebrow>
          <Link
            href="/explore"
            className="font-mono text-[11px] uppercase tracking-wider text-muted transition-colors hover:text-ink"
          >
            ← All care areas
          </Link>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      </section>

      {/* Related education */}
      <section className="pb-16 sm:pb-20">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Related education</Eyebrow>
          <Link
            href="/learn"
            className="font-mono text-[11px] uppercase tracking-wider text-muted transition-colors hover:text-ink"
          >
            All of Learn →
          </Link>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {ARTICLES.slice(0, 2).map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      </section>

      <GetStartedCta />
    </>
  );
}
