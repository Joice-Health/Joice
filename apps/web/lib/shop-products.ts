/**
 * The curated certification shelf, in display order. This const is the whole
 * merchandising surface: edit it to change what /shop shows. Ids are
 * CarePortals product `_id`s; see them all with
 * `curl -H 'organization: joicehealth_com' https://public-api.portals.care/v2/products`.
 * Disabled products and unknown ids are dropped at render, so a stale entry
 * degrades to "not shown", never to a broken page.
 *
 * Glutathione only for the certification (decided 2026-08-28): the 1 month
 * 6000mg/30mL preparation, the 200 mg/mL solution the FAQ describes.
 */
/** Glutathione Injectable, 1 month / 6000mg / 30mL (200 mg/mL), $68. */
export const GLUTATHIONE_ID = '6a7a18a99d94da87b1d1d956';

export const SHOP_PRODUCT_IDS: readonly string[] = [GLUTATHIONE_ID];

/**
 * Products with a bespoke page. A shelf row for one of these links here
 * instead of the generic /shop/[id] template.
 */
export const PRODUCT_PAGES: Record<string, string> = {
  [GLUTATHIONE_ID]: '/shop/glutathione',
};

/**
 * Product photography, as paths under public/. Products without an entry fall
 * back to the per-id convention, and ImageSlot renders the designed organic
 * field when the file is missing either way, so a wrong path degrades to the
 * placeholder, never a broken image.
 */
export const PRODUCT_IMAGES: Record<string, string> = {
  [GLUTATHIONE_ID]: 'shop/product/peptide_product.png',
};

export function productImage(id: string): string {
  return PRODUCT_IMAGES[id] ?? `products/${id}.jpg`;
}
