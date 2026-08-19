import { z } from 'zod';

/**
 * Shared contracts used by both the API (request validation) and the web app
 * (form validation + response typing). Single source of truth for the wire shape.
 *
 * Browser-safe by construction: nothing re-exported from here may import the
 * Postgres driver or the AWS SDK. The onboarding and profile contracts live in
 * their own folders and are re-exported below so the web app, the admin
 * console and the api validate against the same shapes.
 */

export * from './profile';
export * from './rules';
export * from './onboarding';

export const joinWaitlistSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'Enter your first name')
    .max(100, 'First name is too long'),
  lastName: z
    .string()
    .trim()
    .min(1, 'Enter your last name')
    .max(100, 'Last name is too long'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Enter a valid email')
    .max(254, 'Email is too long')
    .email('Enter a valid email'),
  /** Optional referral code captured from ?ref= on the waitlist page. */
  ref: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type JoinWaitlistInput = z.infer<typeof joinWaitlistSchema>;

export const referralCodeParamSchema = z.object({
  code: z.string().trim().min(1).max(64),
});

/** Public-facing shape of a waitlist entry returned to the browser. */
export const waitlistEntryViewSchema = z.object({
  referralCode: z.string(),
  position: z.number().int().positive(),
  referralCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
});

export type WaitlistEntryView = z.infer<typeof waitlistEntryViewSchema>;

export const waitlistStatsSchema = z.object({
  totalCount: z.number().int().nonnegative(),
});

export type WaitlistStats = z.infer<typeof waitlistStatsSchema>;

/**
 * Feature flag keys the code reads. Each is seeded by a migration so it shows
 * up in /admin/flags on first deploy; toggling it there is the runtime switch.
 * Reference these instead of string literals so the API gate, the page, and
 * the admin console can't drift apart on spelling.
 */
export const FLAG_KEYS = {
  /**
   * The public waitlist: `/waitlist`, joining, referral lookups, the counter.
   * Off: the page redirects to /coming-soon and the API answers 404.
   */
  waitlist: 'waitlist',
} as const;

export type FlagKey = (typeof FLAG_KEYS)[keyof typeof FLAG_KEYS];
