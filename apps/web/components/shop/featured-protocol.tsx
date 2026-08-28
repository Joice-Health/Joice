import { Index } from '@joice/ui';
import { CtaLink } from '@/components/ui/cta-link';
import { Eyebrow } from '@/components/ui/eyebrow';
import { ImageSlot } from '@/components/ui/image-slot';
import { formatPrice, type CareportalsProduct } from '@/lib/careportals/types';

/**
 * The one-protocol shelf. A list row is the wrong idiom for a shelf of one:
 * this presents the single product as a deliberate feature (the large organic
 * field, the live name and price, `Protocol [ 01 ]` as its shelf position)
 * instead of a catalogue that looks emptied. The row list takes over again
 * the moment a second product joins the curation.
 */
export function FeaturedProtocol({
  product,
  href = `/shop/${product._id}`,
}: {
  product: CareportalsProduct;
  /** Bespoke page override, same as the row (lib/shop-products.ts). */
  href?: string;
}) {
  const dosing = product.subLabel ?? product.description;
  return (
    <section className="border-t border-line py-10 animate-fade-up sm:py-14">
      <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
        <ImageSlot
          src={`products/${product._id}.jpg`}
          alt=""
          sizes="(min-width: 1024px) 48vw, 100vw"
          hue={128}
          className="aspect-[4/3] w-full rounded-card lg:aspect-[4/5] lg:max-h-[560px]"
        />
        <div className="flex flex-col items-start justify-center py-2 lg:py-8">
          <Eyebrow as="p" className="text-muted">
            Protocol <Index n={1} />
          </Eyebrow>
          <h2 className="mt-6 max-w-md text-balance text-3xl leading-[1.15] text-ink sm:text-4xl">
            {product.label}
          </h2>
          {dosing ? (
            <p className="mt-4 max-w-md text-pretty leading-relaxed text-muted">{dosing}</p>
          ) : null}
          <p className="mt-8 font-mono text-2xl text-ink">
            {formatPrice(product.price, product.currency)}
            {product.isSubscription ? <span className="text-base text-muted">/mo</span> : null}
          </p>
          <div className="mt-8">
            <CtaLink href={href}>View the protocol +</CtaLink>
          </div>
        </div>
      </div>
    </section>
  );
}

const ORDERING_STEPS: { title: string; body: string }[] = [
  {
    title: 'Add to cart',
    body: 'Check out on our secure care portal.',
  },
  {
    title: 'A short medical intake',
    body: 'An independent licensed physician reviews your health history and decides whether treatment is appropriate.',
  },
  {
    title: 'The pharmacy ships',
    body: 'If a prescription is issued, a licensed 503A compounding pharmacy prepares your order and ships it.',
  },
];

/**
 * Shelf-wide truth, condensed from the approved product-page copy: why buying
 * here is not a cart-and-checkout, in three real steps. The indices are a
 * sequence, not decoration.
 */
export function OrderingSteps() {
  return (
    <section className="border-t border-line py-14 sm:py-16">
      <Eyebrow as="h2">How ordering works</Eyebrow>
      <ol className="mt-10 grid gap-10 sm:grid-cols-3 sm:gap-8">
        {ORDERING_STEPS.map((step, i) => (
          <li key={step.title} className="flex flex-col items-start gap-3">
            <Index n={i + 1} className="mono-label text-muted" />
            <h3 className="text-xl text-ink">{step.title}</h3>
            <p className="text-pretty leading-relaxed text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-14 border-t border-line pt-8 text-center text-sm text-muted">
        More protocols join the shelf as they clear clinical review.
      </p>
    </section>
  );
}
