import { Hero } from '@/components/home/hero';
import { WhoThisIsFor } from '@/components/home/who-this-is-for';
import { CareAreas } from '@/components/home/care-areas';
import { HowItWorks } from '@/components/home/how-it-works';
import { Values } from '@/components/home/values';
import { ClinicalTeam } from '@/components/home/clinical-team';
import { Teasers } from '@/components/home/teasers';
import { GetStartedCta } from '@/components/ui/get-started-cta';

/**
 * The future main-site landing, parked at /preview while the storefront owns
 * the site root (sc-251): team-gated until SITE_LAUNCHED (middleware redirects
 * the public to /waitlist). Copy is placeholder until the content pass.
 * Nav/footer live in the (site) layout; sections live in components/home.
 */
export default function Home() {
  return (
    <>
      <Hero />
      <WhoThisIsFor />
      <CareAreas />
      <HowItWorks />
      <Values />
      <ClinicalTeam />
      <Teasers />
      <GetStartedCta />
    </>
  );
}
