import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireCommerceEnabled } from '@/lib/commerce-gate';
import { ConfirmationView } from '@/components/checkout/confirmation-view';

export const metadata: Metadata = { title: 'Order confirmed · Joice' };

/**
 * Render per request, never prerender: at image build time no API exists, so a
 * prerender would bake requireCommerceEnabled's flag-off redirect into the
 * static artifact and the live flag could never open the page (the 8db5395
 * incident).
 */
export const dynamic = 'force-dynamic';

/**
 * The confirmation page and the 3DS returnUrl. Suspense because the view
 * reads useSearchParams; the client does the polling with the sessionStorage
 * JWT that never reaches this server.
 */
export default async function CheckoutCompletePage() {
  await requireCommerceEnabled();
  return (
    <Suspense>
      <ConfirmationView />
    </Suspense>
  );
}
