import { z } from 'zod';
import { alternatesFromUser, MAX_HISTORY_TURNS, MAX_MESSAGE_CHARS } from './history';

/**
 * The wire contract for a chat turn. Browser-safe — the web app validates
 * against exactly what the brain service validates against.
 */

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  // Shares its cap with buildChatHistory's clipping — the client can never
  // build a history this schema rejects.
  content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS, 'Message is too long'),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

/**
 * Stateless chat: the client sends the visible conversation each turn (capped),
 * the last message being the user's new question. Server-side persistence is
 * the next step — see the `conversations` work — and will make the client's
 * copy an optimization rather than the source of truth.
 */
export const chatRequestSchema = z.object({
  messages: z
    .array(chatMessageSchema)
    .min(1)
    // MAX_HISTORY_TURNS exchanges plus the new question.
    .max(MAX_HISTORY_TURNS * 2 + 1, 'Conversation is too long — start a new one')
    .refine((msgs) => msgs[msgs.length - 1]!.role === 'user', {
      message: 'The last message must be from the user',
    })
    // Bedrock's Converse API rejects anything that doesn't start with a user
    // turn and alternate. Catching it here makes a malformed history a 400 that
    // says so, instead of a 500 surfacing from three layers down.
    .refine(alternatesFromUser, {
      message: 'Messages must start with the user and alternate user/assistant',
    }),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const citationSchema = z.object({
  /** Footnote number as it appears in the answer, e.g. the 1 in `[1]`. */
  index: z.number().int().positive(),
  sourcePath: z.string(),
  headingPath: z.string().nullable(),
  citedText: z.string(),
  /** clinical_note | product_sheet | faq | protocol | policy, when known. */
  sourceType: z.string().optional(),
});

export type Citation = z.infer<typeof citationSchema>;

export const toolUseTraceSchema = z.object({
  /** Tool name, e.g. `search_notes`. */
  name: z.string(),
  /** The visitor-facing label from the tool's definition. */
  label: z.string(),
});

export type ToolUseTrace = z.infer<typeof toolUseTraceSchema>;

export const peptideRecommendationSchema = z.object({
  /** Answer text with inline `[n]` footnote markers. */
  answer: z.string(),
  citations: z.array(citationSchema),
  /**
   * Which tools ran for this answer, deduped, silent tools excluded. Present
   * only in tool mode with showToolActivity on; absent otherwise, so classic
   * answers and stored history keep their shape.
   */
  toolsUsed: z.array(toolUseTraceSchema).optional(),
});

export type PeptideRecommendation = z.infer<typeof peptideRecommendationSchema>;

/**
 * A signal a tool surfaced for the UI to act on — never free text, and never
 * persisted. `handoff` renders the connect-with-the-team card; `intent` nudges
 * the conversion offer's timing. Enum-only payloads by design: nothing
 * PHI-shaped can ride through this channel.
 */
export const HANDOFF_REASONS = [
  'individual_dosing',
  'symptoms_or_condition',
  'medication_interaction',
  'member_request',
  'other',
] as const;

export const INTENT_KINDS = ['purchase', 'ready_to_start'] as const;

export const chatActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('handoff'), reason: z.enum(HANDOFF_REASONS) }),
  z.object({ kind: z.literal('intent'), intent: z.enum(INTENT_KINDS) }),
]);

export type ChatAction = z.infer<typeof chatActionSchema>;
