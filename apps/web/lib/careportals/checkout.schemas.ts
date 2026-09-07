import { z } from 'zod';
import { US_STATE_CODES } from '@joice/utils';

/**
 * Client-side validation for the custom checkout's contact and shipping
 * steps. Local to apps/web rather than @joice/core/schemas on purpose: these
 * mirror the CarePortals Patient API's shapes (third-party, verified live in
 * docs/shop/01-commerce.md section 10), and nothing outside the web app
 * consumes them. The server of record is CarePortals; this layer exists so a
 * visitor hears about a bad field from us, in our words, before anything
 * leaves the browser.
 *
 * House form rules: safeParse on submit, first issue only, one error line per
 * field (waitlist-form.tsx precedent).
 */

/** True when `dob` (YYYY-MM-DD) reaches `years` on or before `today`. */
export function isAtLeastAge(dob: string, years: number, today: Date): boolean {
  const [y, m, d] = dob.split('-').map(Number);
  if (!y || !m || !d) return false;
  const cutoff = new Date(Date.UTC(y + years, m - 1, d));
  return cutoff.getTime() <= today.getTime();
}

/**
 * US phone, normalized to the E.164 form the Patient API stores
 * (spike-verified: "+15555550100" round-trips). Accepts the ways people
 * actually type it: digits, spaces, dots, dashes, parens, an optional +1.
 */
export function normalizeUsPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  // A US number never starts its area code or exchange with 0 or 1.
  if (/[01]/.test(national[0]!) || /[01]/.test(national[3]!)) return null;
  return `+1${national}`;
}

const dobField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth.')
  .refine((dob) => isAtLeastAge(dob, 18, new Date()), {
    message: 'You must be 18 or older to order.',
  });

const phoneField = z
  .string()
  .trim()
  .min(1, 'Enter your phone number.')
  .transform((raw, ctx) => {
    const normalized = normalizeUsPhone(raw);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a 10-digit US phone number.' });
      return z.NEVER;
    }
    return normalized;
  });

/**
 * The contact step: the Patient API's six required account fields plus the
 * password, which our flow needs because only /auth/login returns the JWT
 * (and the buyer then holds working portal credentials for the medical
 * intake). Sex options are the two values the pharmacy record accepts.
 */
export const contactSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  firstName: z.string().trim().min(1, 'Enter your first name.').max(100),
  lastName: z.string().trim().min(1, 'Enter your last name.').max(100),
  phone: phoneField,
  dob: dobField,
  gender: z.enum(['female', 'male'], { message: 'Choose an option.' }),
  password: z
    .string()
    .min(8, 'Use at least 8 characters.')
    .max(200, 'Use at most 200 characters.'),
});
export type ContactInput = z.infer<typeof contactSchema>;

/** The sign-in mode of the contact step (email known to CarePortals). */
export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
export type SignInInput = z.infer<typeof signInSchema>;

/**
 * The shipping step, in the exact field names the payments call wants
 * (address1/city/provinceCode/postalCode/countryCode, guide-verified).
 * US-only at launch, like the intake's state gate.
 */
export const shippingSchema = z.object({
  address1: z.string().trim().min(1, 'Enter your street address.').max(200),
  address2: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined)),
  city: z.string().trim().min(1, 'Enter your city.').max(100),
  provinceCode: z.enum(US_STATE_CODES, { message: 'Choose your state.' }),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, 'Enter a 5-digit ZIP code.'),
  countryCode: z.literal('US').default('US'),
});
export type ShippingInput = z.infer<typeof shippingSchema>;
