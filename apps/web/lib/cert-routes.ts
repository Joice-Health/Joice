/**
 * Where the certification storefront lives (docs/shop/01-commerce.md section 2).
 * It moved from /shop and /checkout to the neutral /store prefix so the real
 * shop could take the clean routes; the prefix deliberately reads as an
 * ordinary storefront section, never as a temporary site. Every cert-surface
 * link goes through these constants so retiring the surface after the audit is
 * a grep for this module.
 */
export const CERT_SHOP = '/store';
export const CERT_CHECKOUT = '/store/checkout';

/** The generic cert product page for a CarePortals product id. */
export const certProductHref = (id: string) => `${CERT_SHOP}/${id}`;
