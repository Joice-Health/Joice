import type { Metadata } from 'next';
import { Index } from '@joice/ui';
import { requireShopEnabled } from '@/lib/shop-gate';
import { getProduct } from '@/lib/careportals/products.server';
import { formatPrice } from '@/lib/careportals/types';
import { GLUTATHIONE_ID } from '@/lib/shop-products';
import { Eyebrow } from '@/components/ui/eyebrow';
import { ImageSlot } from '@/components/ui/image-slot';
import { AddToCartButton } from '@/components/shop/add-to-cart-button';
import {
  TripeptideFigure,
  RedoxFigure,
  StepIcon,
} from '@/components/shop/glutathione-figures';

export const metadata: Metadata = {
  title: 'Glutathione · Joice',
  description:
    'An injectable antioxidant compounded by a licensed 503A pharmacy. Available only with a prescription, after an independent licensed physician reviews your health history.',
};

/**
 * Render per request, never prerender: at image build time no API exists, so a
 * prerender would bake requireShopEnabled's flag-off redirect into the static
 * artifact and the live flag could never open the page (the /coming-soon
 * precedent). The CarePortals data cache keeps its own revalidate window.
 */
export const dynamic = 'force-dynamic';

const TRUST_ROW = [
  'Prescription only',
  'Independent licensed physicians',
  'Licensed 503A pharmacy',
];

const STEPS: { icon: 'clipboard' | 'stethoscope' | 'package'; title: string; body: string }[] = [
  {
    icon: 'clipboard',
    title: 'Complete a short medical intake',
    body: 'Health history, current medications, allergies. It takes a few minutes and it is required.',
  },
  {
    icon: 'stethoscope',
    title: 'A physician reviews it',
    body: 'An independently licensed physician of Beluga Health, P.A., licensed in your state, decides whether treatment is appropriate. They may follow up, or decline to prescribe.',
  },
  {
    icon: 'package',
    title: 'A licensed pharmacy fills and ships it',
    body: 'If a prescription is issued, a licensed 503A compounding pharmacy prepares your order and ships it with written instructions.',
  },
];

/**
 * The Glutathione page, built module by module to the approved spec (Shaun's
 * doc, 2026-08-28). Copy is the record of what we tell visitors; edits come
 * from an approved doc, not ad hoc. Add to cart puts the product in the
 * CarePortals cart and lands on /checkout, which hands off to the hosted
 * checkout; the price beside it is live from CarePortals and simply hides if
 * the read fails (the copy never breaks with it).
 */
export default async function GlutathionePage() {
  await requireShopEnabled();
  const product = await getProduct(GLUTATHIONE_ID);
  return (
    <>
      {/* Module 01: hero */}
      <section className="grid gap-10 py-10 animate-fade-up sm:py-14 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <div className="flex flex-col items-start">
          <Eyebrow as="p" className="text-muted">
            Prescription · Compounded · United States
          </Eyebrow>
          <h1 className="mt-6 text-balance text-3xl leading-[1.15] text-ink sm:text-5xl">
            Glutathione, reviewed and prescribed by a physician.
          </h1>
          <p className="mt-6 max-w-lg text-pretty text-lg leading-relaxed text-muted">
            An injectable antioxidant compounded by a licensed 503A pharmacy. Available only
            with a prescription, after an independent licensed physician reviews your health
            history.
          </p>
          {product ? (
            <p className="mt-8 font-mono text-2xl text-ink">
              {formatPrice(product.price, product.currency)}
              {product.isSubscription ? (
                <span className="text-base text-muted">/mo</span>
              ) : null}
              {product.subLabel ? (
                <span className="ml-4 text-sm text-muted">{product.subLabel}</span>
              ) : null}
            </p>
          ) : null}
          <div className="mt-8">
            <AddToCartButton productId={GLUTATHIONE_ID} />
          </div>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
            Requires a short medical intake and physician review. Must be 18 or older.
            Available only in states where our physicians and pharmacy are licensed.
          </p>
          <ul className="mt-10 flex flex-wrap items-center divide-x divide-line border-t border-line pt-6">
            {TRUST_ROW.map((item) => (
              <li key={item} className="mono-label px-4 py-1 text-muted first:pl-0 last:pr-0">
                {item}
              </li>
            ))}
          </ul>
        </div>
        <ImageSlot
          src="products/glutathione.jpg"
          alt=""
          sizes="(min-width: 1024px) 480px, 100vw"
          className="aspect-[4/5] rounded-card sm:aspect-[4/3] lg:aspect-auto"
        />
      </section>

      {/* Module 02: what glutathione is */}
      <section className="border-t border-line py-14 sm:py-20">
        <SectionHeader n={2} label="The molecule" title="What glutathione is">
          Plainly, and without overstatement.
        </SectionHeader>

        <div className="mx-auto mt-10 max-w-2xl space-y-4 text-lg leading-relaxed text-muted">
          <p>
            Glutathione is a naturally occurring compound made from three amino acids:
            cysteine, glutamate, and glycine. It is one of the body&apos;s main intracellular
            antioxidants and is involved in how the liver processes certain compounds.
          </p>
          <p>
            Glutathione participates in the breakdown of hydrogen peroxide, helps recycle
            other antioxidants, and maintains cellular redox balance. After neutralizing an
            oxidant, glutathione converts to an oxidized form that the body can recycle back
            to its active form.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl gap-10 sm:grid-cols-2">
          <figure className="flex flex-col items-center gap-4">
            <TripeptideFigure />
            <figcaption className="max-w-xs text-center text-sm leading-relaxed text-muted">
              Your body assembles glutathione from three amino acids, in nearly every cell.
            </figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-4">
            <RedoxFigure />
            <figcaption className="max-w-xs text-center text-sm leading-relaxed text-muted">
              Active glutathione (GSH) converts to an oxidized form (GSSG) when it
              neutralizes an oxidant, then is recycled back.
            </figcaption>
          </figure>
        </div>

        <div className="mx-auto mt-12 max-w-2xl text-lg leading-relaxed text-muted">
          <p>
            Injectable glutathione is intended to increase glutathione availability. Whether
            that is appropriate for you is a clinical decision, made by a licensed physician
            who has reviewed your history.
          </p>
        </div>

        {/* Changes to this callout need Isaac's eyes. */}
        <div className="mx-auto mt-12 max-w-2xl rounded-card bg-surface p-8 sm:p-10">
          <h3 className="mono-label text-ink">What we do not claim</h3>
          <div className="mt-4 space-y-4 leading-relaxed text-muted">
            <p>
              Compounded glutathione is not an FDA-approved drug. Compounded preparations are
              not reviewed by the FDA for safety, effectiveness, or manufacturing quality.
              Glutathione has not been shown to prevent, treat, or cure any disease, and we
              make no claim that it will.
            </p>
            <p>
              We do not offer glutathione for skin lightening, skin bleaching, or any
              cosmetic change in skin color. The FDA has warned consumers that injectable
              skin-lightening products may be unsafe. We will not sell it for that purpose.
            </p>
          </div>
        </div>
      </section>

      {/* Module 03: how it works */}
      <section className="border-t border-line py-14 sm:py-20">
        <SectionHeader n={3} label="The process" title="How it works">
          Three steps. No office visit required.
        </SectionHeader>

        <ol className="mx-auto mt-12 grid max-w-4xl gap-10 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.title} className="flex flex-col items-start gap-4">
              <StepIcon kind={step.icon} />
              <h3 className="text-xl text-ink">{step.title}</h3>
              <p className="leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="mx-auto mt-12 max-w-2xl rounded-card bg-surface p-8 sm:p-10">
          <h3 className="mono-label text-ink">Prescription only</h3>
          <p className="mt-4 leading-relaxed text-muted">
            Completing an intake or paying does not guarantee a prescription. If a physician
            determines treatment is not appropriate for you, no product is dispensed and you
            are not charged for it.
          </p>
        </div>
      </section>

      {/* Module 04: safety and side effects */}
      <section className="border-t border-line py-14 sm:py-20">
        <SectionHeader n={4} label="Safety" title="Safety and side effects">
          Your physician reviews all of this with you before prescribing.
        </SectionHeader>

        <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2">
          <div className="rounded-card bg-surface p-8 sm:p-10">
            <h3 className="mono-label text-ink">Who it may not be right for</h3>
            <div className="mt-4 space-y-4 leading-relaxed text-muted">
              <p>
                Injectable glutathione is not appropriate for everyone. A physician will
                generally avoid it, or review it closely, for anyone who is pregnant or
                breastfeeding, has a serious allergy to glutathione or any ingredient in the
                formulation, or has had a previous serious reaction to injectable
                glutathione.
              </p>
              <p>
                Additional review matters for active asthma or a history of bronchospasm,
                significant respiratory disease, severe liver or kidney disease, active
                cancer or current cancer treatment, and a history of severe allergic
                reactions. Tell your physician about every medication and supplement you
                take.
              </p>
            </div>
          </div>
          <div className="rounded-card bg-surface p-8 sm:p-10">
            <h3 className="mono-label text-ink">Possible side effects</h3>
            <div className="mt-4 space-y-4 leading-relaxed text-muted">
              <p>
                Possible side effects include redness, itching, tenderness, swelling,
                bruising, burning, or stinging at the injection site; flushing or warmth;
                nausea, stomach discomfort, or bloating; headache, dizziness, temporary
                fatigue, rash, or itching.
              </p>
              <p>
                Stop treatment and seek immediate medical care for difficulty breathing,
                facial or throat swelling, widespread hives, or another suspected serious
                allergic reaction. In an emergency, call 911.
              </p>
              <p>
                You can also report side effects to the FDA&apos;s MedWatch program at{' '}
                <a
                  href="tel:1-800-332-1088"
                  className="text-ink underline decoration-dotted underline-offset-4 hover:text-brand-700"
                >
                  1-800-FDA-1088
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/** Module opener: `[ NN ] LABEL` eyebrow, display title, one muted line. */
function SectionHeader({
  n,
  label,
  title,
  children,
}: {
  n: number;
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
      <p className="mono-label flex items-center gap-3 text-muted">
        <Index n={n} />
        <span>{label}</span>
      </p>
      <h2 className="display mt-5 text-balance text-4xl text-ink sm:text-6xl">{title}</h2>
      <p className="mt-4 text-lg leading-relaxed text-muted">{children}</p>
    </div>
  );
}
