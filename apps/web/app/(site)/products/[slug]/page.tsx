import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';
import { ArticleCard } from '@/components/ui/article-card';
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
    ? { title: `${product.name} — Joice`, description: product.tagline }
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
              className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-brand-700 hover:underline"
            >
              {area.name}
            </Link>
          ) : null}
          <h1 className="mt-4 text-balance text-4xl leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl">
            {product.name}
          </h1>
          <p className="mt-5 max-w-md text-pretty text-lg leading-relaxed text-muted">
            {product.tagline}
          </p>
          <div className="mt-7 flex items-center gap-6">
            <span className="font-mono text-2xl text-ink">
              $—<span className="text-base text-muted">/mo</span>
            </span>
            <CtaLink href="/get-started" size="lg">
              Is this right for me?
            </CtaLink>
          </div>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-wider text-muted">
            Prescription-gated · no cart · clinician decides with you
          </p>
        </div>
        <div className="aspect-4/3 rounded-card bg-gradient-to-br from-card-to/50 to-brand-100 shadow-[0_40px_80px_-32px_rgba(40,30,10,0.45)]" />
      </section>

      {/* What it is */}
      <section className="border-t border-line/60 py-14 sm:py-16">
        <Eyebrow>What it is</Eyebrow>
        <p className="mt-5 max-w-2xl text-pretty text-xl leading-relaxed text-ink">
          A clinician-guided protocol — medication, dosing plan, and oversight — not a bottle
          on a shelf.
        </p>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted">
          Full description pending content pass.
        </p>
      </section>

      {/* Science / mechanism */}
      <section className="border-t border-line/60 py-14 sm:py-16">
        <div className="flex items-baseline justify-between">
          <Eyebrow>The science</Eyebrow>
          <Link
            href="/learn/peptides-101"
            className="font-mono text-[11px] uppercase tracking-wider text-muted transition-colors hover:text-ink"
          >
            Deep dive in Learn →
          </Link>
        </div>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
          Mechanism explainer pending content pass — written and reviewed by the clinical team,
          with citations.
        </p>
      </section>

      {/* Pricing + cost breakdown (display only) */}
      <section className="py-14 sm:py-16">
        <div className="rounded-card bg-surface p-6 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)] sm:p-8">
          <Eyebrow>Pricing — near cost, on purpose</Eyebrow>
          <div className="mt-5 max-w-md">
            {COST_ROWS.map((row) => (
              <div
                key={row}
                className="flex items-center justify-between border-b border-line/60 py-3 last:border-b-0"
              >
                <span className="text-sm text-muted">{row}</span>
                <span className="font-mono text-sm text-ink">$—</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-3">
              <span className="text-sm font-semibold text-ink">Your monthly total</span>
              <span className="font-mono text-base font-semibold text-ink">$—/mo</span>
            </div>
          </div>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-muted">
            Display only — final pricing at consult
          </p>
        </div>
      </section>

      {/* Testing & sourcing + clinical attribution */}
      <div className="grid gap-4 pb-14 sm:pb-16 lg:grid-cols-2">
        <section className="rounded-card bg-surface p-6 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)] sm:p-8">
          <Eyebrow>Testing & sourcing</Eyebrow>
          <p className="mt-4 text-base leading-relaxed text-muted">
            Sourced under written standards, third-party tested, chain of custody documented.
            Certificates pending content pass.
          </p>
          <Link
            href="/learn/sourcing-and-testing"
            className="mt-5 inline-block font-mono text-[11px] uppercase tracking-wider text-ink underline-offset-4 hover:underline"
          >
            How our testing works →
          </Link>
        </section>

        <section className="glass rounded-card p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_24px_60px_-32px_rgba(40,35,25,0.4)] sm:p-8">
          <Eyebrow>Clinical attribution</Eyebrow>
          <div className="mt-4 flex items-center gap-4">
            <span className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-card-to to-brand-200" />
            <p className="text-base leading-relaxed text-ink">
              Protocol set and reviewed by the Joice clinical team.
            </p>
          </div>
          <Link
            href="/clinical-team"
            className="mt-5 inline-block font-mono text-[11px] uppercase tracking-wider text-ink underline-offset-4 hover:underline"
          >
            Meet the team →
          </Link>
        </section>
      </div>

      {/* Protocol-support supplement — conditional */}
      {product.hasSupportSupplement ? (
        <section className="mb-14 rounded-card bg-gradient-to-br from-card-to/30 via-surface to-surface p-6 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)] sm:mb-16 sm:p-8">
          <Eyebrow>Pairs with</Eyebrow>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink">
            This protocol has a matched support supplement — included when your clinician
            recommends it.
          </p>
        </section>
      ) : null}

      {/* Related education */}
      <section className="pb-14 sm:pb-16">
        <Eyebrow>Related education</Eyebrow>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {ARTICLES.slice(0, 2).map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      </section>

      {/* Primary CTA */}
      <section className="relative mb-4 overflow-hidden rounded-card bg-ink px-6 py-14 text-center sm:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            background:
              'radial-gradient(60% 80% at 50% 120%, var(--color-card-from) 0%, transparent 70%)',
          }}
        />
        <div className="relative">
          <p className="mx-auto max-w-xl text-balance text-2xl leading-snug tracking-[-0.02em] text-canvas sm:text-3xl">
            Is this right for you? That&apos;s a clinical question.
          </p>
          <CtaLink href="/get-started" variant="inverted" size="lg" className="mt-7">
            Talk it through
          </CtaLink>
        </div>
      </section>
    </>
  );
}
