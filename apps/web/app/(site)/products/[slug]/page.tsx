import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';
import { ImageSlot } from '@/components/ui/image-slot';
import { ArticleRow } from '@/components/ui/article-row';
import { ARTICLES, PRODUCTS, getCareArea, getProduct } from '@/lib/site-content';

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const product = getProduct((await params).slug);
  return product
    ? { title: `${product.name} · Joice`, description: product.tagline }
    : { title: 'Joice' };
}

/* Cost-breakdown rows are display-only placeholders pending pricing sign-off. */
const COST_ROWS = ['Medication', 'Clinical review', 'Shipping & handling'];

/** PDP template (L4, ×N). Copy/science/pricing are placeholders pending content pass. */
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const product = getProduct((await params).slug);
  if (!product) notFound();

  const area = getCareArea(product.area);

  return (
    <>
      {/* Product header */}
      <section className="grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-[1.1fr_1fr]">
        <div className="animate-fade-up">
          {area ? (
            <Link
              href={`/explore/${area.slug}`}
              className="mono-label text-muted transition-colors hover:text-ink"
            >
              ← {area.name}
            </Link>
          ) : null}
          <h1 className="display mt-5 text-balance text-5xl text-ink sm:text-7xl">
            {product.name}
          </h1>
          <p className="mt-5 max-w-md text-pretty text-lg leading-relaxed text-muted">
            {product.tagline}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-6">
            <span className="font-mono text-2xl text-ink">
              $—<span className="text-base text-muted">/mo</span>
            </span>
            <CtaLink href="/get-started" size="lg">
              Is this right for me? +
            </CtaLink>
          </div>
          <p className="mono-label mt-5 text-muted">
            Prescription-gated · no cart · clinician decides with you
          </p>
        </div>
        <ImageSlot
          src={`products/${product.slug}.jpg`}
          alt=""
          sizes="(min-width: 1024px) 40vw, 100vw"
          className="aspect-4/3 rounded-t-card"
        />
      </section>

      {/* What it is */}
      <section className="border-t border-line py-14 sm:py-16">
        <Eyebrow as="h2">What it is</Eyebrow>
        <p className="mt-5 max-w-2xl text-pretty text-xl leading-relaxed text-ink">
          A clinician-guided protocol: medication, dosing plan, and oversight. Not a bottle on
          a shelf.
        </p>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted">
          Full description pending content pass.
        </p>
      </section>

      {/* Science / mechanism */}
      <section className="border-t border-line py-14 sm:py-16">
        <div className="flex items-baseline justify-between">
          <Eyebrow as="h2">The science</Eyebrow>
          <Link
            href="/learn/peptides-101"
            className="mono-label text-muted transition-colors hover:text-ink"
          >
            Deep dive in Learn +
          </Link>
        </div>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
          Mechanism explainer pending content pass. Written and reviewed by the clinical team,
          with citations.
        </p>
      </section>

      {/* Pricing + cost breakdown (display only) */}
      <section className="border-t border-line py-14 sm:py-16">
        <Eyebrow as="h2">Pricing: near cost, on purpose</Eyebrow>
        <div className="mt-6 max-w-md">
          {COST_ROWS.map((row) => (
            <div key={row} className="flex items-center justify-between border-b border-line py-3">
              <span className="text-sm text-muted">{row}</span>
              <span className="font-mono text-sm text-ink">$—</span>
            </div>
          ))}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-ink">Your monthly total</span>
            <span className="font-mono text-base text-ink">$—/mo</span>
          </div>
        </div>
        <p className="mono-label mt-3 text-muted">Display only. Final pricing at consult</p>
      </section>

      {/* Testing & sourcing + clinical attribution */}
      <div className="grid gap-x-16 gap-y-10 border-t border-line py-14 sm:py-16 lg:grid-cols-2">
        <section>
          <Eyebrow as="h2">Testing & sourcing</Eyebrow>
          <p className="mt-4 text-base leading-relaxed text-muted">
            Sourced under written standards, third-party tested, chain of custody documented.
            Certificates pending content pass.
          </p>
          <CtaLink href="/learn/sourcing-and-testing" className="mt-6">
            How our testing works +
          </CtaLink>
        </section>

        <section>
          <Eyebrow as="h2">Clinical attribution</Eyebrow>
          <div className="mt-4 flex items-center gap-4">
            <span className="h-10 w-10 shrink-0 rounded-full border border-line bg-stone/40" />
            <p className="text-base leading-relaxed text-ink">
              Protocol set and reviewed by the Joice clinical team.
            </p>
          </div>
          <CtaLink href="/clinical-team" className="mt-6">
            Meet the team +
          </CtaLink>
        </section>
      </div>

      {/* Protocol-support supplement, conditional */}
      {product.hasSupportSupplement ? (
        <section className="border-t border-line py-14 sm:py-16">
          <Eyebrow as="h2">Pairs with</Eyebrow>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink">
            This protocol has a matched support supplement, included when your clinician
            recommends it.
          </p>
        </section>
      ) : null}

      {/* Related education */}
      <section className="border-t border-line py-14 sm:py-16">
        <Eyebrow as="h2">Related education</Eyebrow>
        <ul className="mt-8 border-t border-line">
          {ARTICLES.slice(0, 2).map((article) => (
            <ArticleRow key={article.slug} article={article} />
          ))}
        </ul>
      </section>

      {/* Primary CTA */}
      <section className="border-t border-line py-20 text-center sm:py-24">
        <p className="display mx-auto max-w-3xl text-balance text-4xl text-ink sm:text-6xl">
          Is this right for you? That&apos;s a clinical question.
        </p>
        <CtaLink href="/get-started" size="lg" className="mt-8">
          Talk it through +
        </CtaLink>
      </section>
    </>
  );
}
