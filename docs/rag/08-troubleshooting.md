# 08 — Troubleshooting

Symptom → cause → fix, roughly in the order you'll hit them.

## Local stack

| Symptom | Likely cause | Fix |
|---|---|---|
| API container exits at boot with a migration error mentioning `type "vector" does not exist` or `could not open extension control file` | Postgres is running the plain `postgres:17-alpine` image (old container/volume from before the switch) | `docker compose up -d --force-recreate postgres api` — compose now uses `pgvector/pgvector:pg17`. The data volume carries over |
| `ECONNREFUSED` from host-side scripts (`migrate.ts`, `ingest.ts`) | Wrong host port — Postgres publishes on `POSTGRES_PORT` (**5433 on this machine**), or the container is still initializing | Point `DATABASE_URL` at `localhost:5433`; wait for the healthcheck (`docker compose ps`) |
| Container stops seeing file edits (hot reload dead) | Stale Docker Desktop mount cache (known issue, root CLAUDE.md) | `docker compose up -d --force-recreate api web` |
| `docker run` fails with `No space left on device` | Docker Desktop disk full | Increase the disk size in Docker Desktop settings, or `docker builder prune` (build cache is regenerable — don't prune volumes blindly) |
| Chat endpoint returns `{"error":"Something went wrong..."}` locally | No/expired AWS creds in `.env`, or Bedrock model access not enabled on the account | Re-export SSO creds (`aws configure export-credentials --format env`), restart the api container (compose only reads `.env` at start). Verify model access in the Bedrock console |
| `429 Too Many Requests` while iterating | The 5/min/IP rate limit | Restart the api container (in-memory window), or temporarily raise `max` in `apps/api/src/app.ts` (don't commit) |

## Bedrock

| Symptom | Likely cause | Fix |
|---|---|---|
| `AccessDeniedException` … `is not authorized to perform: bedrock:InvokeModel` | IAM: locally your identity lacks the action; in ECS the task-role policy doesn't cover the model ARN | Local: attach Bedrock permissions to your identity. Prod: the api task role policy (`infra/iam.tf → task_bedrock`) must cover both the **inference-profile ARN** and `foundation-model/anthropic.*` in **all** regions the profile fans out to (already written as `bedrock:*` on the foundation-model line — don't "tighten" it to one region) |
| `AccessDeniedException` with model access hints, or "model access denied" | Bedrock **Model access** not granted in the console (account-level, not IAM) | Console → Bedrock → Model access → enable Anthropic + Titan v2 ([runbook step 2](06-deployment-runbook.md)) |
| `ResourceNotFoundException: Model use case details have not been submitted for this account` — or the SDK surfacing it as a misleading `404 The model 'X' does not exist` | The one-time **Anthropic use-case form** was never submitted (Amazon models — Titan, Nova — work without it; Anthropic models require it) | Console → Bedrock → Model access → request Anthropic models → fill the use-case form; wait ~15 min, retry. **Meanwhile, set `RAG_MODEL=us.amazon.nova-pro-v1:0`** — the Converse-based client runs any Bedrock chat model |
| `ExpiredTokenException` from the api container | The static SSO creds in `.env` expired (sessions on this account last ~1 hour) | **`./scripts/dev-aws-refresh.sh`** — logs in (browser approval), rewrites the `AWS_*` lines in `.env`, recreates the api container, waits for health |
| `ValidationException: ... on-demand throughput isn't supported` (or "invocation with the given model identifier is not supported") | Using the bare model id instead of the **cross-region inference profile** | `RAG_MODEL` must carry the `us.` prefix: `us.anthropic.claude-sonnet-5` |
| `ThrottlingException` during ingest | Titan rate limits on a large vault | The embed batch already caps concurrency at 5; just re-run the task — completed files are skipped by hash. If persistent, request a Bedrock quota bump |
| `ResourceNotFoundException` on the model id | Typo'd `RAG_MODEL`, or the model isn't available in `BEDROCK_REGION` | Check `aws bedrock list-inference-profiles --region us-east-1` for the exact id |

## Ingestion

| Symptom | Likely cause | Fix |
|---|---|---|
| Task fails immediately, `AccessDenied` on S3 | Wrong bucket in `NOTES_BUCKET`, or the ingestion role's policy doesn't match the bucket ARN | Both come from Terraform — re-check `terraform output notes_bucket` and re-apply |
| Task can't reach the database (connection timeout) | RunTask launched with the wrong security group — RDS only admits the **api tasks SG** | Use the paste-ready `terraform output -raw ingest_run_task_command`, which bakes in the right SG/subnets |
| `⚠ file.md: no content after chunking` warnings | The file is empty, frontmatter-only, or entirely wiki-embeds | Expected — those files are skipped deliberately |
| Duplicate-key error on `note_chunks_source_path_chunk_index_unique` | Two ingest tasks running concurrently against the same file | Don't run the task twice in parallel; re-run once — the transactional replace self-heals |
| Everything re-ingests every run (nothing reports `unchanged`) | The files genuinely change between runs (e.g. sync tooling rewriting line endings/frontmatter) | The hash is over raw bytes — make the upload byte-stable |

## Answer quality

| Symptom | Likely cause | Fix |
|---|---|---|
| Every question returns the "not covered" fallback | Empty `note_chunks` (ingest never ran), or `SIMILARITY_FLOOR` too high for this corpus | `SELECT count(*) FROM note_chunks;` first. Then experiment with the floor (constant in `packages/core/src/recommendation-service.ts`) — log the similarity scores of retrieved rows for a few known-good questions to calibrate |
| Answers cite barely-related notes | Floor too low, or `TOP_K` too high for a small corpus | Raise the floor / lower K |
| Follow-up questions retrieve poorly ("how is *it* dosed?") | Retrieval embeds only the last message; pronouns lose the topic | Known limitation — v2 improvement is query rewriting from history. Meanwhile the breadcrumb-prefixed embeddings soften it; users can restate the subject |
| Answers ignore the notes / add outside knowledge | System-prompt drift after edits | The grounding rules live in `SYSTEM_PROMPT` — keep "answer only from the provided documents" and re-test with an off-corpus question after any prompt change |
| `citations` is empty on a real answer | Claude answered from conversation context (a prior turn) rather than the documents, or the answer is a refusal/meta statement | Usually fine; if systematic, check the documents actually contain the answer text |

## Production serving

| Symptom | Likely cause | Fix |
|---|---|---|
| Deploy doesn't stabilize; circuit breaker rolls back | Migration `0003` failing at boot | `aws logs tail /ecs/joice-api --since 15m` — look at the first error. `CREATE EXTENSION` requires the master user (the `joice/database-url` secret is the master user, so this only breaks if that changed) |
| `/api/peptide-recommendations` 403s | You're hitting the ALB directly — origin lock rejects requests without CloudFront's header (by design) | Go through `https://joicehealth.com` |
| Streaming feels like one big flush instead of typing | A proxy buffering the SSE response | CloudFront's `/api/*` behavior uses `Managed-CachingDisabled` and streams fine; if a new cache policy is ever added to `/api/*`, exclude the stream route |
| 500s with `Unhandled error` + Bedrock stack traces in logs | Model access/IAM regression, or Bedrock outage | Check the Bedrock console + `aws bedrock list-foundation-models`; the task-bedrock policy in `iam.tf` |
| Latency spikes on first request after a while | Bedrock prompt cache expired (system-prompt span re-written) + HNSW cold | Expected; sub-second impact at current scale |

## Where to look

| Signal | Location |
|---|---|
| API request logs / unhandled errors | CloudWatch `/ecs/joice-api` |
| Ingestion run logs | CloudWatch `/ecs/joice-ingest` |
| Bedrock call audit | CloudTrail (InvokeModel events) |
| Chunk inventory | `SELECT source_path, count(*), max(updated_at) FROM note_chunks GROUP BY 1 ORDER BY 1;` |
| Similarity debugging | Temporarily log the `similarity` values returned by `retrieve()` — they're already selected |
