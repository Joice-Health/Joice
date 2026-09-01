import 'server-only';
import { getActiveProducts } from '@/lib/careportals/products.server';
import type { CareportalsProduct } from '@/lib/careportals/types';
import {
  SHOP_CATALOG,
  catalogEntriesByArea,
  catalogEntryBySlug,
  type CatalogEntry,
} from '@/lib/shop-catalog';
import type { CareAreaSlug } from '@joice/utils';

/**
 * The merge layer between the local catalogue map (shop-catalog.ts, which
 * products we sell and how they read) and live CarePortals data (name, price,
 * availability). One upstream read per 5-minute cache window feeds every
 * shelf and PDP render.
 *
 * Validation strategy: an entry whose product is missing or disabled upstream
 * is dropped from shelves (a stale curation degrades to "not shown", the
 * shop-products.ts precedent) and answers `null` on its PDP (the page calls
 * notFound()). An unreachable upstream is `undefined` everywhere so pages
 * render the quiet unavailable state, mirroring getProduct's tri-state so
 * page code reads identically to the cert pages.
 */
export interface MerchandisedProduct {
  entry: CatalogEntry;
  live: CareportalsProduct;
}

/** The name a shelf row or PDP shows: the local override, else the live label. */
export function merchandisedName(p: MerchandisedProduct): string {
  return p.entry.name ?? p.live.label;
}

async function liveById(): Promise<Map<string, CareportalsProduct> | undefined> {
  const products = await getActiveProducts();
  if (products === undefined) return undefined;
  return new Map(products.map((p) => [p._id, p]));
}

/** Every catalogue entry with a live active product behind it, in map order. */
export async function getMerchandisedCatalog(): Promise<MerchandisedProduct[] | undefined> {
  const byId = await liveById();
  if (byId === undefined) return undefined;
  return SHOP_CATALOG.flatMap((entry) => {
    const live = byId.get(entry.careportalsId);
    return live ? [{ entry, live }] : [];
  });
}

/** A care-area shelf, rank-sorted, live-backed entries only. */
export async function getMerchandisedByArea(
  area: CareAreaSlug,
): Promise<MerchandisedProduct[] | undefined> {
  const byId = await liveById();
  if (byId === undefined) return undefined;
  return catalogEntriesByArea(area).flatMap((entry) => {
    const live = byId.get(entry.careportalsId);
    return live ? [{ entry, live }] : [];
  });
}

/**
 * One product by its public slug. Tri-state like getProduct: the merchandised
 * product; `null` when the slug is unknown or its product is gone or disabled
 * upstream (the page calls notFound()); `undefined` when CarePortals could
 * not be read.
 */
export async function getMerchandisedProduct(
  slug: string,
): Promise<MerchandisedProduct | null | undefined> {
  const entry = catalogEntryBySlug(slug);
  if (!entry) return null;
  const byId = await liveById();
  if (byId === undefined) return undefined;
  const live = byId.get(entry.careportalsId);
  return live ? { entry, live } : null;
}
