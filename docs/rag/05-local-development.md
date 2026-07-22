# 05 — Running Locally

Everything runs in the normal compose stack. The **only** thing the RAG feature
adds to your local setup is AWS credentials with Bedrock access — and even
those are optional: without them the chat endpoints return errors and every
other part of the app (waitlist, admin, site) works untouched.

## TL;DR — test it on localhost in 6 commands

No S3 needed: the repo ships sample notes
(`apps/brain/fixtures/sample-notes/`) and the ingest script reads a local folder
via `NOTES_DIR`. You only need AWS credentials that can call **Bedrock** (and
one-time [model access](#2-aws-credentials-for-real-answers) enabled on the
account).

```bash
# 1 · Fresh AWS session → .env → brain container, in one step (browser approval).
#     Credentials belong to the BRAIN — Bedrock/Transcribe/Polly live there, and
#     the api has no AWS dependencies. Re-run whenever the brain logs show
#     ExpiredTokenException; SSO sessions on this account last ~1 hour.
#     First time only, also set in .env:
#       RAG_MODEL=us.amazon.nova-pro-v1:0     # until the Anthropic use-case form is approved
./scripts/dev-aws-refresh.sh

# 2 · Start the rest of the stack. Postgres is the pgvector image; a one-shot
#     `migrate` service runs migrations once and both apps wait for it (they no
#     longer migrate at boot — two services doing that would race).
docker compose up -d

# 3 · Seed the knowledge base from the bundled fixtures — local folder, no S3
DATABASE_URL=postgresql://joice:joice@localhost:5433/joice \
NOTES_DIR=apps/brain/fixtures/sample-notes \
bun apps/brain/scripts/ingest.ts
# → "✅ Ingest complete: 4 files scanned, 0 unchanged, 4 (re)ingested, ..."

# 4 · Ask (JSON endpoint)
curl -s localhost:4100/api/brain/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"How is BPC-157 dosed?"}]}' | jq

# 5 · Ask (streaming, watch the deltas live)
curl -sN localhost:4100/api/brain/chat/stream \
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
| `RAG_MODEL` | `apps/api/src/env.ts` | `us.anthropic.claude-sonnet-5` | Bedrock **cross-region inference profile** id (`us.` prefix). Any Bedrock chat model works (Converse API). **Until the account's Anthropic use-case form is approved, use `us.amazon.nova-pro-v1:0` locally** — Amazon models need no form |
| `BEDROCK_REGION` | api + ingest script | `us-east-1` | Where Titan/Claude are invoked |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` | api container (compose passes them through) | empty | Local stand-in for the ECS task role. In prod these don't exist — the task role provides SigV4 |
| `NOTES_BUCKET` | `apps/brain/scripts/ingest.ts` only | empty | S3 source for ingestion (prod). The API never reads it |
| `NOTES_DIR` | `apps/brain/scripts/ingest.ts` only | empty | **Local-folder source for ingestion (dev)** — set exactly one of `NOTES_DIR` / `NOTES_BUCKET`. Fixtures live at `apps/brain/fixtures/sample-notes` |
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

Compose passes them into the **brain** container (the api service has no AWS
dependencies at all). **Skip this step entirely** if you only need the
waitlist/admin side of the app.

### 3. Start the stack

```bash
docker compose up
```

- `docker-compose.override.yml` auto-merges: bind mounts + hot reload
  (`next dev` / `bun --hot`).
- Postgres is now the **`pgvector/pgvector:pg17`** image (drop-in replacement
  for `postgres:17-alpine`; an existing `postgres_data` volume carries over —
  the data format is identical, the new image just ships the extension).
- Three app containers come up: **api** on `:4000` (waitlist + admin),
  **brain** on `:4100` (chat + voice), **web** on `:3000`.
- Migrations run **once**, in a one-shot `migrate` container that api and brain
  both wait on (`service_completed_successfully`) — not at each service's boot,
  which would race. Watch for `✅ Migrations applied`; migration `0003` creates
  the `vector` extension, the `note_chunks` table and the HNSW index.

Verify the DB side:

```bash
docker compose exec postgres psql -U joice -d joice -c '\dx vector' -c '\d note_chunks'
```

### 4. Sanity-check the API

```bash
curl -s localhost:4000/health   # api:   {"ok":true,"db":"up","sha":"dev",...}
curl -s localhost:4100/health   # brain: same shape — 503 if it can't reach Postgres
```

Chat, voice and the public chat config are all on the **brain** (`:4100`) under
`/api/brain/*`. Hitting them on `:4000` returns 404 by design.

Chat before seeding any data — you should get the honest fallback **without
any Bedrock generation call** (it does make one Titan embed call, so this also
proves your AWS creds work):

```bash
curl -s localhost:4100/api/brain/chat \
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
NOTES_DIR=apps/brain/fixtures/sample-notes \
bun apps/brain/scripts/ingest.ts
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
Found 4 markdown files in apps/brain/fixtures/sample-notes
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
curl -s localhost:4100/api/brain/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"How is BPC-157 dosed?"}]}' | jq

# Streaming endpoint (-N disables curl buffering so you see deltas live)
curl -sN localhost:4100/api/brain/chat/stream \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"How is BPC-157 dosed?"}]}'
```

The SSE output interleaves `event: delta` frames and ends with
`event: complete` carrying the annotated answer + citations.

### 6b. Voice endpoints (no microphone needed)

```bash
# Text → speech (Polly): expect "MPEG ADTS, layer III"
curl -s localhost:4100/api/brain/voice/speak -H 'content-type: application/json' \
  -d '{"text":"BPC-157 is dosed at 250 micrograms daily. [1]"}' \
  --output /tmp/speak.mp3 && file /tmp/speak.mp3

# Round trip: decode that mp3 to 16kHz PCM and feed it to Transcribe —
# expect ≈ the original sentence back
ffmpeg -y -loglevel error -i /tmp/speak.mp3 -f s16le -ar 16000 -ac 1 /tmp/speak.pcm
curl -s localhost:4100/api/brain/voice/transcribe -H 'content-type: application/octet-stream' \
  --data-binary @/tmp/speak.pcm | jq
```

### 7. The chat UI

`/ask` lives behind the team gate: open <http://localhost:3000/team>, enter the
team password (`joice-dev` unless you changed `TEAM_PASSWORD`), then go to
<http://localhost:3000/ask>. You should see streamed answers with citation
chips like `[1] BPC-157 > Dosing`.

**Voice**: tap the mic (allow microphone access — works on `localhost` without
HTTPS), say *"how is BPC-157 dosed?"*, and pause — the recording auto-stops
after ~1.5s of silence, the transcript appears as your message, the answer
streams as text, and then it's read aloud with the visualizer bars moving to
the real audio. Typed questions stay silent; use the speaker button under any
answer to hear it on demand.

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
| Everything non-RAG (waitlist, admin, site) | `POST /api/brain/chat[/stream]` → 500 / SSE `error` (the Titan embed call fails first) |
| Migrations, `note_chunks` table, psql poking | `ingest.ts` (needs Bedrock for embeddings, even with `NOTES_DIR`) |
| `bun test` / `type-check` / `lint` (all RAG deps are stubbed) | `/ask` chat responses |
