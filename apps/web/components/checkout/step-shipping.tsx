'use client';

import { Input } from '@joice/ui';
import { US_STATES } from '@joice/utils';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { StepShell } from './step-shell';
import type { FieldErrors } from './step-contact';

/** The shipping step, in the exact field names the payments call wants. */
export interface ShippingDraft {
  address1: string;
  address2: string;
  city: string;
  provinceCode: string;
  postalCode: string;
}

export function StepShipping({
  draft,
  errors,
  stepError,
  busy,
  onChange,
  onSubmit,
  onBack,
}: {
  draft: ShippingDraft;
  errors: FieldErrors;
  stepError: string | null;
  busy: boolean;
  onChange: (patch: Partial<ShippingDraft>) => void;
  onSubmit: () => void;
  /** Absent once the account step is done; there is nothing to go back to. */
  onBack?: () => void;
}) {
  return (
    <StepShell
      stepKey="shipping"
      title="Where it ships"
      error={stepError}
      busy={busy}
      submitLabel="Continue +"
      onSubmit={onSubmit}
      onBack={onBack}
    >
      <Field label="Street address" error={errors.address1}>
        <Input
          autoComplete="address-line1"
          value={draft.address1}
          aria-invalid={errors.address1 ? true : undefined}
          onChange={(e) => onChange({ address1: e.target.value })}
        />
      </Field>

      <Field label="Apartment or suite" optional error={errors.address2}>
        <Input
          autoComplete="address-line2"
          value={draft.address2}
          onChange={(e) => onChange({ address2: e.target.value })}
        />
      </Field>

      <Field label="City" error={errors.city}>
        <Input
          autoComplete="address-level2"
          value={draft.city}
          aria-invalid={errors.city ? true : undefined}
          onChange={(e) => onChange({ city: e.target.value })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="State" error={errors.provinceCode}>
          <Select
            autoComplete="address-level1"
            value={draft.provinceCode}
            aria-invalid={errors.provinceCode ? true : undefined}
            onChange={(e) => onChange({ provinceCode: e.target.value })}
          >
            <option value="">Choose your state</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ZIP" error={errors.postalCode}>
          <Input
            autoComplete="postal-code"
            inputMode="numeric"
            value={draft.postalCode}
            aria-invalid={errors.postalCode ? true : undefined}
            onChange={(e) => onChange({ postalCode: e.target.value })}
          />
        </Field>
      </div>
    </StepShell>
  );
}
