import type { Metadata } from 'next';
import { PageIntro } from '@/components/ui/page-intro';

export const metadata: Metadata = { title: 'Terms of Service · Joice' };

/** Placeholder until the approved copy lands; the page must exist and resolve. */
export default function TermsPage() {
  return (
    <PageIntro eyebrow="Legal" title="Terms of Service">
      Full content is being finalised and will appear here.
    </PageIntro>
  );
}
