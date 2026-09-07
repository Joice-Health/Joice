'use client';

import { Input } from '@joice/ui';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { StepShell } from './step-shell';

/**
 * The contact step: the Patient API's six required account fields plus the
 * password (only login returns the JWT, and the same credentials open the
 * care portal for the medical intake afterwards). A known email flips the
 * step into sign-in mode with the email kept; the toggle offers it up front.
 */
export interface ContactDraft {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  dob: string;
  gender: string;
  password: string;
}

export type FieldErrors = Partial<Record<string, string>>;

export function StepContact({
  mode,
  draft,
  errors,
  stepError,
  busy,
  onChange,
  onModeChange,
  onSubmit,
}: {
  mode: 'create' | 'signin';
  draft: ContactDraft;
  errors: FieldErrors;
  stepError: string | null;
  busy: boolean;
  onChange: (patch: Partial<ContactDraft>) => void;
  onModeChange: (mode: 'create' | 'signin') => void;
  onSubmit: () => void;
}) {
  const signin = mode === 'signin';

  return (
    <div className="flex flex-col items-start">
      <StepShell
        stepKey={`contact-${mode}`}
        title={signin ? 'Welcome back' : 'About you'}
        help={
          signin
            ? 'Sign in with your care account to continue.'
            : 'This creates your account with our pharmacy partner; you will use it for the short medical intake after checkout.'
        }
        error={stepError}
        busy={busy}
        submitLabel="Continue +"
        onSubmit={onSubmit}
      >
        <Field label="Email" error={errors.email}>
          <Input
            type="email"
            autoComplete="email"
            value={draft.email}
            aria-invalid={errors.email ? true : undefined}
            onChange={(e) => onChange({ email: e.target.value })}
          />
        </Field>

        {signin ? null : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="First name" error={errors.firstName}>
                <Input
                  autoComplete="given-name"
                  value={draft.firstName}
                  aria-invalid={errors.firstName ? true : undefined}
                  onChange={(e) => onChange({ firstName: e.target.value })}
                />
              </Field>
              <Field label="Last name" error={errors.lastName}>
                <Input
                  autoComplete="family-name"
                  value={draft.lastName}
                  aria-invalid={errors.lastName ? true : undefined}
                  onChange={(e) => onChange({ lastName: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Phone" error={errors.phone}>
              <Input
                type="tel"
                autoComplete="tel"
                placeholder="(555) 555-0100"
                value={draft.phone}
                aria-invalid={errors.phone ? true : undefined}
                onChange={(e) => onChange({ phone: e.target.value })}
              />
            </Field>

            <Field label="Date of birth" error={errors.dob}>
              <Input
                type="date"
                autoComplete="bday"
                max={new Date().toISOString().slice(0, 10)}
                min="1900-01-01"
                value={draft.dob}
                aria-invalid={errors.dob ? true : undefined}
                onChange={(e) => onChange({ dob: e.target.value })}
                className="max-w-xs"
              />
            </Field>

            <Field
              label="Sex"
              help="Required for your medical record with our pharmacy partner."
              error={errors.gender}
            >
              <Select
                value={draft.gender}
                aria-invalid={errors.gender ? true : undefined}
                onChange={(e) => onChange({ gender: e.target.value })}
              >
                <option value="">Choose an option</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </Select>
            </Field>
          </>
        )}

        <Field
          label="Password"
          help={signin ? undefined : 'At least 8 characters. This also opens your care portal.'}
          error={errors.password}
        >
          <Input
            type="password"
            autoComplete={signin ? 'current-password' : 'new-password'}
            value={draft.password}
            aria-invalid={errors.password ? true : undefined}
            onChange={(e) => onChange({ password: e.target.value })}
          />
        </Field>
      </StepShell>

      <button
        type="button"
        className="mono-label mt-6 text-muted transition-colors hover:text-ink"
        onClick={() => onModeChange(signin ? 'create' : 'signin')}
      >
        {signin ? 'New here? Create your account' : 'Already ordered with Joice? Sign in'}
      </button>
    </div>
  );
}
