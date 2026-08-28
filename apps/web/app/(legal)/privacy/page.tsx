import type { Metadata } from 'next';
import { PageIntro } from '@/components/ui/page-intro';

export const metadata: Metadata = { title: 'Privacy Policy · Joice' };

/** Placeholder until the approved copy lands; the page must exist and resolve. */
export default function PrivacyPage() {
  return (
    <PageIntro eyebrow="Legal" title="Privacy Policy">
      Full content is being finalised and will appear here.
    </PageIntro>
  );
}
