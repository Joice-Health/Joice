import { formatPrice, type CareportalsCart } from '@/lib/careportals/types';
import { Eyebrow } from '@/components/ui/eyebrow';

/**
 * The always-visible order summary: lines, quantities, the /mo markers, the
 * discount when one exists, the total. Fed the freshest cart the flow holds
 * (the checkout start's cart once the buyer is signed in, the public cart
 * before that), because the latest response is the source of truth.
 */
export function OrderSummary({ cart }: { cart: CareportalsCart }) {
  return (
    <aside aria-label="Order summary">
      <Eyebrow as="h2">Your order</Eyebrow>
      <ul className="mt-6 border-t border-line">
        {cart.lineItems.map((item) => (
          <li
            key={item.id}
            className="flex items-baseline justify-between gap-6 border-b border-line py-4"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-base text-ink">
                {item.name}
                {item.quantity > 1 ? (
                  <span className="font-mono text-sm text-muted"> ×{item.quantity}</span>
                ) : null}
              </span>
              {item.subLabel ? <span className="text-xs text-muted">{item.subLabel}</span> : null}
            </div>
            <span className="font-mono text-sm text-ink">
              {formatPrice(item.price * item.quantity)}
              {item.isSubscription ? <span className="text-xs text-muted">/mo</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {cart.discountAmount > 0 ? (
        <div className="flex items-baseline justify-between border-b border-line py-3">
          <span className="mono-label text-muted">Discount</span>
          <span className="font-mono text-sm text-muted">-{formatPrice(cart.discountAmount)}</span>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between py-4">
        <span className="mono-label text-ink">Total</span>
        <span className="font-mono text-lg text-ink">{formatPrice(cart.totalAmount)}</span>
      </div>
    </aside>
  );
}
