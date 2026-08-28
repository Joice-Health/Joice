import type { Metadata } from 'next';
import { PageIntro } from '@/components/ui/page-intro';

export const metadata: Metadata = { title: 'FAQ · Joice' };

/** Placeholder until the approved copy lands; the page must exist and resolve. */
export default function FaqPage() {
  return (
    <PageIntro eyebrow="Support" title="Questions, answered">
      Full content is being finalised and will appear here.
    </PageIntro>
  );
}
