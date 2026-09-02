import 'server-only';
import { redirect } from 'next/navigation';
import { FLAG_KEYS } from '@joice/core/schemas';
import { flagEnabled } from '@/lib/flags';

/**
 * The production shop's kill switch (docs/shop/01-commerce.md section 3).
 * Every new-shop server page (everything under /shop: catalogue, the
 * /shop/[slug] pages, /shop/cart, /shop/checkout) opens with this:
 * `commerce` flag off (toggled in
 * /admin/flags) and visitors see /waitlist within about a minute, no deploy.
 * Independent of requireShopEnabled (lib/shop-gate.ts), which guards the
 * certification storefront at /store. Per-page rather than in the layout, the
 * house precedent (app/waitlist/page.tsx), because layouts do not reliably
 * re-run on soft navigation.
 *
 * Every page that calls this must also `export const dynamic =
 * 'force-dynamic'`: at image build time no API exists, so a static prerender
 * bakes the flag-off redirect into the artifact and the live flag can never
 * open the page again (the 8db5395 incident). A helper cannot force that;
 * Next reads the export from the page module itself.
 */
export async function requireCommerceEnabled(): Promise<void> {
  if (!(await flagEnabled(FLAG_KEYS.commerce))) redirect('/waitlist');
}
