'use client';

import { cn } from '@joice/ui';

export type SunState = 'idle' | 'arming' | 'listening' | 'busy';

/**
 * The microphone, as the sun on the horizon — the page's primary action.
 * Its corona is scaled by the live `--level` set on an ancestor (see
 * use-audio-level.ts), so pressing it and speaking literally raises the light.
 */
export function VoiceSun({
  state,
  size = 'lg',
  onClick,
  disabled,
}: {
  state: SunState;
  size?: 'lg' | 'sm';
  onClick: () => void;
  disabled?: boolean;
}) {
  const listening = state === 'listening';
  const label = listening
    ? 'Stop recording'
    : state === 'arming'
      ? 'Connecting microphone'
      : 'Ask by voice';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'sun outline-none transition-transform duration-300',
        state === 'idle' && 'sun-idle',
        size === 'lg' ? 'h-36 w-36 sm:h-44 sm:w-44' : 'h-12 w-12',
        !disabled && 'hover:scale-[1.03] active:scale-[0.98]',
        disabled && 'cursor-not-allowed opacity-60',
        'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-4 focus-visible:ring-offset-canvas',
      )}
    >
      <span className="sun-ring" aria-hidden="true" />
      <span className="sun-ring sun-ring-outer" aria-hidden="true" />
      <span
        className={cn('sun-core grid place-items-center', size === 'lg' ? 'h-28 w-28 sm:h-32 sm:w-32' : 'h-10 w-10')}
        aria-hidden="true"
      >
        {listening ? (
          <svg viewBox="0 0 24 24" fill="currentColor" className={cn('text-[var(--dawn-ember-deep)]', size === 'lg' ? 'h-7 w-7' : 'h-4 w-4')}>
            <rect x="7" y="7" width="10" height="10" rx="2" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            className={cn('text-[var(--dawn-ember-deep)]', size === 'lg' ? 'h-9 w-9' : 'h-5 w-5')}
          >
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        )}
      </span>
    </button>
  );
}
