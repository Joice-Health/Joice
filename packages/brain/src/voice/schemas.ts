import { z } from 'zod';

/** Text-to-speech request (the `[n]` markers are stripped server-side). */
export const speakRequestSchema = z.object({
  text: z.string().trim().min(1).max(3000, 'Text is too long to speak'),
});

export type SpeakRequest = z.infer<typeof speakRequestSchema>;
