'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@joice/ui';

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/waitlist', label: 'Waitlist' },
  { href: '/admin/leads', label: 'Leads' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/admins', label: 'Admins' },
  { href: '/admin/brain', label: 'Brain' },
  { href: '/admin/onboarding', label: 'Onboarding' },
  { href: '/admin/flags', label: 'Feature flags' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/admin/audit', label: 'Audit log' },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {LINKS.map(({ href, label }) => {
        const active = href === '/admin' ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-brand-400/20 text-brand-800'
                : 'text-muted hover:bg-white/60 hover:text-ink',
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
