'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@joice/ui';

/**
 * Grouped admin navigation, drawn for the dark bg-ink rail (and the mobile
 * drawer, which is the same surface). Exact-match routes are hub pages whose
 * children have their own entries below them.
 */
const NAV_GROUPS: { heading: string; links: { href: string; label: string; exact?: boolean }[] }[] = [
  {
    heading: 'Overview',
    links: [{ href: '/admin', label: 'Dashboard', exact: true }],
  },
  {
    heading: 'People',
    links: [
      { href: '/admin/waitlist', label: 'Waitlist' },
      { href: '/admin/leads', label: 'Leads' },
      { href: '/admin/users', label: 'Users' },
      { href: '/admin/admins', label: 'Admins' },
    ],
  },
  {
    heading: 'Brain',
    links: [
      { href: '/admin/brain', label: 'Brain settings' },
      { href: '/admin/eval', label: 'Eval console' },
    ],
  },
  {
    heading: 'Onboarding',
    links: [
      { href: '/admin/onboarding', label: 'Overview', exact: true },
      { href: '/admin/onboarding/flow', label: 'Flow' },
      { href: '/admin/onboarding/simulator', label: 'Simulator' },
      { href: '/admin/onboarding/versions', label: 'Versions' },
      { href: '/admin/onboarding/service-areas', label: 'Service areas' },
      { href: '/admin/onboarding/funnel', label: 'Funnel' },
      { href: '/admin/onboarding/requests', label: 'Notify requests' },
    ],
  },
  {
    heading: 'Platform',
    links: [
      { href: '/admin/flags', label: 'Feature flags' },
      { href: '/admin/settings', label: 'Settings' },
      { href: '/admin/audit', label: 'Audit log' },
    ],
  },
];

export function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col">
      {NAV_GROUPS.map(({ heading, links }) => (
        <div key={heading} className="mt-6 first:mt-0">
          <p className="mono-label mb-2 text-canvas/50">{heading}</p>
          <div className="flex flex-col gap-0.5">
            {links.map(({ href, label, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    'mono-label flex items-center rounded-full px-3 py-2 transition-colors',
                    active
                      ? 'bg-surface/15 text-canvas'
                      : 'text-canvas/70 hover:bg-surface/10 hover:text-canvas',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'mr-2 inline-block size-1.5 rounded-full',
                      active ? 'bg-brand-400' : 'bg-transparent',
                    )}
                  />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
