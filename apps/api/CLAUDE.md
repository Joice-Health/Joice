# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
directory (`apps/api` — Hono on Bun, port 4000). Read the root CLAUDE.md first; this adds
API-specific detail.

## The AppType contract (most important thing here)

`src/app.ts` defines all routes in one chained expression and exports
`type AppType = typeof routes`. `packages/api-client` consumes it via `hc<AppType>`, giving the
web app end-to-end request/response types. Consequences:

- New endpoints must join the chain (or a sub-router mounted with `.route()`, like
  `/api/admin` → `src/admin/routes.ts`) — a standalone `app.get(...)` statement won't be typed
  in the client.
- The default export is `routes` (the typed chain), not the bare `app`.
- Route order matters: `/api/waitlist/stats` is registered before `/api/waitlist/:code` so the
  param route doesn't swallow it.

Business logic lives in `@joice/core` services (constructed in `src/services.ts` with the
Drizzle client); route handlers stay thin — validate with `@hono/zod-validator` against
schemas from `@joice/core`, call the service, return JSON.

## Auth & middleware

- `/api/admin/*`: Clerk. `clerkMiddleware` verifies the session token; `src/admin/auth.ts`
  `requireAdmin` then checks the `metadata.role === 'admin'` session claim (401 unauthenticated,
  403 non-admin) and exposes `adminUserId`/`adminEmail` context vars for audit logging.
  Locally without real Clerk keys, `env.ts` placeholder defaults keep the API booting; admin
  calls just 401.
- Public endpoints are rate-limited per IP (`src/middleware/rate-limit.ts` — in-memory
  fixed window; per-task once ECS scales out, which is accepted). This is the *only*
  protection on the unauthenticated brain endpoints, each of which costs metered AWS spend.
- **Client IP comes from the `TRUSTED_PROXY_HOPS`-th hop from the right** of `x-forwarded-for`
  (`src/middleware/client-ip.ts`, unit-tested). Never take the leftmost hop: CloudFront's
  `AllViewer` policy *appends* to a client-supplied header, so the left end is attacker-
  controlled and `curl -H "X-Forwarded-For: $RANDOM"` would buy unlimited Bedrock calls.
  `TRUSTED_PROXY_HOPS` is 2 in prod (CloudFront + ALB) and 0 locally, where the header is
  ignored entirely in favor of the socket address.
- IPs are never stored raw — only salted SHA-256 (`src/hash.ts`, `IP_HASH_SALT`).
- CORS is configured but moot in prod (same-origin through CloudFront).
- `GET /api/voice/stream` is the one route CORS cannot cover — browsers don't preflight a
  WebSocket upgrade. It carries its own `Origin` allowlist plus byte (3 MB) and wall-clock
  (90s) ceilings, and releases its `TranscribeStreamingClient` in `onClose`. Keep all four
  if you touch that handler; an unbounded socket is unbounded AWS spend.

## Env & lifecycle

`src/env.ts` validates env with Zod at import time — add new variables there, not via bare
`process.env` reads. The container CMD runs Drizzle migrations before serving (both the dev
and release Dockerfile stages), so schema changes deploy themselves; a failed migration blocks
startup by design. Health check is `GET /health` (used by the ALB target group and Docker).

Behavior contracts worth preserving: waitlist join is idempotent by email (re-submitting
returns the same referral card, never a duplicate or error), referral attribution + counter
increment happen in one transaction, and self-referral is structurally impossible (the code is
generated after insert).
