'use client';

import Link from 'next/link';
import { Index } from '@joice/ui';
import { useAdminFlowVersions, useServiceAreas } from '@joice/api-client';
import { Badge, PageHeader } from '@/components/admin/ui';

/**
 * The onboarding overview: an indexed list of the section's surfaces with
 * their live status. Every row is also in the sidebar; this page is the
 * at-a-glance answer to "where do things stand".
 */
export default function AdminOnboardingPage() {
  const versions = useAdminFlowVersions();
  const areas = useServiceAreas();
  const published = versions.data?.items.find((v) => v.status === 'published');
  const draft = versions.data?.items.find((v) => v.status === 'draft');
  const open = areas.data?.items.filter((a) => a.status === 'open').length ?? 0;

  const rows: Array<{ href: string; title: string; body: string; badge?: string }> = [
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
      <PageHeader eyebrow="Onboarding" title="Onboarding" />
      <div className="max-w-4xl border-t border-line">
        {rows.map((row, i) => (
          <Link
            key={row.href}
            href={row.href}
            className="flex items-start justify-between gap-6 border-b border-line px-2 py-5 transition-colors hover:bg-surface/60"
          >
            <div className="flex items-start gap-4">
              <Index n={i + 1} className="mono-label mt-1 text-muted" />
              <div>
                <h2 className="text-base text-ink">{row.title}</h2>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">{row.body}</p>
              </div>
            </div>
            {row.badge ? <Badge tone="pending">{row.badge}</Badge> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
