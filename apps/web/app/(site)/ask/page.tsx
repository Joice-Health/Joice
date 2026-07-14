import type { Metadata } from 'next';
import { PageIntro } from '@/components/ui/page-intro';
import { PeptideChat } from '@/components/chat/peptide-chat';

export const metadata: Metadata = {
  title: 'Ask Joice',
  description: 'Grounded answers about peptides, sourced from our clinical team’s notes.',
};

/** Team-gated pre-launch (site middleware); becomes the member "brain" at launch. */
export default function AskPage() {
  return (
    <>
      <PageIntro eyebrow="Companion" title="Ask Joice">
        Answers come straight from our clinical team’s reference notes — every claim
        cites its source, and we say so when the notes don’t cover something.
      </PageIntro>
      <section className="pb-24">
        <PeptideChat />
      </section>
    </>
  );
}
