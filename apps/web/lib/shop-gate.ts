import 'server-only';
import { redirect } from 'next/navigation';
import { FLAG_KEYS } from '@joice/core/schemas';
import { flagEnabled } from '@/lib/flags';

/**
 * The shop kill switch. Every (shop) server page opens with this: `shop` flag
 * off (toggled in /admin/flags) and the public sees /waitlist within about a
 * minute, no deploy. Per-page rather than in the layout, the house precedent
 * (app/waitlist/page.tsx), because layouts do not reliably re-run on soft
 * navigation. The permanent legal pages deliberately never call it.
 *
 * Every page that calls this must also `export const dynamic =
 * 'force-dynamic'`: at image build time no API exists, so a static prerender
 * bakes the flag-off redirect into the artifact and the live flag can never
 * open the page again. A helper cannot force that; Next reads the export from
 * the page module itself.
 */
export async function requireShopEnabled(): Promise<void> {
  if (!(await flagEnabled(FLAG_KEYS.shop))) redirect('/waitlist');
}
