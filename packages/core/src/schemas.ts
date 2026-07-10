import { z } from 'zod';

/**
 * Shared contracts used by both the API (request validation) and the web app
 * (form validation + response typing). Single source of truth for the wire shape.
 */

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
