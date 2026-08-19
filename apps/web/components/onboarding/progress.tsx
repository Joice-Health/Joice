import type { ProgressView } from '@joice/api-client';

/**
 * Where the visitor is: a mono label with the section count and a hairline
 * that fills. `role="progressbar"` so a screen reader hears the percentage.
 */
export function Progress({ progress }: { progress: ProgressView }) {
  return (
    <div className="flex items-center gap-4">
      <span className="mono-label whitespace-nowrap text-muted">
        Section {progress.sectionIndex + 1} of {progress.sectionCount}
      </span>
      <div
        className="h-px flex-1 bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-label="Intake progress"
      >
        <div className="h-px bg-ink transition-[width] duration-500" style={{ width: `${progress.percent}%` }} />
      </div>
    </div>
  );
}
