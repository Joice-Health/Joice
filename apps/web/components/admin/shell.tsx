'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bracket, buttonClasses } from '@joice/ui';
import { BrandMark } from '@/components/ui/brand-mark';
import { AdminNav } from '@/components/admin/nav';
import { ToastProvider } from '@/components/admin/toast';
import { ConfirmProvider } from '@/components/admin/confirm';

/**
 * The admin chrome: a sticky dark rail on desktop, a frosted top bar opening a
 * full-screen bg-ink drawer below lg. The server layout stays the owner of the
 * auth check and passes Clerk's UserButton in through the `user` slot.
 */
export function AdminShell({ user, children }: { user: ReactNode; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const sessionFooter = (
    <div className="mt-auto flex items-center gap-3 border-t border-canvas/15 pt-4">
      {user}
      <span className="mono-label text-canvas/60">Signed in</span>
    </div>
  );

  return (
    <ToastProvider>
      <ConfirmProvider>
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto bg-ink px-5 py-6 text-canvas lg:flex">
          <div className="flex items-baseline justify-between">
            <Link href="/admin" aria-label="Admin home">
              <BrandMark className="text-canvas" />
            </Link>
            <span className="mono-label text-canvas/60">Admin</span>
          </div>
          <div className="mt-8 flex-1">
            <AdminNav />
          </div>
          {sessionFooter}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="glass sticky top-0 z-40 flex h-14 items-center justify-between px-4 lg:hidden">
            <Link href="/admin" aria-label="Admin home">
              <BrandMark className="text-[1.25rem]" />
            </Link>
            <button
              type="button"
              className={buttonClasses({ variant: 'ghost', size: 'sm' })}
              onClick={() => setMenuOpen(true)}
            >
              <Bracket>menu</Bracket>
            </button>
          </header>

          {menuOpen ? (
            <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ink px-6 py-6 text-canvas lg:hidden">
              <div className="flex items-center justify-between">
                <BrandMark className="text-canvas" />
                <button
                  type="button"
                  className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                  onClick={() => setMenuOpen(false)}
                >
                  <Bracket>close</Bracket>
                </button>
              </div>
              <div className="mt-8 flex-1">
                <AdminNav onNavigate={() => setMenuOpen(false)} />
              </div>
              {sessionFooter}
            </div>
          ) : null}

          {children}
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
