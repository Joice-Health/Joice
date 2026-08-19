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

**The chatbot is not here.** It moved to `apps/brain` (port 4100, everything under
`/api/brain/*`) — see `docs/rag/10-architecture.md`. What stays on this side is the admin
console's *write* path for the brain's settings (`/api/admin/brain`), because that needs the
Clerk actor and the audit trail. It writes one `app_settings` row and never touches the
brain's own tables. This service has no Bedrock, Transcribe or Polly permissions at all.

Business logic lives in `@joice/core` services (constructed in `src/services.ts` with the
Drizzle client); route handlers stay thin — validate with `@hono/zod-validator` against
schemas from `@joice/core`, call the service, return JSON.

## Route groups

| Prefix | File | Auth | In the typed chain |
|---|---|---|---|
| `/api/waitlist*`, `/api/flags` | `src/app.ts` | public, rate-limited, waitlist behind its flag | yes |
| `/api/onboarding/*` | `src/onboarding/routes.ts` | anonymous cookie session, behind the `onboarding` flag, rate-limited per route | yes (`.route('/api/onboarding', ...)`) |
| `/api/admin/*` | `src/admin/routes.ts` | Clerk + `requireAdmin` | yes (`.route('/api/admin', ...)`) |
| `/api/me/*`, `/api/onboarding/session/claim` | (Phase 2) | Clerk + `requireMember` | yes |
| `/api/webhooks/clerk`, `/api/internal/*` | (Phases 2 and 4) | svix signature / internal bearer token | **no**: registered on the app outside the chain, they are not browser APIs |

The intake routes (`src/onboarding/routes.ts`): `GET`/`POST /session`,
`/session/answer`, `/skip`, `/back`, `/restart`, `/notify`. The engine runs on this side;
the browser renders what it is told. A rejected action answers `{ error, code, questionKey? }`
(404 no session, 409 gated or not gated, 400 otherwise) and the client branches on `code`.
The whole surface answers 404 until an admin turns the `onboarding` flag on.

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
- The intake session is an httpOnly cookie, `joice_onboarding_session`
  (`src/middleware/onboarding-session.ts`, a factory so tests need no env): `SameSite=Lax` in
  prod, `None; Secure` in dev because the web app is a different origin there. Separate from
  the brain's cookie on purpose. CORS therefore allows credentials, and the api client sends
  them; in prod both are no-ops (same origin through CloudFront).
- `PHI_READY` (env, set by Terraform) and the `onboarding_health` flag are the two PHI keys;
  `services.ts` combines them into the flow service's `phiEnabled`. Never expose a route that
  lets an admin set the env half.
- This service serves no WebSockets. The voice socket and its origin/byte/duration bounds
  live on the brain service — see `apps/brain/CLAUDE.md`.

## Env & lifecycle

`src/env.ts` validates env with Zod at import time — add new variables there, not via bare
`process.env` reads. **Migrations no longer run at boot**: they raced between tasks, and with
the brain as a second service against the same database they had to move out. Compose runs a
one-shot `migrate` service both apps wait on; CI runs the `joice-migrate` ECS task to
completion and checks its exit code before updating any service. Health check is `GET /health`
(used by the ALB target group), which probes the database and reports the build SHA — it
answers 503 when the pool is dead, which is what lets the ECS circuit breaker catch a broken
release.

Behavior contracts worth preserving: waitlist join is idempotent by email (re-submitting
returns the same referral card, never a duplicate or error), referral attribution + counter
increment happen in one transaction, and self-referral is structurally impossible (the code is
generated after insert).
