import { and, desc, eq, labUploads, type Database } from '@joice/db';
import { createLabUploadSchema, type CreateLabUpload, type LabUploadView } from './lab-uploads';

/**
 * Member lab and concern uploads: the record side of story 5.3's scaffold.
 * This service owns the `lab_uploads` rows and the ownership rules; the
 * presigner is an injected port because core never touches the AWS SDK (the
 * api provides an S3 adapter, tests provide a fake). File bytes never pass
 * through here: the browser PUTs straight to the PHI bucket with the
 * presigned URL this returns.
 */

export interface LabPresignPort {
  /** A time-limited URL the browser may PUT exactly this object to. */
  presignPut(input: { key: string; contentType: string; sizeBytes: number }): Promise<string>;
}

export interface LabUploadsOptions {
  newId?: () => string;
}

export function createLabUploadsService(
  db: Database,
  deps: { presign: LabPresignPort },
  { newId = () => crypto.randomUUID() }: LabUploadsOptions = {},
) {
  const toView = (row: typeof labUploads.$inferSelect): LabUploadView => ({
    id: row.id,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  });

  return {
    /**
     * Record the upload and hand back the presigned PUT. The row exists
     * before the object does; a member abandoning the PUT leaves a record
     * pointing at nothing, which is honest (we said we would accept it) and
     * harmless (reads go through the row, and the key is unique).
     */
    async create(memberId: string, input: CreateLabUpload): Promise<{ upload: LabUploadView; uploadUrl: string }> {
      const parsed = createLabUploadSchema.parse(input);
      const key = `labs/${memberId}/${newId()}`;
      const [row] = await db
        .insert(labUploads)
        .values({
          memberId,
          s3Key: key,
          filename: parsed.filename,
          contentType: parsed.contentType,
          sizeBytes: parsed.sizeBytes,
        })
        .returning();
      const uploadUrl = await deps.presign.presignPut({
        key,
        contentType: parsed.contentType,
        sizeBytes: parsed.sizeBytes,
      });
      return { upload: toView(row!), uploadUrl };
    },

    /** The member's own live uploads, newest first. Never anyone else's. */
    async listForMember(memberId: string): Promise<LabUploadView[]> {
      const rows = await db
        .select()
        .from(labUploads)
        .where(and(eq(labUploads.memberId, memberId), eq(labUploads.status, 'uploaded')))
        .orderBy(desc(labUploads.createdAt));
      return rows.map(toView);
    },

    /**
     * Soft-remove, ownership enforced in the WHERE: a member can only ever
     * touch their own rows, and the record of having held the file survives.
     */
    async remove(memberId: string, id: string): Promise<boolean> {
      const rows = await db
        .update(labUploads)
        .set({ status: 'removed', updatedAt: new Date() })
        .where(and(eq(labUploads.id, id), eq(labUploads.memberId, memberId), eq(labUploads.status, 'uploaded')))
        .returning();
      return rows.length > 0;
    },
  };
}

export type LabUploadsService = ReturnType<typeof createLabUploadsService>;
