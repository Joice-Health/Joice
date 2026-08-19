'use client';

import { cn } from '@joice/ui';

/**
 * Options as dotted pills, backed by real radio or checkbox inputs (visually
 * hidden) so keyboard arrows, space and screen readers all work the way a
 * native group does. A chosen pill turns solid ink, the house "selected".
 */
export function ChoicePills({
  name,
  options,
  selected,
  multiple,
  onChange,
}: {
  name: string;
  options: ReadonlyArray<{ value: string; label: string; help?: string }>;
  selected: readonly string[];
  multiple: boolean;
  onChange: (next: string[]) => void;
}) {
  function toggle(value: string) {
    if (!multiple) return onChange([value]);
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }
  return (
    <div className="flex flex-wrap gap-2" role={multiple ? 'group' : 'radiogroup'}>
      {options.map((option) => {
        const checked = selected.includes(option.value);
        return (
          <label
            key={option.value}
            className={cn(
              'inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-canvas',
              checked
                ? 'border-solid border-ink bg-ink text-canvas'
                : 'border-dotted border-ink text-ink hover:border-solid hover:bg-ink/[0.04]',
            )}
            title={option.help}
          >
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => toggle(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
