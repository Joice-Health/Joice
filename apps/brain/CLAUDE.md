# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
directory (`apps/brain` — Hono on Bun, port 4100). Read the root CLAUDE.md first; this adds
brain-specific detail. The domain itself lives in `packages/brain`; this app is the thin
HTTP/WebSocket surface over it.

## The BrainAppType contract

`src/app.ts` defines all routes in one chained expression and exports
`type BrainAppType = typeof routes`. `packages/api-client` consumes it via `hc<BrainAppType>`
(`createBrainClient` / `useBrainClient`). Same rules as the api service: new endpoints must
join the chain, and route order matters.

**Everything lives under `/api/brain/*`.** That prefix is what lets the ALB route to this
service with a single listener rule instead of a path list that grows with every endpoint.
An endpoint added outside that prefix will type-check, pass tests, work locally — and 404 in
production, because the ALB will hand it to the api service. There is no local equivalent of
that failure, so it has to be caught by knowing the rule.

The voice WebSocket is deliberately **outside** the chain: it is never called through the RPC
client, and an upgrade handler has no place in `BrainAppType`.

## What this service is allowed to touch

- **Tables**: only those in `packages/db/src/schema/brain.ts`. Everything else belongs to the
  platform. If the brain needs identity, orders, protocols or a catalogue, that goes through a
  port (`packages/brain/src/ports`) whose implementation is injected in `src/services.ts` —
  today they are stubs returning empty.
- **AWS**: Bedrock, Transcribe and Polly, via the `joice-brain-task` role. The api service has
  none of these (that removal is deliberate — see `infra/iam.tf`).
- **Brain settings**: read-only here. The admin console on the api service owns writes, which
  is why `src/services.ts` passes `noopAuditPort` — there is no admin actor on this side.
- **The intake flow** (`/get-started`, api service) never reads brain tables and the brain
  never reads the platform's: the visitor carries the companion's capture over and confirms
  it. The intake calls `DELETE /api/brain/profile` on a minor stop and the web calls
  `POST /api/brain/profile/claim` at sign-up (member id from the token's `metadata.memberId`
  claim, verified networklessly with `CLERK_JWT_KEY`; the Clerk secret never lives here).
- **Member context in chat**: `src/ports/platform-client.ts` reads
  `GET /api/internal/profile/:memberId` on the api (bearer `INTERNAL_API_TOKEN`) and renders
  `buildMemberSuffix` AFTER the prompt-cache point, server-side only; failures degrade to an
  anonymous turn with one warning, never a failed answer. Identity fields, derived internals
  and the raw date of birth are filtered before the prompt. The write path is the mirror: a
  member's goal set in chat records one observation through `ObservationSinkPort`
  (vocabulary token only, never free text; anonymous visitors record nothing; failures never
  break the turn). Contract: `docs/onboarding/06-brain-integration.md`.

## Cost is the operating constraint

Every PUBLIC endpoint here is unauthenticated and metered; rate limits are the only thing in
front of them, so they are load-bearing rather than decorative. The one exception is the eval
console (`/api/brain/admin/eval/*`, `src/admin/eval-routes.ts`): the brain's first admin
surface of its own, gated by `src/middleware/admin.ts` (a deliberate copy of the api's
`requireAdmin`; role rides the session-token metadata claim). Bearer verification is the
brain's own `src/middleware/clerk.ts` calling the Clerk SDK's `verifyToken` with the public
JWT key: the `@hono/clerk-auth` wrapper the api uses throws on every request unless it holds
the Clerk SECRET key, which this task cannot read by design, so it must never come back here.
An unverifiable token means an anonymous request, never a 500. Eval runs execute fire-and-forget in this process; the one-active-run guard is a
partial unique index, not memory (docs/rag/12-eval-console.md).

- Client IP comes from the `TRUSTED_PROXY_HOPS`-th hop **from the right** of `x-forwarded-for`
  (`src/middleware/client-ip.ts`). Never the leftmost — CloudFront appends to a client-supplied
  header, so the left end is attacker-controlled.
- `GET /api/brain/voice/stream` carries its own `Origin` allowlist plus byte (3 MB) and
  wall-clock (90s) ceilings, and releases its `TranscribeStreamingClient` in `onClose`.
  Browsers don't preflight a WebSocket upgrade, so CORS does not cover this route. Keep all
  four if you touch that handler.
- The SSE chat route checks `c.req.raw.signal` each iteration so a closed tab stops generation
  instead of billing a full answer nobody reads.

## Env & lifecycle

`src/env.ts` validates env with Zod at import time — add new variables there, not via bare
`process.env` reads. **Migrations do not run at boot**: compose runs a one-shot `migrate`
service and CI runs the `joice-migrate` task before deploying. Health check is `GET /health`,
which probes the database and reports the build SHA; it answers 503 when the pool is dead so
the ALB drains the task.

## Scripts

`scripts/ingest.ts`, `scripts/prep-vault.ts`, `scripts/retention.ts` and `scripts/eval.ts`
ship in this image (the one-off ECS tasks reuse it with different commands). `eval.ts` reads
the golden set from `eval_cases` (the same set `/admin/eval` manages), falling back to
`fixtures/golden.jsonl` only when the table is empty. `prep-vault.ts` is local-only and must never run in a
deployed container — it reads a raw clinical vault. Its PHI report is written *outside* the
upload folder, and `ingest.ts` refuses to run if it finds one in the source; both guards exist
because a report inside the corpus would be embedded and quoted back to a member.
