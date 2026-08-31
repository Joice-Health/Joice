'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { buttonClasses, cn } from '@joice/ui';

/**
 * Promise-based confirm dialog replacing window.confirm on destructive actions.
 * Centered rather than anchored: the overflow-x-auto table wrappers would clip
 * an anchored popover.
 */

type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
};
type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
type PendingConfirm = { options: ConfirmOptions; resolve: (answer: boolean) => void };

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside ConfirmProvider');
  return confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    [],
  );

  const settle = useCallback(
    (answer: boolean) => {
      pending?.resolve(answer);
      setPending(null);
    },
    [pending],
  );

  useEffect(() => {
    if (!pending) return;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') settle(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/25 p-4"
          onClick={() => settle(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={pending.options.title}
            tabIndex={-1}
            className="animate-fade-up panel w-full max-w-sm rounded-2xl p-6 outline-none"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="mono-label text-ink">{pending.options.title}</p>
            {pending.options.body ? (
              <p className="mt-2 text-sm text-muted">{pending.options.body}</p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                onClick={() => settle(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={cn(
                  buttonClasses({ variant: 'outline', size: 'sm' }),
                  pending.options.danger && 'text-danger',
                )}
                onClick={() => settle(true)}
              >
                {pending.options.confirmLabel ?? 'Confirm +'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}
