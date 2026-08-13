import type { Metadata } from 'next';
import { BoardIntro } from '@/components/clinical-team/board-intro';
import { Profiles } from '@/components/clinical-team/profiles';
import { Standards } from '@/components/clinical-team/standards';
import { LearnBylines } from '@/components/clinical-team/learn-bylines';
import { GetStartedCta } from '@/components/ui/get-started-cta';

export const metadata: Metadata = {
  title: 'Clinical Team · Joice',
  description:
    'The licensed clinicians who set, review, and stand behind every Joice protocol.',
};

/**
 * Clinical team page (/clinical-team) — team-gated with the rest of the main
 * site until SITE_LAUNCHED. Copy/roster are placeholder until the content pass.
 */
export default function ClinicalTeamPage() {
  return (
    <>
      <BoardIntro />
      <Profiles />
      <Standards />
      <LearnBylines />
      <GetStartedCta />
    </>
  );
}
