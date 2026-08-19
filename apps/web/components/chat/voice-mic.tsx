'use client';

import { cn } from '@joice/ui';

export type MicState = 'idle' | 'arming' | 'listening' | 'busy';

/**
 * The microphone: the page's primary action, drawn in the house language. A
 * dotted circle on the paper (the button, made round); while listening it
 * fills with ink and its hairline rings turn olive and swell with the live
 * `--level` set on an ancestor (see use-audio-level.ts), so speaking moves
 * the rings, not a glow.
 */
export function VoiceMic({
  state,
  size = 'lg',
  onClick,
  disabled,
}: {
  state: MicState;
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
      data-state={state}
      className={cn(
        'mic outline-none transition-transform duration-300',
        state === 'idle' && 'mic-idle',
        size === 'lg' ? 'h-36 w-36 sm:h-44 sm:w-44' : 'h-11 w-11',
        !disabled && 'hover:scale-[1.02] active:scale-[0.98]',
        disabled && 'cursor-not-allowed opacity-50',
        'focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-4 focus-visible:ring-offset-canvas',
      )}
    >
      {size === 'lg' ? (
        <>
          <span className="mic-ring" aria-hidden="true" />
          <span className="mic-ring mic-ring-outer" aria-hidden="true" />
        </>
      ) : null}
      <span
        className={cn(
          'mic-core grid place-items-center',
          size === 'lg' ? 'h-28 w-28 sm:h-32 sm:w-32' : 'h-11 w-11',
        )}
        aria-hidden="true"
      >
        {listening ? (
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className={size === 'lg' ? 'h-6 w-6' : 'h-3.5 w-3.5'}
          >
            <rect x="7" y="7" width="10" height="10" rx="1" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            className={size === 'lg' ? 'h-9 w-9' : 'h-5 w-5'}
          >
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        )}
      </span>
    </button>
  );
}
