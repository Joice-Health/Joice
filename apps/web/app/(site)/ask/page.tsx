import type { Metadata } from 'next';
import { PeptideChat } from '@/components/chat/peptide-chat';

export const metadata: Metadata = {
  title: 'Ask Joice',
  description:
    'Ask about peptides and protocols out loud. Answers come from our clinical team’s research library, with the source attached.',
};

/** Team-gated pre-launch (site middleware); becomes the member "brain" at launch. */
export default function AskPage() {
  return <PeptideChat />;
}
