# 03 — Content Prep & Ingestion

The pipeline that turns the doctor's Obsidian vault into queryable
`note_chunks` rows. Three stages, two of which happen on a workstation:

```mermaid
flowchart LR
    subgraph Stage1["1 · Prep (workstation — BLOCKING gate)"]
        vault["Raw vault"] --> prep["prep-vault.ts"]
        prep --> report["review report<br/>(written OUTSIDE the upload folder)"]
        prep --> approved["approved/ folder"]
        report -->|"doctor reviews,<br/>fixes/removes flagged files"| approved
    end
    subgraph Stage2["2 · Upload (workstation)"]
        approved -->|"aws s3 sync *.md / *.pdf"| s3[("S3 joice-notes-&lt;acct&gt;")]
    end
    subgraph Stage3["3 · Ingest (ECS RunTask)"]
        s3 --> ingest["ingest.ts"] --> titan["Bedrock Titan<br/>(embed)"] --> rds[("note_chunks")]
    end
```

> **Nothing leaves the laptop until stage 1 is complete.** The `s3 sync` itself
> transmits content to AWS, so PHI review happens *before* upload, not after.
> See [07 — Compliance](07-compliance.md).

---

## Stage 1 — Vault prep (`apps/brain/scripts/prep-vault.ts`)

Local-only; never deployed. Run on the machine that has the raw vault:

> ⚠️ **prep-vault scans MARKDOWN ONLY.** PDFs get no automated PHI scan at all —
> which is why `ingest.ts` REFUSES any PDF outside the low-risk prefixes
> (`products/`, `faq/`, `policies/`). PDFs under those prefixes still require a
> documented **manual review before upload** — the automated gate simply does
> not exist for them.

```bash
# AUTOMATIC PII cleanup (recommended for PII-heavy vaults): detect + redact.
# Every detected span becomes a readable token ([name], [date], [phone], …);
# a local regex pass catches email/phone/SSN shapes as backup. Keep the output
# dir OUTSIDE the repo so git can never commit it.
bun apps/brain/scripts/prep-vault.ts ~/ObsidianVaults/clinical ~/joice-notes-approved --redact

# Detect-only (report, files copied unchanged — you edit by hand)
bun apps/brain/scripts/prep-vault.ts ~/ObsidianVaults/clinical ~/joice-notes-approved --scan-phi

# Dedupe-only (PHI review is then entirely manual)
bun apps/brain/scripts/prep-vault.ts ~/ObsidianVaults/clinical ~/joice-notes-approved
```

With `--redact`, the human step becomes a **spot-check instead of an edit job**:
the report lists every redaction as `token ← original text` (restore false
positives like a peptide name read as a person), and files with **high PHI
density** (>8 spans per 1,000 chars — patient case files rather than reference
notes) are flagged for deletion, since redaction just guts them. The report
contains the original PII, so the report must never be uploaded or
ingested — it exists only for the local review.

What it does, in order:

1. **Walk** the vault for `*.md`, skipping Obsidian internals (`.obsidian/`,
   `.trash/`, `.git/`).
2. **Dedupe exact duplicates** — identical sha256 → only the first path is
   kept; the drops are listed in the report.
3. **Flag near-duplicates** — files whose text is identical after
   lowercasing + whitespace collapsing are *kept* but flagged; a human picks
   which to keep.
4. **PHI scan** (`--scan-phi`) — runs AWS **Comprehend Medical `DetectPHI`**
   (itself HIPAA-eligible) over each file in 20K-char segments and reports
   every entity scored ≥ 0.5: `NAME`, `DATE`, `ID`, `CONTACT`, `ADDRESS`, `AGE`,
   `PROFESSION`. Requires AWS credentials in the environment (`AWS_PROFILE=…`
   or exported keys, region defaults to `us-east-1`).
5. **Write** the deduped set to the output dir (folder structure preserved —
   the relative path becomes the S3 key becomes the citation source), plus
   the review report as a SIBLING of the output dir (never inside it).

**The human gate:** the doctor reads the report, rewrites or removes any file
with patient-identifying content (the scan is a helper, not an authority —
review near-misses manually too), and only then does anyone run stage 2.

> ⚠️ The report is written **outside** the output folder, as a sibling
> (`<output-dir>-phi-report.md`). It quotes the **original, un-redacted** text,
> and the output folder is exactly what gets `s3 sync`'d and ingested — a report
> inside it would be embedded and could be quoted back to a member *with a
> citation*. It stays on the workstation: never upload it, never ingest it.
> `ingest.ts` refuses to run if it finds one in the source, and `prep-vault`
> deletes any copy left inside the output folder by an older run.

## Stage 2 — Upload

```bash
# Bucket name: terraform output notes_bucket
aws s3 sync ./approved/ "s3://$(cd infra && terraform output -raw notes_bucket)/" \
  --exclude "*" --include "*.md" --include "*.pdf"
```

The bucket (`infra/s3.tf`) is versioned, fully private (public-access-block),
and SSE-encrypted. Versioning means a bad upload can be rolled back
object-by-object.

## Stage 3 — Ingestion (`apps/brain/scripts/ingest.ts`)

Runs as the **`joice-ingest`** one-off ECS task (`infra/ingest.tf`) — same
Docker image as the **brain** (ingestion is the brain's own pipeline and the
script ships with it), different `command`. No service, no schedule: the vault
is a one-time upload, so ingestion is a manual invocation, re-run only if the
notes ever change.

Every file gets a **source type** from its path prefix — a registry in
`packages/brain/src/knowledge/sources.ts` (first match wins): `products/` →
`product_sheet`, `faq/` → `faq`, `protocols/` → `protocol`, `policies/` →
`policy`, everything else `clinical_note`. PDFs are extracted to text
in-process (unpdf — extraction must stay inside the BAA boundary) and then
chunked exactly like markdown.

```bash
# Paste-ready (composed with real subnet/SG ids):
cd infra && terraform output -raw ingest_run_task_command | bash

# Watch it:
aws logs tail /ecs/joice-ingest --follow
```

```mermaid
sequenceDiagram
    participant T as ingest task
    participant S3 as S3 notes bucket
    participant DB as Postgres (note_chunks)
    participant BR as Bedrock Titan

    T->>S3: ListObjectsV2 (paginated, *.md and *.pdf)
    loop each file
        T->>S3: GetObject
        T->>T: sha256(raw bytes)
        T->>DB: SELECT source_hash WHERE source_path = key LIMIT 1
        alt hash unchanged
            T->>T: skip (zero embedding cost)
        else new or changed
            T->>T: (PDF → extract text in-process) · chunkMarkdown(raw) → chunks + frontmatter
            T->>BR: embed "breadcrumb\n\ncontent" ×N (concurrency 5)
            T->>DB: BEGIN · DELETE WHERE source_path = key · INSERT chunks · UPSERT knowledge_documents row · COMMIT
        end
    end
    T->>DB: BEGIN · DELETE orphans from note_chunks AND knowledge_documents · COMMIT — orphan sweep
    T->>T: log summary, exit 0
```

Behavioral guarantees:

- **Idempotent** — unchanged files are skipped by hash; re-running after a
  crash or a partial failure is always safe and only pays for what changed.
  (The hash is over raw **bytes** now, for PDF compatibility — a valid-UTF-8
  markdown file hashes exactly as it did before, so this change does NOT force
  a re-embed of an existing corpus.)
- **Atomic per file** — delete + insert happen in one transaction, which also
  upserts the file's `knowledge_documents` inventory row; a file is never
  half-ingested.
- **Self-cleaning** — files deleted (or renamed) in the bucket lose their rows
  on the next run via the orphan sweep, which deletes from `note_chunks` and
  `knowledge_documents` in one transaction. A rename is a delete + fresh ingest.
- **Observable** — per-file `✓ path: N chunks` lines and a final summary
  (`X files scanned, Y unchanged, Z (re)ingested, N chunks written`) go to
  CloudWatch `/ecs/joice-ingest`. Non-zero exit on any error, so a failed task
  shows as `STOPPED` with a non-zero container exit code.

Environment it needs (all provided by the task definition):

| Var | Source | Purpose |
|---|---|---|
| `DATABASE_URL` | Secrets Manager `joice/database-url` | Write access to `note_chunks` |
| `NOTES_BUCKET` | plain env (from Terraform) | Which bucket to read |
| `BEDROCK_REGION` | plain env | Titan region (`us-east-1`) |
| AWS credentials | **task role** `joice-ingestion-task` | `s3:ListBucket`/`GetObject` on the bucket + `bedrock:InvokeModel` on Titan only — least privilege, no Claude access |

---

## The chunker (`packages/brain/src/knowledge/chunker.ts`)

Pure functions, fully unit-tested (`chunker.test.ts`). Rules, in processing
order:

1. **Frontmatter** — a leading `---` fence is stripped; flat `key: value`
   pairs are captured into `metadata` (values like `[a, b]` become arrays).
2. **Heading split** — the document is divided at ATX headings (`#`–`######`).
   A breadcrumb stack tracks the hierarchy: a new `##` clears any deeper
   levels, so every chunk knows its full path (`BPC-157 > Dosing > Oral`).
   Headings inside fenced code blocks (``` or ~~~) are content, not structure.
3. **Preamble** — text before the first heading becomes a chunk with
   `headingPath = null`.
4. **Wikilinks** — `[[Page|alias]]` → `alias`, `[[Page]]` → `Page`, embeds
   `![[image.png]]` are removed entirely (applied to headings too).
5. **Empty sections are skipped** — a heading with no body produces no chunk
   (the heading still contributes to descendants' breadcrumbs).
6. **Size cap** — sections over **6,000 chars (~1,500 tokens)** are split on
   paragraph boundaries (`\n\n`), no overlap; the pieces share the same
   breadcrumb and take sequential `chunkIndex` values.
7. **Token estimate** — `ceil(chars / 4)` recorded per chunk.

### Worked example

Input `peptides/bpc-157.md`:

```markdown
---
tags: [peptides, healing]
---
General intro paragraph.

# BPC-157
Overview text.

## Dosing
### Oral
Take with food. See [[TB-500|TB]] for stacking.

## Safety
```

Produces `metadata = { tags: ["peptides", "healing"] }` and three chunks
(`## Safety` is empty → skipped):

| chunk_index | heading_path | content |
|---|---|---|
| 0 | `null` | `General intro paragraph.` |
| 1 | `BPC-157` | `Overview text.` |
| 2 | `BPC-157 > Dosing > Oral` | `Take with food. See TB for stacking.` |

Chunk 2 is embedded as
`"BPC-157 > Dosing > Oral\n\nTake with food. See TB for stacking."` — the
breadcrumb prefix is what lets a "how do I dose BPC?" query land on it.

## Running ingestion locally

The same script runs from the host against the compose Postgres, with **no S3
required** — `NOTES_DIR` points it at any local folder (the repo ships
fixtures at `apps/brain/fixtures/sample-notes/`):

```bash
DATABASE_URL=postgresql://joice:joice@localhost:5433/joice \
NOTES_DIR=apps/brain/fixtures/sample-notes \
bun apps/brain/scripts/ingest.ts
```

Full walkthrough: [05 — Running Locally § Seeding data](05-local-development.md#5-seed-the-knowledge-base).
