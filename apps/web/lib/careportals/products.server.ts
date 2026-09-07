import 'server-only';
import {
  CAREPORTALS_BASE_URL,
  CAREPORTALS_ORG,
  type CareportalsProduct,
} from './types';

/**
 * Product data changes rarely and staleness is cosmetic (unlike the flag map,
 * whose no-store is about gating correctness), so Next's fetch cache with a
 * 5-minute revalidate is the right trade: the catalogue costs CarePortals one
 * read per window, not one per visitor.
 */
const REVALIDATE_SECONDS = 300;

async function careportalsGet(path: string): Promise<Response> {
  return fetch(`${CAREPORTALS_BASE_URL}${path}`, {
    headers: { organization: CAREPORTALS_ORG },
    next: { revalidate: REVALIDATE_SECONDS },
  });
}

/**
 * The curated shelf: ONE `GET /v2/products`, filtered to active products in
 * `ids`, returned in the curated order. `undefined` means CarePortals could
 * not be read (the page renders its quiet unavailable state, never an error).
 */
export async function getCuratedProducts(
  ids: readonly string[],
): Promise<CareportalsProduct[] | undefined> {
  try {
    const res = await careportalsGet('/v2/products');
    if (!res.ok) return undefined;
    const all = (await res.json()) as CareportalsProduct[];
    const byId = new Map(all.filter((p) => p.status === 'active').map((p) => [p._id, p]));
    return ids.map((id) => byId.get(id)).filter((p): p is CareportalsProduct => p !== undefined);
  } catch {
    return undefined;
  }
}

/**
 * Every active product, unfiltered: the production shop's merge layer
 * (lib/shop-catalog.server.ts) joins these against the local catalogue map.
 * Same one-read-per-window cache and the same `undefined` semantics as the
 * curated read above.
 */
export async function getActiveProducts(): Promise<CareportalsProduct[] | undefined> {
  try {
    const res = await careportalsGet('/v2/products');
    if (!res.ok) return undefined;
    const all = (await res.json()) as CareportalsProduct[];
    return all.filter((p) => p.status === 'active');
  } catch {
    return undefined;
  }
}

/**
 * One product. Tri-state: the product; `null` for gone/disabled (the page
 * calls notFound()); `undefined` for CarePortals unreachable (the page renders
 * the unavailable state, distinct from a real 404).
 */
export async function getProduct(
  id: string,
): Promise<CareportalsProduct | null | undefined> {
  try {
    const res = await careportalsGet(`/v2/products/${encodeURIComponent(id)}`);
    if (res.status === 400 || res.status === 404) return null;
    if (!res.ok) return undefined;
    const product = (await res.json()) as CareportalsProduct;
    return product.status === 'active' ? product : null;
  } catch {
    return undefined;
  }
}
