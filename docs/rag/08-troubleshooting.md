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

## Voice

| Symptom | Likely cause | Fix |
|---|---|---|
| No text appears while speaking, but the answer still arrives after a pause | The live WebSocket didn't open, so it fell back to the batch endpoint (by design). Check the browser console for a `/api/voice/stream` failure — a proxy stripping `Upgrade`, or the api container not restarted after the WS route was added | Locally: restart the api container. In prod: confirm the CloudFront `/api/*` behavior still uses the `AllViewer` origin request policy — a cache/origin policy that drops `Upgrade`/`Sec-WebSocket-*` silently disables live mode |
| Mic button shows "Microphone access was blocked" | Browser permission denied, or the page isn't `localhost`/HTTPS (getUserMedia requires a secure context) | Re-allow the mic in the browser's site settings; use `localhost:3000`, not a LAN IP |
| Recording never auto-stops | Background noise keeps RMS above the silence threshold | Tap the stop button (always works); tune `SILENCE_RMS`/`SILENCE_MS` in `apps/web/components/chat/use-recorder.ts` for noisy rooms |
| "Didn't catch that" every time | No speech crossed the `SPEECH_RMS` threshold — quiet mic, wrong OS input device, or Chrome's auto-gain still ramping on a cold mic | Check the OS input device + level. The thresholds are AGC-aware (0.012/0.008) and the mic stays **warm for 60s** after a recording so gain stays adapted — the first-ever tap is the only cold one |
| First recording loses the first words / feels dead for seconds | Cold mic: device acquisition + Bluetooth profile switch + auto-gain ramp all happen on the first tap | Inherent on the first tap (worst on Bluetooth headsets). Repeat taps within 60s are instant — the stream is kept warm. Tap the mic, wait for "Listening", then speak |
| Browser mic indicator stays lit after recording ends | Intentional: the stream stays warm for 60s for instant follow-ups (`WARM_MS` in `use-recorder.ts`) | It goes dark after 60s idle, when the tab is hidden, or on leaving the page. Audio is only captured while the "Listening" UI shows |
| Transcript is wrong for peptide names ("BBC 157") | Transcribe lacks the jargon | Add an Amazon Transcribe **custom vocabulary** (BPC-157, TB-500, …) — tuning knob, not architecture |
| `/api/voice/*` returns 500 | Same credential/IAM issues as Bedrock (`ExpiredTokenException` locally; missing `transcribe:StartStreamTranscription`/`polly:SynthesizeSpeech` on the task role in prod — `infra/iam.tf → task_voice`) | Locally: `./scripts/dev-aws-refresh.sh`. Prod: `terraform apply` |
| Answer plays but no visualizer movement | `prefers-reduced-motion` is on (static bars are intentional), or the analyser wasn't connected | Reduced motion = working as designed |
| Polly mispronounces a peptide name | Neural voices read unusual tokens phonetically | Add a Polly **lexicon** for clinical terms (v2 knob) |
| No audio on iOS Safari until a second tap | AudioContext started outside a user gesture | Already handled (contexts resume inside the tap); if it regresses, keep `context.resume()` in the click handler |

## Answer quality

| Symptom | Likely cause | Fix |
|---|---|---|
| Every question returns the "not covered" fallback | Empty `note_chunks` (ingest never ran), or `SIMILARITY_FLOOR` too high for this corpus | `SELECT count(*) FROM note_chunks;` first. Then experiment with the floor (constant in `packages/core/src/recommendation-service.ts`) — log the similarity scores of retrieved rows for a few known-good questions to calibrate |
| Answers cite barely-related notes | Floor too low, or `TOP_K` too high for a small corpus | Raise the floor / lower K |
| Follow-up questions retrieve poorly ("how is *it* dosed?") | The condense-question step is off, or its rewrite model is failing (falls back to the raw message silently) | Check **Follow-up understanding** is on in `/admin/brain`; check api logs for rewrite-model errors (e.g. model access). The rewrite only touches retrieval — generation always sees the full conversation |
| Answers ignore the notes / add outside knowledge | System-prompt drift after edits | The grounding rules live in `SYSTEM_PROMPT` — keep "answer only from the provided documents" and re-test with an off-corpus question after any prompt change |
| `citations` is empty on a real answer | The model didn't emit `[n]` markers. **Amazon Nova ignores the citation instruction on long, dense source chunks** (verified against the studies corpus — it complies on short notes). Claude follows it reliably | Model limitation, not a prompt bug — both the system prompt and an end-of-turn reminder already ask for markers. Switch the model to Claude on `/admin/brain` once the account's Anthropic use-case form is approved. The answers themselves are still fully grounded (retrieval is unchanged); only the chips are missing |
| Answers hedge or refuse on protocol/dosing questions | Small models over-apply the not-medical-advice rule to *published research* | The system prompt already carries an anti-over-refusal clause ("describing what the documents report is educational information"). If it persists, switch to Claude, or add a line to **Additional instructions** on `/admin/brain` |

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
