# 05 — Running Locally

Everything runs in the normal compose stack. The **only** thing the RAG feature
adds to your local setup is AWS credentials with Bedrock access — and even
those are optional: without them the chat endpoints return errors and every
other part of the app (waitlist, admin, site) works untouched.

## TL;DR — test it on localhost in 6 commands

No S3 needed: the repo ships sample notes
(`apps/api/fixtures/sample-notes/`) and the ingest script reads a local folder
via `NOTES_DIR`. You only need AWS credentials that can call **Bedrock** (and
one-time [model access](#2-aws-credentials-for-real-answers) enabled on the
account).

```bash
# 1 · Fresh AWS session, then paste the three values it prints into .env
#     (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN)
aws sso login && aws configure export-credentials --format env

# 2 · Start the stack (postgres is the pgvector image; api runs migrations at boot)
docker compose up -d

# 3 · Seed the knowledge base from the bundled fixtures — local folder, no S3
DATABASE_URL=postgresql://joice:joice@localhost:5433/joice \
NOTES_DIR=apps/api/fixtures/sample-notes \
bun apps/api/scripts/ingest.ts
# → "✅ Ingest complete: 4 files scanned, 0 unchanged, 4 (re)ingested, ..."

# 4 · Ask (JSON endpoint)
curl -s localhost:4000/api/peptide-recommendations \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"How is BPC-157 dosed?"}]}' | jq

# 5 · Ask (streaming, watch the deltas live)
curl -sN localhost:4000/api/peptide-recommendations/stream \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"What does the sleep protocol say?"}]}'

# 6 · The UI: log in at http://localhost:3000/team (password: joice-dev),
#     then open http://localhost:3000/ask
```

> Port note: `DATABASE_URL` above uses **5433** — that's `POSTGRES_PORT` on
> this machine (5432 is taken; see root CLAUDE.md and your `.env`).

Expected: step 4 returns an answer whose `citations[]` reference
`peptides/bpc-157.md — BPC-157 > Dosing`; asking something off-corpus
("what's the capital of France?") returns the honest "not covered in our
clinical reference notes" answer with zero citations — and never calls Claude.

The rest of this page is the same flow with every knob explained.

## Prerequisites

- Bun ≥ 1.3 (`bun --version`)
- Docker Desktop running
- An AWS identity that can call Bedrock in `us-east-1` (see step 2) — only
  needed to actually chat / ingest

## Environment variables — the complete RAG set

| Var | Where it's read | Local default | Notes |
|---|---|---|---|
| `RAG_MODEL` | `apps/api/src/env.ts` | `us.anthropic.claude-sonnet-5` | Bedrock **cross-region inference profile** id (the `us.` prefix matters — the bare model id is rejected for on-demand invoke) |
| `BEDROCK_REGION` | api + ingest script | `us-east-1` | Where Titan/Claude are invoked |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` | api container (compose passes them through) | empty | Local stand-in for the ECS task role. In prod these don't exist — the task role provides SigV4 |
| `NOTES_BUCKET` | `apps/api/scripts/ingest.ts` only | empty | S3 source for ingestion (prod). The API never reads it |
| `NOTES_DIR` | `apps/api/scripts/ingest.ts` only | empty | **Local-folder source for ingestion (dev)** — set exactly one of `NOTES_DIR` / `NOTES_BUCKET`. Fixtures live at `apps/api/fixtures/sample-notes` |
| `DATABASE_URL` | api, migrate, ingest | `postgresql://joice:joice@localhost:5432/joice` | **Careful with the port** — see below |
| `POSTGRES_PORT` | docker-compose | `5432` | The *host* port Postgres is published on. On machines where 5432 is taken (this one: **5433**), set it and keep host-side `DATABASE_URL` in sync |

Also relevant (pre-existing): `TEAM_PASSWORD` (default `joice-dev` in dev) —
you need it to get past the team gate to see `/ask`.

Where each value must be declared when you add more later: the Zod schema in
`apps/api/src/env.ts` (never bare `process.env`), `.env.example`,
`docker-compose.yml`, and `turbo.json → globalEnv`.

## Step-by-step

### 1. Install + env file

```bash
bun install
cp .env.example .env   # if you don't already have one
```

Edit `.env`: on this machine set `POSTGRES_PORT=5433` and
`DATABASE_URL=postgresql://joice:joice@localhost:5433/joice` (5432 is taken —
see root CLAUDE.md).

### 2. AWS credentials (for real answers)

One-time, account-level: Bedrock **model access** must be enabled in the AWS
console (`us-east-1` → Bedrock → Model access) for **Anthropic Claude** models
and **Amazon Titan Text Embeddings V2**. Without it every invoke returns
`AccessDeniedException` no matter what IAM says.

Then put short-lived credentials in `.env`. With AWS SSO the easiest way:

```bash
aws configure export-credentials --profile <your-profile> --format env
# paste the three export lines' values into AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN in .env
```

Compose passes them into the api container. **Skip this step entirely** if you
only need the non-RAG parts of the app.

### 3. Start the stack

```bash
docker compose up
```

- `docker-compose.override.yml` auto-merges: bind mounts + hot reload
  (`next dev` / `bun --hot`).
- Postgres is now the **`pgvector/pgvector:pg17`** image (drop-in replacement
  for `postgres:17-alpine`; an existing `postgres_data` volume carries over —
  the data format is identical, the new image just ships the extension).
- The api container runs migrations before serving. Watch for the line
  `✅ Migrations applied` — migration `0003` creates the `vector` extension,
  the `note_chunks` table, and the HNSW index.

Verify the DB side:

```bash
docker compose exec postgres psql -U joice -d joice -c '\dx vector' -c '\d note_chunks'
```

### 4. Sanity-check the API

```bash
curl -s localhost:4000/health          # {"ok":true}
```

Chat before seeding any data — you should get the honest fallback **without
any Bedrock generation call** (it does make one Titan embed call, so this also
proves your AWS creds work):

```bash
curl -s localhost:4000/api/peptide-recommendations \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"How should I think about BPC-157 dosing?"}]}' | jq
# → { "answer": "I don't have information about that in our clinical reference notes...", "citations": [] }
```

If you get `{"error":"Something went wrong..."}` instead, it's almost always
credentials or model access — see [08 — Troubleshooting](08-troubleshooting.md).

### 5. Seed the knowledge base

The ingest script reads from **exactly one** source: `NOTES_DIR` (a local
folder — dev) or `NOTES_BUCKET` (S3 — prod). Three options, easiest first:

**Option A — bundled fixtures (zero setup):**

```bash
DATABASE_URL=postgresql://joice:joice@localhost:5433/joice \
NOTES_DIR=apps/api/fixtures/sample-notes \
bun apps/api/scripts/ingest.ts
```

The fixtures (`bpc-157.md`, `tb-500.md`, `protocols/sleep.md`) are fabricated
sample content — enough to exercise chunking, retrieval, citations, and the
not-covered path. Never upload them to the prod bucket.

**Option B — your own local folder** (e.g. a scratch copy of real-ish notes):
same command with `NOTES_DIR=/path/to/folder`. Relative paths become the
`source_path` citations.

**Option C — an S3 bucket** (`NOTES_BUCKET=<bucket>`), e.g. the real one
after the PHI-reviewed upload
(`$(cd infra && terraform output -raw notes_bucket)`) — read-only access is
enough.

Expected output (option A):

```
Found 4 markdown files in apps/api/fixtures/sample-notes
✓ README.md: 1 chunks
✓ peptides/bpc-157.md: 5 chunks
✓ peptides/tb-500.md: 5 chunks
✓ protocols/sleep.md: 4 chunks
✅ Ingest complete: 4 files scanned, 0 unchanged, 4 (re)ingested, 15 chunks written
```

Run it again — every file should report as unchanged (`4 unchanged, 0
(re)ingested`): that's the idempotency guarantee working. Switching sources
(fixtures → real bucket) also works cleanly: the orphan sweep removes rows for
files the new source doesn't have.

### 6. Ask a real question

```bash
# JSON endpoint
curl -s localhost:4000/api/peptide-recommendations \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"How is BPC-157 dosed?"}]}' | jq

# Streaming endpoint (-N disables curl buffering so you see deltas live)
curl -sN localhost:4000/api/peptide-recommendations/stream \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"How is BPC-157 dosed?"}]}'
```

The SSE output interleaves `event: delta` frames and ends with
`event: complete` carrying the annotated answer + citations.

### 7. The chat UI

`/ask` lives behind the team gate: open <http://localhost:3000/team>, enter the
team password (`joice-dev` unless you changed `TEAM_PASSWORD`), then go to
<http://localhost:3000/ask>. You should see streamed answers with citation
chips like `[1] BPC-157 > Dosing`.

### 8. Tests & checks

```bash
bun run test          # includes chunker + recommendation-service suites (no AWS/DB needed — all stubbed)
bun run type-check
bun run lint

# just the RAG suites:
cd packages/core && bun test src/chunker.test.ts src/recommendation-service.test.ts
```

## Rate limit while developing

Both chat endpoints allow **5 requests/min per IP** (in-memory, per process).
Hitting `429 Too Many Requests` while iterating? Restart the api container
(resets the window) or temporarily raise `max` on the routes in
`apps/api/src/app.ts` — don't commit that.

## What works without AWS credentials

| Works | Doesn't |
|---|---|
| Everything non-RAG (waitlist, admin, site) | `POST /api/peptide-recommendations[/stream]` → 500 / SSE `error` (the Titan embed call fails first) |
| Migrations, `note_chunks` table, psql poking | `ingest.ts` (needs Bedrock for embeddings, even with `NOTES_DIR`) |
| `bun test` / `type-check` / `lint` (all RAG deps are stubbed) | `/ask` chat responses |
