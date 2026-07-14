# 03 — Content Prep & Ingestion

The pipeline that turns the doctor's Obsidian vault into queryable
`note_chunks` rows. Three stages, two of which happen on a workstation:

```mermaid
flowchart LR
    subgraph Stage1["1 · Prep (workstation — BLOCKING gate)"]
        vault["Raw vault"] --> prep["prep-vault.ts"]
        prep --> report["phi-report.md"]
        prep --> approved["approved/ folder"]
        report -->|"doctor reviews,<br/>fixes/removes flagged files"| approved
    end
    subgraph Stage2["2 · Upload (workstation)"]
        approved -->|"aws s3 sync *.md"| s3[("S3 joice-notes-&lt;acct&gt;")]
    end
    subgraph Stage3["3 · Ingest (ECS RunTask)"]
        s3 --> ingest["ingest.ts"] --> titan["Bedrock Titan<br/>(embed)"] --> rds[("note_chunks")]
    end
```

> **Nothing leaves the laptop until stage 1 is complete.** The `s3 sync` itself
> transmits content to AWS, so PHI review happens *before* upload, not after.
> See [07 — Compliance](07-compliance.md).

---

## Stage 1 — Vault prep (`apps/api/scripts/prep-vault.ts`)

Local-only; never deployed. Run on the machine that has the raw vault:

```bash
# Full run with the automated PHI scan (needs AWS creds; see below)
bun apps/api/scripts/prep-vault.ts ~/ObsidianVaults/clinical ./approved --scan-phi

# Dedupe-only (PHI review is then entirely manual)
bun apps/api/scripts/prep-vault.ts ~/ObsidianVaults/clinical ./approved
```

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
   `phi-report.md` summarizing everything.

**The human gate:** the doctor reads `phi-report.md`, rewrites or removes any
file with patient-identifying content (the scan is a helper, not an authority —
review near-misses manually too), and only then does anyone run stage 2. Delete
`phi-report.md` from the output folder before syncing if you sync the whole
directory (the sync command below only includes `*.md`, so it would go up —
it's harmless but noisy; simplest is to keep the report outside or remove it).

## Stage 2 — Upload

```bash
# Bucket name: terraform output notes_bucket
aws s3 sync ./approved/ "s3://$(cd infra && terraform output -raw notes_bucket)/" \
  --exclude "*" --include "*.md"
```

The bucket (`infra/s3.tf`) is versioned, fully private (public-access-block),
and SSE-encrypted. Versioning means a bad upload can be rolled back
object-by-object.

## Stage 3 — Ingestion (`apps/api/scripts/ingest.ts`)

Runs as the **`joice-ingest`** one-off ECS task (`infra/ingest.tf`) — same
Docker image as the API (the monorepo is already inside it), different
`command`. No service, no schedule: the vault is a one-time upload, so
ingestion is a manual invocation, re-run only if the notes ever change.

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

    T->>S3: ListObjectsV2 (paginated, *.md only)
    loop each file
        T->>S3: GetObject
        T->>T: sha256(raw)
        T->>DB: SELECT source_hash WHERE source_path = key LIMIT 1
        alt hash unchanged
            T->>T: skip (zero embedding cost)
        else new or changed
            T->>T: chunkMarkdown(raw) → chunks + frontmatter
            T->>BR: embed "breadcrumb\n\ncontent" ×N (concurrency 5)
            T->>DB: BEGIN · DELETE WHERE source_path = key · INSERT chunks · COMMIT
        end
    end
    T->>DB: DELETE WHERE source_path NOT IN (bucket keys) — orphan sweep
    T->>T: log summary, exit 0
```

Behavioral guarantees:

- **Idempotent** — unchanged files are skipped by hash; re-running after a
  crash or a partial failure is always safe and only pays for what changed.
- **Atomic per file** — delete + insert happen in one transaction; a file is
  never half-ingested.
- **Self-cleaning** — files deleted (or renamed) in the bucket lose their rows
  on the next run via the orphan sweep. A rename is a delete + fresh ingest.
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

## The chunker (`packages/core/src/chunker.ts`)

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
fixtures at `apps/api/fixtures/sample-notes/`):

```bash
DATABASE_URL=postgresql://joice:joice@localhost:5433/joice \
NOTES_DIR=apps/api/fixtures/sample-notes \
bun apps/api/scripts/ingest.ts
```

Full walkthrough: [05 — Running Locally § Seeding data](05-local-development.md#5-seed-the-knowledge-base).
