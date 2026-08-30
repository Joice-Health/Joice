'use client';

import { useRef, useState } from 'react';
import { LAB_CONTENT_TYPES, LAB_MAX_BYTES } from '@joice/core/schemas';
import { Button } from '@joice/ui';
import { useCreateLabUpload, useMyLabUploads, useRemoveLabUpload } from '@joice/api-client';
import { Eyebrow } from '@/components/ui/eyebrow';

type LabContentType = (typeof LAB_CONTENT_TYPES)[number];

/**
 * "Share your labs" (story 5.3's scaffold). Renders nothing at all while the
 * server says 404 (PHI keys off or no bucket): the feature is absent, not
 * broken. The browser PUTs straight to S3 with the presigned URL, so the file
 * never passes through our services; the list below is the record.
 */
export function LabsUpload() {
  const uploads = useMyLabUploads();
  const create = useCreateLabUpload();
  const remove = useRemoveLabUpload();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  // 404 resolves to null: the surface is off, the panel does not exist.
  if (uploads.isPending || uploads.data === null || uploads.error) return null;
  const items = uploads.data?.items ?? [];

  async function onPick(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!(LAB_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      setError('PDF, JPEG or PNG only.');
      return;
    }
    if (file.size > LAB_MAX_BYTES) {
      setError('That file is over 25 MB.');
      return;
    }
    try {
      await create.mutateAsync({
        filename: file.name,
        contentType: file.type as LabContentType,
        sizeBytes: file.size,
        file,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The upload did not complete.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <section className="mt-12">
      <Eyebrow>Share your labs</Eyebrow>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
        Recent lab results or anything you want your clinician to see, before your review. PDF
        or a photo, up to 25 MB. Stored encrypted; only your care team can read it.
      </p>
      {items.length > 0 ? (
        <ul className="mt-5 border-t border-line">
          {items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-6 border-b border-line py-3">
              <span className="truncate text-base text-ink">{item.filename}</span>
              <button
                type="button"
                className="mono-label text-muted transition-colors hover:text-ink"
                disabled={remove.isPending}
                onClick={() => remove.mutate(item.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-5">
        <input
          ref={fileInput}
          type="file"
          accept={LAB_CONTENT_TYPES.join(',')}
          className="sr-only"
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
        <Button type="button" disabled={create.isPending} onClick={() => fileInput.current?.click()}>
          {create.isPending ? 'Uploading…' : 'Add a file +'}
        </Button>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
