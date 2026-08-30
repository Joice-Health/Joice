import { z } from 'zod';

/**
 * The browser-safe contract for member lab uploads (story 5.3): what may be
 * uploaded and what the member sees back. The db-backed service lives in
 * lab-uploads-service.ts on the server barrel.
 */

/** What a member may upload. Small on purpose; widening it is a deploy. */
export const LAB_CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const LAB_MAX_BYTES = 25 * 1024 * 1024;

export const createLabUploadSchema = z
  .object({
    filename: z.string().trim().min(1).max(200),
    contentType: z.enum(LAB_CONTENT_TYPES),
    sizeBytes: z.number().int().positive().max(LAB_MAX_BYTES),
  })
  .strict();
export type CreateLabUpload = z.infer<typeof createLabUploadSchema>;

/** The row as the member sees it: no S3 key, no internals. */
export interface LabUploadView {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}
