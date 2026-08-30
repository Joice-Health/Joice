import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { LabPresignPort } from '@joice/core';

/**
 * The S3 side of the labs scaffold: a presigned PUT into the PHI labs bucket
 * (infra/labs.tf), scoped to exactly one key, content type and length, expiring
 * in minutes. The api holds the only AWS permission on this path
 * (s3:PutObject on labs/* plus the KMS grant); the browser does the actual
 * upload, so file bytes never transit our services. KMS encryption is the
 * bucket's default; the URL does not need to name it.
 */
// Two copies of @smithy/types resolve in the workspace (the brain pins its
// own SDK set), so the presigner's generics and this package's client/command
// types are identical yet nominally distinct. One cast at the boundary, typed
// in our own terms, bridges the duplicate, not a real difference.
const presign = getSignedUrl as unknown as (
  client: S3Client,
  command: PutObjectCommand,
  options: { expiresIn: number },
) => Promise<string>;

export function createS3LabPresign(bucket: string): LabPresignPort {
  const s3 = new S3Client({});
  return {
    async presignPut({ key, contentType, sizeBytes }) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: sizeBytes,
      });
      return presign(s3, command, { expiresIn: 15 * 60 });
    },
  };
}
