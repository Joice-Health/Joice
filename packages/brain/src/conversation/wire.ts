import { z } from 'zod';
import { citationSchema } from './schemas';

/**
 * Wire shapes for the stored-conversation endpoints. Separate from
 * `service.ts` because that file imports Postgres — these have to stay
 * browser-safe so the web app can type its history views against them.
 */

export const conversationIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const storedConversationSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  createdAt: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      citations: z.array(citationSchema),
      createdAt: z.string(),
    }),
  ),
});

export type StoredConversationView = z.infer<typeof storedConversationSchema>;
