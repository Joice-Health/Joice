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

// ---- Peptide chatbot (RAG) ----

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(2000, 'Message is too long'),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

/**
 * Stateless chat: the client sends the visible conversation each turn (capped),
 * the last message being the user's new question. Persistence arrives with
 * member accounts.
 */
export const chatRequestSchema = z.object({
  messages: z
    .array(chatMessageSchema)
    .min(1)
    .max(20, 'Conversation is too long — start a new one')
    .refine((msgs) => msgs[msgs.length - 1]!.role === 'user', {
      message: 'The last message must be from the user',
    }),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const citationSchema = z.object({
  /** Footnote number as it appears in the answer, e.g. the 1 in `[1]`. */
  index: z.number().int().positive(),
  sourcePath: z.string(),
  headingPath: z.string().nullable(),
  citedText: z.string(),
});

export type Citation = z.infer<typeof citationSchema>;

export const peptideRecommendationSchema = z.object({
  /** Answer text with inline `[n]` footnote markers. */
  answer: z.string(),
  citations: z.array(citationSchema),
});

export type PeptideRecommendation = z.infer<typeof peptideRecommendationSchema>;

/** Text-to-speech request (the `[n]` markers are stripped server-side). */
export const speakRequestSchema = z.object({
  text: z.string().trim().min(1).max(3000, 'Text is too long to speak'),
});

export type SpeakRequest = z.infer<typeof speakRequestSchema>;

/**
 * Public-safe slice of the admin-managed brain config, served by GET /api/brain
 * and consumed by the /ask page (copy + citation-chip visibility). Never
 * includes the system prompt or guardrail internals.
 */
export const brainUiSchema = z.object({
  emptyStateHint: z.string(),
  inputPlaceholder: z.string(),
  disclaimer: z.string(),
  showCitations: z.boolean(),
});

export type BrainUi = z.infer<typeof brainUiSchema>;

/** Client-side fallbacks while GET /api/brain loads (mirror the code defaults). */
export const BRAIN_UI_DEFAULTS: BrainUi = {
  emptyStateHint:
    'Ask anything about the peptides and protocols in our clinical notes — answers cite the exact source they came from. Tap the mic to ask out loud.',
  inputPlaceholder: 'e.g. What does the clinical team say about BPC-157 dosing?',
  disclaimer: 'Educational information from our clinical notes — not medical advice',
  showCitations: true,
};
