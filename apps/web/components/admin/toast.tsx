'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { cn } from '@joice/ui';

/**
 * Minimal admin toast: a frosted pill in the bottom-right corner, auto-dismissed.
 * Frost is sanctioned here because toasts float over content.
 */

type ToastTone = 'default' | 'danger';
type ToastItem = { id: number; message: string; tone: ToastTone };
type ToastFn = (message: string, opts?: { tone?: ToastTone }) => void;

const ToastContext = createContext<ToastFn | null>(null);

export function useToast(): ToastFn {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast must be used inside ToastProvider');
  return toast;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const toast = useCallback<ToastFn>((message, opts) => {
    const id = nextId.current++;
    // Keep at most three on screen; the oldest gives way.
    setToasts((prev) => [...prev.slice(-2), { id, message, tone: opts?.tone ?? 'default' }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-6 bottom-6 z-50 flex flex-col items-end gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'glass animate-fade-up rounded-full px-5 py-3 text-sm',
              t.tone === 'danger' ? 'text-danger' : 'text-ink',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
