/**
 * RAG ingestion: markdown → chunk → embed (Bedrock Titan) → note_chunks.
 *
 * Source is either S3 (NOTES_BUCKET — prod, the one-off `joice-ingest` ECS
 * task; see infra/ingest.tf) or a local folder (NOTES_DIR — dev, no S3 needed):
 *
 *   NOTES_DIR=apps/api/fixtures/sample-notes bun apps/api/scripts/ingest.ts
 *
 * Idempotent: a file whose sha256 matches its existing rows is skipped, so
 * re-running after a failure (or after a notes re-upload) only pays for what
 * changed. Chunk rows for a changed file are replaced in one transaction.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { z } from 'zod';
import { createDatabase, eq, noteChunks, notInArray } from '@joice/db';
import { chunkMarkdown, createEmbeddingClient } from '@joice/brain';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    NOTES_BUCKET: z.string().min(1).optional(),
    NOTES_DIR: z.string().min(1).optional(),
    BEDROCK_REGION: z.string().default('us-east-1'),
  })
  .refine((e) => Boolean(e.NOTES_BUCKET) !== Boolean(e.NOTES_DIR), {
    message: 'Set exactly one of NOTES_BUCKET (S3) or NOTES_DIR (local folder)',
  })
  .parse(process.env);

const embeddings = createEmbeddingClient({ region: env.BEDROCK_REGION });
const db = createDatabase(env.DATABASE_URL);

/** Where the markdown comes from — S3 in prod, a local folder in dev. */
interface NotesSource {
  label: string;
  list(): Promise<string[]>;
  read(key: string): Promise<string>;
}

function s3Source(bucket: string): NotesSource {
  const s3 = new S3Client({ region: env.BEDROCK_REGION });
  return {
    label: `s3://${bucket}`,
    async list() {
      const keys: string[] = [];
      let continuationToken: string | undefined;
      do {
        const page = await s3.send(
          new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }),
        );
        for (const object of page.Contents ?? []) {
          if (object.Key?.endsWith('.md')) keys.push(object.Key);
        }
        continuationToken = page.NextContinuationToken;
      } while (continuationToken);
      return keys;
    },
    async read(key) {
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return (await object.Body?.transformToString()) ?? '';
    },
  };
}

function dirSource(dir: string): NotesSource {
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(join(d, entry.name))
        : entry.name.endsWith('.md')
          ? [join(d, entry.name)]
          : [],
    );
  return {
    label: dir,
    async list() {
      return walk(dir).map((p) => relative(dir, p).split('\\').join('/'));
    },
    async read(key) {
      return readFileSync(join(dir, key), 'utf8');
    },
  };
}

const source = env.NOTES_BUCKET ? s3Source(env.NOTES_BUCKET) : dirSource(env.NOTES_DIR!);

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const listed = await source.list();

/**
 * A PHI review report quotes un-redacted source text. It is never supposed to
 * reach the corpus — embedding it would let the chatbot quote a real patient
 * back to a member, with a citation. Refuse loudly rather than skip quietly, so
 * a stale copy gets deleted at the source instead of lingering in the bucket.
 */
const reports = listed.filter((key) => /(^|\/)[^/]*phi-report[^/]*\.md$/i.test(key));
if (reports.length > 0) {
  console.error(
    `🛑 Refusing to ingest — PHI review report(s) present in ${source.label}:\n` +
      reports.map((r) => `   - ${r}`).join('\n') +
      '\n   These contain un-redacted source text. Delete them from the source and re-run.',
  );
  process.exit(1);
}

const keys = listed;
console.log(`Found ${keys.length} markdown files in ${source.label}`);

let skipped = 0;
let replaced = 0;
let chunksWritten = 0;
let consecutiveFailures = 0;
const failures: string[] = [];

/** Systemic problems (expired creds, dead DB) fail every file — abort fast. */
const MAX_CONSECUTIVE_FAILURES = 5;

for (const [index, key] of keys.entries()) {
  const progress = `(${index + 1}/${keys.length})`;
  try {
    const raw = await source.read(key);
    const sourceHash = await sha256(raw);

    const existing = await db
      .select({ sourceHash: noteChunks.sourceHash })
      .from(noteChunks)
      .where(eq(noteChunks.sourcePath, key))
      .limit(1);
    if (existing[0]?.sourceHash === sourceHash) {
      skipped++;
      consecutiveFailures = 0;
      continue;
    }

    const { metadata, chunks } = chunkMarkdown(raw);
    if (chunks.length === 0) {
      console.warn(`⚠ ${progress} ${key}: no content after chunking — skipping`);
      consecutiveFailures = 0;
      continue;
    }

    // Breadcrumb prefixed for embedding only — retrieval works better when the
    // vector carries the heading context; the stored content stays clean.
    const vectors = await embeddings.embedBatch(
      chunks.map((c) => (c.headingPath ? `${c.headingPath}\n\n${c.content}` : c.content)),
    );

    await db.transaction(async (tx) => {
      await tx.delete(noteChunks).where(eq(noteChunks.sourcePath, key));
      await tx.insert(noteChunks).values(
        chunks.map((chunk, i) => ({
          sourcePath: key,
          sourceHash,
          chunkIndex: chunk.chunkIndex,
          headingPath: chunk.headingPath,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          embedding: vectors[i]!,
          metadata,
        })),
      );
    });

    replaced++;
    chunksWritten += chunks.length;
    consecutiveFailures = 0;
    console.log(`✓ ${progress} ${key}: ${chunks.length} chunks`);
  } catch (error) {
    // One bad file must not kill a 1,500-file run — the transaction means it
    // left no partial rows, and the hash-skip means a re-run picks it up.
    failures.push(key);
    consecutiveFailures++;
    console.error(`✗ ${progress} ${key}: ${(error as Error).message?.slice(0, 200)}`);
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(
        `\n🛑 ${MAX_CONSECUTIVE_FAILURES} files failed in a row — this looks systemic ` +
          '(expired AWS credentials? database down?). Fix the cause and re-run; ' +
          'completed files are skipped by hash.',
      );
      process.exit(1);
    }
  }
}

// Orphan sweep: rows whose source file no longer exists in the source.
const orphans =
  keys.length > 0
    ? await db.delete(noteChunks).where(notInArray(noteChunks.sourcePath, keys)).returning({ sourcePath: noteChunks.sourcePath })
    : [];
const orphanPaths = [...new Set(orphans.map((o) => o.sourcePath))];
if (orphanPaths.length > 0) console.log(`Removed orphaned files: ${orphanPaths.join(', ')}`);

console.log(
  `✅ Ingest complete: ${keys.length} files scanned, ${skipped} unchanged, ${replaced} (re)ingested, ${chunksWritten} chunks written` +
    (failures.length ? `, ${failures.length} FAILED` : ''),
);
if (failures.length > 0) {
  console.error(`Failed files (re-run to retry — completed files are skipped):\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
process.exit(0);
