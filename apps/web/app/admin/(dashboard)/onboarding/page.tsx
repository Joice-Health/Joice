'use client';

import Link from 'next/link';
import { useAdminFlowVersions, useServiceAreas } from '@joice/api-client';
import { Badge, Card, PageHeader } from '@/components/admin/ui';

/** The onboarding hub: where things stand and where to do what. */
export default function AdminOnboardingPage() {
  const versions = useAdminFlowVersions();
  const areas = useServiceAreas();
  const published = versions.data?.items.find((v) => v.status === 'published');
  const draft = versions.data?.items.find((v) => v.status === 'draft');
  const open = areas.data?.items.filter((a) => a.status === 'open').length ?? 0;

  const cards: Array<{ href: string; title: string; body: string; badge?: string }> = [
    {
      href: '/admin/onboarding/flow',
      title: 'The flow',
      body: 'Questions, sections, branching and copy. Edit a draft, publish when the report is clean.',
      badge: draft ? `draft v${draft.version}` : published ? `live v${published.version}` : undefined,
    },
    {
      href: '/admin/onboarding/simulator',
      title: 'Simulator',
      body: 'Answer as a persona and watch the path, the gates and why each rule fired. Nothing is saved.',
    },
    {
      href: '/admin/onboarding/versions',
      title: 'Versions',
      body: 'Every draft, published and archived version; publish and roll back move a pointer.',
    },
    {
      href: '/admin/onboarding/service-areas',
      title: 'Service areas',
      body: `Which states are open (${open} today), which say "tell me when", and the minimum age. Separately audited.`,
    },
    {
      href: '/admin/onboarding/funnel',
      title: 'Funnel',
      body: 'Starts, per-question reach and drop, gate outcomes, completions and registrations per version.',
    },
    {
      href: '/admin/onboarding/requests',
      title: 'Notify-me requests',
      body: 'Who asked to hear when their state opens. Its own list, never the waitlist.',
    },
  ];

  return (
    <div>
      <PageHeader title="Onboarding" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="group">
            <Card className="h-full transition-colors group-hover:bg-surface">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base text-ink">{card.title}</h2>
                {card.badge ? <Badge tone="pending">{card.badge}</Badge> : null}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{card.body}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
