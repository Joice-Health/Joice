/**
 * RAG ingestion: source documents → chunk → embed (Bedrock Titan) → note_chunks,
 * with a knowledge_documents inventory row per file.
 *
 * Sources: markdown and PDF. PDFs are extracted to text IN THIS PROCESS
 * (pure-JS, no external service — extraction must stay inside the BAA
 * boundary) and then chunked exactly like markdown. Every file gets a
 * source_type from its path prefix (products/ → product_sheet, faq/ → faq,
 * protocols/ → protocol, policies/ → policy, everything else clinical_note) —
 * see packages/brain/src/knowledge/sources.ts.
 *
 * Source is either S3 (NOTES_BUCKET — prod, the one-off `joice-ingest` ECS
 * task; see infra/ingest.tf) or a local folder (NOTES_DIR — dev, no S3 needed):
 *
 *   NOTES_DIR=apps/brain/fixtures/sample-notes bun apps/brain/scripts/ingest.ts
 *
 * Idempotent: a file whose sha256 matches its existing rows is skipped, so
 * re-running after a failure (or after a notes re-upload) only pays for what
 * changed. Chunk rows and the inventory row for a changed file are replaced
 * in one transaction.
 *
 * PDF/PHI control: prep-vault.ts (the automated Comprehend Medical scan)
 * handles markdown ONLY, so a PDF gets zero automated PHI screening. Until
 * that exists, this script REFUSES PDFs outside the low-risk prefixes
 * (products/, faq/, policies/) — a vault or protocol PDF is exactly the class
 * of document most likely to contain patient text, and "a comment asked you
 * to review it manually" is not a control. The phi-report refusal below
 * applies regardless of format.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { z } from 'zod';
import { createDatabase, eq, knowledgeDocuments, noteChunks, notInArray } from '@joice/db';
import { chunkMarkdown, createEmbeddingClient, sourceTypeForPath } from '@joice/brain';
import { extractText, getDocumentProxy } from 'unpdf';

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

const INGESTABLE = /\.(md|pdf)$/i;

/** Where the documents come from — S3 in prod, a local folder in dev. */
interface NotesSource {
  label: string;
  list(): Promise<string[]>;
  readBytes(key: string): Promise<Uint8Array>;
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
          if (object.Key && INGESTABLE.test(object.Key)) keys.push(object.Key);
        }
        continuationToken = page.NextContinuationToken;
      } while (continuationToken);
      return keys;
    },
    async readBytes(key) {
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return (await object.Body?.transformToByteArray()) ?? new Uint8Array();
    },
  };
}

function dirSource(dir: string): NotesSource {
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(join(d, entry.name))
        : INGESTABLE.test(entry.name)
          ? [join(d, entry.name)]
          : [],
    );
  return {
    label: dir,
    async list() {
      return walk(dir).map((p) => relative(dir, p).split('\\').join('/'));
    },
    async readBytes(key) {
      return new Uint8Array(readFileSync(join(dir, key)));
    },
  };
}

const source = env.NOTES_BUCKET ? s3Source(env.NOTES_BUCKET) : dirSource(env.NOTES_DIR!);

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** PDF → plain text, in-process. unpdf merges pages with single newlines
 * (no blank lines), so heading-free PDF text falls through the chunker to
 * its line/sentence splitting — arbitrary ~1.5k-token windows with a null
 * headingPath and the filename as title. Fine for product sheets/FAQs. */
async function pdfToText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/** Frontmatter title, else the first heading's root, else the filename. */
function titleFor(
  key: string,
  metadata: Record<string, unknown>,
  chunks: { headingPath: string | null }[],
): string {
  if (typeof metadata.title === 'string' && metadata.title.trim()) return metadata.title.trim();
  const heading = chunks.find((c) => c.headingPath)?.headingPath?.split(' > ')[0];
  if (heading) return heading;
  return key.replace(INGESTABLE, '').split('/').pop() ?? key;
}

const listed = await source.list();

/**
 * A PHI review report quotes un-redacted source text. It is never supposed to
 * reach the corpus — embedding it would let the chatbot quote a real patient
 * back to a member, with a citation. Refuse loudly rather than skip quietly, so
 * a stale copy gets deleted at the source instead of lingering in the bucket.
 */
const reports = listed.filter((key) => /(^|\/)[^/]*phi-report[^/]*\.(md|pdf)$/i.test(key));
if (reports.length > 0) {
  console.error(
    `🛑 Refusing to ingest — PHI review report(s) present in ${source.label}:\n` +
      reports.map((r) => `   - ${r}`).join('\n') +
      '\n   These contain un-redacted source text. Delete them from the source and re-run.',
  );
  process.exit(1);
}

/**
 * PDFs bypass prep-vault's automated PHI scan entirely, so only the
 * marketing-grade prefixes may carry them. A clinical-note or protocol PDF is
 * refused loudly until an automated PDF scan exists — see the header comment.
 */
const PDF_ALLOWED_TYPES = new Set(['product_sheet', 'faq', 'policy']);
const riskyPdfs = listed.filter(
  (key) => /\.pdf$/i.test(key) && !PDF_ALLOWED_TYPES.has(sourceTypeForPath(key)),
);
if (riskyPdfs.length > 0) {
  console.error(
    `🛑 Refusing to ingest — PDF(s) outside the low-risk prefixes (products/, faq/, policies/):\n` +
      riskyPdfs.map((r) => `   - ${r}`).join('\n') +
      '\n   prep-vault.ts cannot PHI-scan PDFs. Convert these to markdown and run them ' +
      'through prep-vault, or move them under a low-risk prefix if they are genuinely ' +
      'marketing-grade.',
  );
  process.exit(1);
}

const keys = listed;
console.log(`Found ${keys.length} ingestable files (.md/.pdf) in ${source.label}`);

let skipped = 0;
let replaced = 0;
let chunksWritten = 0;
let consecutiveFailures = 0;
const failures: string[] = [];

/** Systemic problems (expired creds, dead DB) fail every file — abort fast. */
const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Make sure the inventory row exists for an unchanged file — backfills
 * knowledge_documents for corpora ingested before the inventory existed,
 * without re-embedding anything.
 */
async function ensureDocumentRow(key: string, sourceHash: string): Promise<void> {
  const [doc] = await db
    .select({ sourceHash: knowledgeDocuments.sourceHash })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.sourcePath, key))
    .limit(1);
  if (doc?.sourceHash === sourceHash) return;

  const rows = await db
    .select({ headingPath: noteChunks.headingPath, metadata: noteChunks.metadata, title: noteChunks.title })
    .from(noteChunks)
    .where(eq(noteChunks.sourcePath, key))
    // Deterministic: without this, "first heading" depends on heap order.
    .orderBy(noteChunks.chunkIndex);
  const sourceType = sourceTypeForPath(key);
  const title = rows[0]?.title ?? titleFor(key, rows[0]?.metadata ?? {}, rows);
  const metadata = rows[0]?.metadata ?? null;
  await db
    .insert(knowledgeDocuments)
    .values({ sourcePath: key, sourceType, title, sourceHash, chunkCount: rows.length, metadata })
    .onConflictDoUpdate({
      target: knowledgeDocuments.sourcePath,
      // Full refresh: a diverged row (renamed prefix, corrected title) heals
      // here rather than persisting stale fields forever.
      set: { sourceType, title, sourceHash, chunkCount: rows.length, metadata, ingestedAt: new Date() },
    });
}

for (const [index, key] of keys.entries()) {
  const progress = `(${index + 1}/${keys.length})`;
  try {
    const bytes = await source.readBytes(key);
    const sourceHash = await sha256(bytes);

    const existing = await db
      .select({ sourceHash: noteChunks.sourceHash })
      .from(noteChunks)
      .where(eq(noteChunks.sourcePath, key))
      .limit(1);
    if (existing[0]?.sourceHash === sourceHash) {
      await ensureDocumentRow(key, sourceHash);
      skipped++;
      consecutiveFailures = 0;
      continue;
    }

    const raw = /\.pdf$/i.test(key)
      ? await pdfToText(bytes)
      : new TextDecoder().decode(bytes);
    const { metadata, chunks } = chunkMarkdown(raw);
    if (chunks.length === 0) {
      console.warn(`⚠ ${progress} ${key}: no content after chunking — skipping`);
      consecutiveFailures = 0;
      continue;
    }

    const sourceType = sourceTypeForPath(key);
    const title = titleFor(key, metadata, chunks);

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
          sourceType,
          title,
          sourceHash,
          chunkIndex: chunk.chunkIndex,
          headingPath: chunk.headingPath,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          embedding: vectors[i]!,
          metadata,
        })),
      );
      // The inventory row commits with the chunks it describes.
      await tx
        .insert(knowledgeDocuments)
        .values({
          sourcePath: key,
          sourceType,
          title,
          sourceHash,
          chunkCount: chunks.length,
          metadata,
        })
        .onConflictDoUpdate({
          target: knowledgeDocuments.sourcePath,
          set: { sourceType, title, sourceHash, chunkCount: chunks.length, metadata, ingestedAt: new Date() },
        });
    });

    replaced++;
    chunksWritten += chunks.length;
    consecutiveFailures = 0;
    console.log(`✓ ${progress} ${key}: ${chunks.length} chunks [${sourceType}]`);
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

// Orphan sweep: rows whose source file no longer exists in the source. One
// transaction so the inventory can never describe chunks that were deleted.
if (keys.length > 0) {
  const orphanPaths = await db.transaction(async (tx) => {
    const orphans = await tx
      .delete(noteChunks)
      .where(notInArray(noteChunks.sourcePath, keys))
      .returning({ sourcePath: noteChunks.sourcePath });
    await tx.delete(knowledgeDocuments).where(notInArray(knowledgeDocuments.sourcePath, keys));
    return [...new Set(orphans.map((o) => o.sourcePath))];
  });
  if (orphanPaths.length > 0) console.log(`Removed orphaned files: ${orphanPaths.join(', ')}`);
}

console.log(
  `✅ Ingest complete: ${keys.length} files scanned, ${skipped} unchanged, ${replaced} (re)ingested, ${chunksWritten} chunks written` +
    (failures.length ? `, ${failures.length} FAILED` : ''),
);
if (failures.length > 0) {
  console.error(`Failed files (re-run to retry — completed files are skipped):\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
process.exit(0);
