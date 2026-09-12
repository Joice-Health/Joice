'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@joice/ui';
import { usePublicFlags, type ChatProduct, type ProductShelf } from '@joice/api-client';
import { careAreaLabel } from '@joice/utils';
import { catalogEntryBySlug, catalogImage } from '@/lib/shop-catalog';
import { formatPrice } from '@/lib/careportals/types';
import { useAddToCart } from '@/lib/careportals/use-cart';
import { CtaLink } from '@/components/ui/cta-link';
import { track } from '@/lib/analytics';

/**
 * The product surface under a chat answer: one card for one product, a
 * plain-CSS snap carousel for several. Chat-owned on purpose: it obeys the
 * transcript's constraints (client component, no fs, no navigation on add)
 * and is never reused on shop pages.
 *
 * Trust boundary: the wire carries only what search_catalogue actually
 * returned, and this component joins BY SLUG against the shared SHOP_CATALOG
 * for image, hue and the CarePortals id. A slug outside the catalog renders
 * facts with no CTAs: never a link into a 404, never an add for an unknown
 * id. Add to cart shows only when the server said canOrder AND the commerce
 * flag is on AND the product is available AND the slug joins.
 */

export function ProductShelfBlock({
  shelf,
  onEngage,
}: {
  shelf: ProductShelf;
  /** Card engagement is a buying signal; the chat's conversion machinery listens. */
  onEngage?: () => void;
}) {
  const flags = usePublicFlags();
  // Undefined until the query lands = commerce off: the button can only ever
  // appear, never vanish (the CartLink SSR discipline).
  const commerceOn = flags.data?.commerce === true;

  if (shelf.items.length === 1) {
    return (
      <div className="mt-3 max-w-md">
        <ProductCard
          product={shelf.items[0]!}
          canOrder={shelf.canOrder}
          commerceOn={commerceOn}
          onEngage={onEngage}
        />
      </div>
    );
  }
  return (
    <ul
      // tabIndex: with CTAs hidden (commerce off) the cards hold nothing
      // focusable, and a scroll region must stay keyboard-reachable.
      tabIndex={0}
      className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Products mentioned in this answer"
    >
      {shelf.items.map((product) => (
        <li key={product.slug} className="w-64 shrink-0 snap-start">
          <ProductCard
            product={product}
            canOrder={shelf.canOrder}
            commerceOn={commerceOn}
            onEngage={onEngage}
          />
        </li>
      ))}
      {/* Some browsers drop a flex scroller's trailing padding; keep an edge. */}
      <li aria-hidden className="w-px shrink-0" />
    </ul>
  );
}

function ProductCard({
  product,
  canOrder,
  commerceOn,
  onEngage,
}: {
  product: ChatProduct;
  canOrder: boolean;
  commerceOn: boolean;
  onEngage?: () => void;
}) {
  // The slug join: entry present means real page, real image path, real
  // CarePortals id. Absent (curation drift) the card is facts only.
  const entry = catalogEntryBySlug(product.slug);
  const showCtas = commerceOn && Boolean(entry);
  const showAdd = showCtas && canOrder && product.available && Boolean(entry?.careportalsId);

  return (
    <div className="panel flex h-full flex-col gap-2 rounded-card p-4">
      <ChatImageSlot
        src={entry ? `/${catalogImage(entry)}` : undefined}
        hue={entry?.hue ?? 128}
      />
      {product.careArea ? (
        <span className="mono-label text-muted">
          {careAreaLabel(product.careArea)}
        </span>
      ) : null}
      <span className="mono-label text-ink">{product.name}</span>
      {product.subLabel ? <span className="text-sm text-muted">{product.subLabel}</span> : null}
      {product.available ? (
        <span className="font-mono text-sm text-muted">
          {formatPrice(product.price, product.currency)}
          {product.isSubscription ? <span className="text-xs">/mo</span> : null}
        </span>
      ) : (
        <span className="mono-label text-muted">Not currently available</span>
      )}
      {showCtas ? (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <CtaLink
            href={`/shop/${product.slug}`}
            size="sm"
            // New tab until history persistence ships: the transcript is
            // client state, and an in-tab navigation would destroy the
            // conversation this card came from (doc 13 decision).
            target="_blank"
            rel="noopener"
            onClick={() => {
              track({ event: 'chat_product_view_clicked' });
              onEngage?.();
            }}
          >
            View +
          </CtaLink>
          {showAdd ? (
            <ChatAddToCart productId={entry!.careportalsId} onEngage={onEngage} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Add to cart that STAYS in the conversation: quiet confirmation with a cart
 * link, never a navigation. The nav's cart badge updates through the shared
 * query cache.
 */
function ChatAddToCart({ productId, onEngage }: { productId: string; onEngage?: () => void }) {
  const add = useAddToCart();
  const [added, setAdded] = useState(false);
  const [failed, setFailed] = useState(false);
  const cartLinkRef = useRef<HTMLAnchorElement>(null);

  // The Add button unmounts on success; hand focus to the link that replaced
  // it so keyboard users are not dropped to the body.
  useEffect(() => {
    if (added) cartLinkRef.current?.focus();
  }, [added]);

  if (added) {
    return (
      <span className="flex items-center gap-2" role="status">
        <span className="mono-label text-muted">Added.</span>
        <CtaLink ref={cartLinkRef} href="/shop/cart" size="sm" target="_blank" rel="noopener">
          View cart +
        </CtaLink>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <Button
        size="sm"
        disabled={add.isPending}
        onClick={() => {
          setFailed(false);
          onEngage?.();
          add.mutate(
            { productId },
            {
              onSuccess: () => {
                setAdded(true);
                track({ event: 'cart_item_added', source: 'chat' });
              },
              onError: () => setFailed(true),
            },
          );
        }}
      >
        {add.isPending ? 'Adding…' : 'Add to cart +'}
      </Button>
      {failed ? (
        <span className="mono-label text-muted" role="status">
          Couldn&rsquo;t add. Try again.
        </span>
      ) : null}
    </span>
  );
}

/**
 * The client-side image slot: the designed organic-field gradient always
 * (pure CSS, keyed by hue), with the photo fading in over it when the file
 * exists. No fs check, no 404 flash: onError simply leaves the field, which
 * is the designed state, not a degraded one.
 */
function ChatImageSlot({ src, hue }: { src?: string; hue: number }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div
      className="organic-field relative aspect-[3/1] w-full overflow-hidden rounded-sm"
      style={{ '--h': hue } as React.CSSProperties}
    >
      {src && !failed ? (
        // Plain img on purpose: no next/image ceremony at this size, and the
        // gradient beneath makes progressive loading invisible. onError keeps
        // the designed field and stops re-requesting a photo that is not
        // there yet (most products await photography).
        <img
          src={src}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}
