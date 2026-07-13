import Link from 'next/link';
import type { Product } from '@/lib/site-content';

/** Catalog card — name, tagline, display-only price slot. */
export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col justify-between rounded-card bg-surface p-6 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_56px_-28px_rgba(40,35,25,0.6)]"
    >
      <div>
        <div className="aspect-4/3 rounded-2xl bg-gradient-to-br from-card-to/50 to-brand-100" />
        <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink">{product.name}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{product.tagline}</p>
      </div>
      <div className="mt-5 flex items-baseline justify-between">
        <span className="font-mono text-sm text-ink">
          $—<span className="text-muted">/mo</span>
        </span>
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted transition-colors group-hover:text-ink">
          View →
        </span>
      </div>
    </Link>
  );
}
