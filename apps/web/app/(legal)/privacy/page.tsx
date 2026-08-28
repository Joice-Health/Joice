import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Index } from '@joice/ui';
import { PageIntro } from '@/components/ui/page-intro';

export const metadata: Metadata = { title: 'Privacy Policy · Joice' };

/**
 * The approved Privacy Policy (Shaun's doc, 2026-08-28), landed verbatim as
 * the copy of record, punctuation included. Edits here come from an approved
 * doc, not ad hoc. The section numbering is the document's own (the text
 * cross-references Section 11), so the indices must stay in step with it.
 */
const SECTIONS: { title: string; body: ReactNode }[] = [
  {
    title: 'Overview',
    body: (
      <>
        <p>
          This Privacy Policy explains how Joice Health, Inc. (&ldquo;Joice,&rdquo;
          &ldquo;we,&rdquo; &ldquo;us&rdquo;) collects, uses, and shares personal information
          when you use our website, app, and membership programs.
        </p>
        <p>
          This Policy covers our platform &mdash; not your clinical care. Information you share
          as part of a medical evaluation or ongoing treatment is collected and used by Beluga
          Health, P.A., your telehealth provider, under Beluga&rsquo;s own Notice of Privacy
          Practices and Privacy Policy, which you&rsquo;ll review and acknowledge separately
          before your intake. Where this Policy and Beluga&rsquo;s Notice both address your
          health information, Beluga&rsquo;s Notice controls.
        </p>
      </>
    ),
  },
  {
    title: 'Information We Collect',
    body: (
      <ul className="flex flex-col gap-3 pl-5 list-disc marker:text-stone">
        <li>
          <span className="text-ink">Account information you provide directly:</span> name,
          contact details, and payment information for non-prescription purchases (we do not
          store full payment card numbers).
        </li>
        <li>
          <span className="text-ink">Intake and consent information:</span> as part of
          connecting you to care, we collect your required telehealth consent and intake
          responses and transmit them securely to Beluga on Beluga&rsquo;s behalf.
        </li>
        <li>
          <span className="text-ink">Onboarding-chat information:</span> responses you share
          with our AI onboarding assistant before formal intake, which help us route you
          appropriately. We&rsquo;re built to avoid retaining unverified health details from
          this conversation beyond what&rsquo;s needed to get you started.
        </li>
        <li>
          <span className="text-ink">Information from Beluga and CarePortals:</span> limited
          information confirming your program status (for example, that an evaluation or
          prescription has occurred), used to keep your account and billing accurate.
        </li>
        <li>
          <span className="text-ink">Automatic information:</span> device and browser data, and
          cookies (see our Cookie Policy for detail).
        </li>
      </ul>
    ),
  },
  {
    title: 'How We Use Your Information',
    body: (
      <ul className="flex flex-col gap-3 pl-5 list-disc marker:text-stone">
        <li>To create and manage your account and process billing;</li>
        <li>
          To collect and securely transmit your required consents and intake information to
          Beluga;
        </li>
        <li>To fulfill orders for non-prescription products;</li>
        <li>To operate and improve our onboarding chat and other Services;</li>
        <li>
          To send you account, order, and &mdash; where you&rsquo;ve opted in &mdash; marketing
          communications;
        </li>
        <li>To comply with applicable law and maintain the security of our Services.</li>
      </ul>
    ),
  },
  {
    title: 'How We Share Your Information',
    body: (
      <>
        <ul className="flex flex-col gap-3 pl-5 list-disc marker:text-stone">
          <li>
            With Beluga and CarePortals, to connect you to care and keep your program status
            accurate;
          </li>
          <li>
            With our pharmacy partner, to fulfill a prescription issued by your Beluga
            provider;
          </li>
          <li>
            With service providers who support our operations &mdash; payments, shipping,
            hosting, analytics, customer support, and the technology behind our onboarding
            chat &mdash; under confidentiality obligations;
          </li>
          <li>
            With regulators or others as required by law, or to protect the safety of you or
            others.
          </li>
        </ul>
        <p className="text-ink">We do not sell your personal information.</p>
      </>
    ),
  },
  {
    title: 'Cookies & Advertising',
    body: (
      <p>
        We and our service providers use cookies and similar technologies to operate the
        Services, understand how they&rsquo;re used, and, where applicable, to support
        advertising. You can manage cookie preferences through your browser and, where required
        by law, through tools we provide, including honoring Global Privacy Control signals.
        See our Cookie Policy for more detail.
      </p>
    ),
  },
  {
    title: 'HIPAA and Your Health Information',
    body: (
      <p>
        Beluga Health, P.A. is the HIPAA Covered Entity for your clinical information, and its
        Notice of Privacy Practices governs your rights regarding that information under HIPAA,
        including the Security Rule (45 C.F.R. Parts 160 and 164) and HITECH. Joice acts as
        Beluga&rsquo;s Business Associate for the limited purposes of the Services we provide,
        meaning we&rsquo;ve agreed to appropriate safeguards, breach-notification procedures,
        and limits on how we use or disclose any protected health information we handle in that
        role.
      </p>
    ),
  },
  {
    title: 'State Privacy Rights',
    body: (
      <>
        <p>
          If you&rsquo;re a resident of California, Colorado, Connecticut, Virginia, or a
          similar state with a comprehensive privacy law, you may have rights to know what
          personal information we&rsquo;ve collected, request its deletion or correction, opt
          out of certain sharing or targeted advertising, limit use of sensitive personal
          information, and not be discriminated against for exercising these rights. We
          don&rsquo;t sell personal information for money. To exercise these rights, contact us
          using the information in Section 11.
        </p>
        <p>
          Some states, including Washington and Nevada, separately regulate &ldquo;consumer
          health data&rdquo; more broadly than HIPAA. We&rsquo;re committed to giving you
          clear, meaningful consent choices around any health-adjacent information collected at
          the Joice platform level, including through our onboarding chat, separate from the
          clinical consent you provide to Beluga.
        </p>
      </>
    ),
  },
  {
    title: 'Data Retention & Security',
    body: (
      <p>
        We retain platform-level information for as long as needed to provide the Services and
        as required by law; your clinical record is retained under Beluga&rsquo;s own retention
        policies. We use administrative, technical, and physical safeguards designed to protect
        your information, though no method of transmission or storage can be guaranteed 100%
        secure.
      </p>
    ),
  },
  {
    title: 'Children’s Privacy',
    body: (
      <p>
        The Services are intended for adults 18 and older. We do not knowingly collect personal
        information from children.
      </p>
    ),
  },
  {
    title: 'Your Choices',
    body: (
      <ul className="flex flex-col gap-3 pl-5 list-disc marker:text-stone">
        <li>
          Access, update, or request deletion of your Joice account information by contacting
          us.
        </li>
        <li>
          Opt out of marketing emails via the unsubscribe link, or marketing texts by replying
          STOP.
        </li>
        <li>
          For requests about your clinical or health record specifically, contact Beluga
          directly &mdash; Joice cannot access or modify that record.
        </li>
      </ul>
    ),
  },
  {
    title: 'Contact Us',
    body: (
      <p>
        Questions about this Privacy Policy or your personal information:{' '}
        <a href="mailto:care@joicehealth.com" className="text-ink underline decoration-stone underline-offset-4 hover:decoration-ink">
          care@joicehealth.com
        </a>
        . Questions about your clinical record: contact Beluga Health, P.A. directly.
      </p>
    ),
  },
  {
    title: 'Changes to This Policy',
    body: (
      <p>
        We may update this Privacy Policy from time to time. We&rsquo;ll post the updated
        version here and, where required by law, notify you directly of material changes.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <>
      <PageIntro eyebrow="Legal" title="Privacy Policy">
        Last updated: August 20, 2026
      </PageIntro>
      <div className="mx-auto max-w-3xl border-t border-line pb-24">
        {SECTIONS.map((section, i) => (
          <section key={section.title} className="border-b border-line py-10">
            <h2 className="flex items-baseline gap-4 text-2xl text-ink">
              <Index n={i + 1} className="mono-label text-muted" />
              {section.title}
            </h2>
            <div className="mt-5 flex flex-col gap-4 leading-relaxed text-muted">
              {section.body}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
