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
 */
export async function requireShopEnabled(): Promise<void> {
  if (!(await flagEnabled(FLAG_KEYS.shop))) redirect('/waitlist');
}
