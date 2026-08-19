import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageIntro } from '@/components/ui/page-intro';
import { Eyebrow } from '@/components/ui/eyebrow';
import { ProductRow } from '@/components/ui/product-row';
import { ArticleRow } from '@/components/ui/article-row';
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
    ? { title: `${area.name} · Joice`, description: area.blurb }
    : { title: 'Explore · Joice' };
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
      <section className="border-t border-line py-16 sm:py-20">
        <div className="flex items-baseline justify-between">
          <Eyebrow as="h2">Protocols in this area</Eyebrow>
          <Link href="/explore" className="mono-label text-muted transition-colors hover:text-ink">
            ← All care areas
          </Link>
        </div>
        <ul className="mt-8 border-t border-line">
          {products.map((product, i) => (
            <ProductRow key={product.slug} product={product} hue={[128, 96, 60][i % 3]} />
          ))}
        </ul>
      </section>

      {/* Related education */}
      <section className="pb-16 sm:pb-20">
        <div className="flex items-baseline justify-between">
          <Eyebrow as="h2">Related education</Eyebrow>
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

      <GetStartedCta />
    </>
  );
}
