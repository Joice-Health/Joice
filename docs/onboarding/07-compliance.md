# 07. Compliance: tiers, the two keys, minors, notice, retention, analytics

The intake asks questions about a person and, from Phase 2, ties the answers to
an identity. This page is the set of rules that keeps that within the posture
described in the root `CLAUDE.md` and `docs/rag/07-compliance.md` (Phase 0 holds
marketing data only; the Before-PHI infrastructure boxes in `infra/README.md`
were applied and verified 2026-08-27, with the app-level box, chat audit logging
and member auth, still open). The mechanisms are in code; the numbers and
wording marked "counsel" are the ones Shaun still owes.

## Sensitivity tiers (on the trait, never the question)

| Tier | Meaning | Examples | Where allowed today |
|---|---|---|---|
| `marketing` | the class the waitlist already holds | goal, state, preferences, derived state status and age band | everywhere |
| `personal` | identity data that is not health information on its own | first name, email, date of birth, consent, derived age | everywhere |
| `health` | PHI the moment it is tied to a person | height/weight, medications, conditions, GLP-1 history | nowhere until both PHI keys are on |

The tier lives on the trait in `packages/core/src/profile/traits.ts`, decided
by engineers at deploy time. A question inherits it. The v1 registry holds no
health-tier trait at all, so the seeded flow cannot ask one by construction.
"Anonymous" is not a shield: state consumer-health laws cover weight and
medication history regardless of registration, which is why the v1 content is
marketing and personal only and why lifestyle questions wait for counsel's
tier call (brief, section 9).

## The two keys

Publishing a flow version that references a health-tier trait requires both:

1. `PHI_READY=true` on the api task, a Terraform variable set by Shaun after the
   Before-PHI checklist, never an admin toggle (`apps/api/src/env.ts`).
2. The `onboarding_health` feature flag, the admin-visible half (`/admin/flags`).

`apps/api/src/services.ts` combines them into `phiStatus` (ready, flag,
unlocked) and the flow service's `phiEnabled`; `validateFlowDefinition`
refuses with `phi_locked` otherwise, and the admin editor shows the lock on
the question in plain words plus the key state in its header (the flows list
serves `phi`, since the browser can never read the env half). The internal
profile endpoint applies the same rule to what the brain may read: marketing
and personal tiers always, the health tier only while `unlocked` is true.

## Minors

A date of birth under the minimum age (settings row `onboarding`, default 18,
range 13 to 21) is evaluated against the age gate **before it is written**. It
is never written. The session becomes `gated_age`, its answers and
observations are purged (`onboarding-service.ts`), and the runner asks the
brain to erase the companion lead and threads (`DELETE /api/brain/profile`,
Klaviyo suppression first). The stop screen says so once and offers no
notify-me. Tested in `engine.test.ts` (rows 4, 5, 14) and
`onboarding-service.test.ts`.

## Lab uploads (story 5.3)

- Files are PHI from the first byte, so they never transit our services: the
  browser PUTs directly to the labs bucket (`infra/labs.tf`: its own KMS key,
  versioning, TLS-only) with a presigned URL scoped to one key, content type
  and length, expiring in fifteen minutes.
- The whole surface (`/api/me/labs`) answers 404 unless BOTH PHI keys are on
  and a bucket is configured; before that a member cannot even discover it.
- We hold records, not bytes: `lab_uploads` rows (filename, type, size, key)
  are soft-removed so "what did we ever hold, and when" stays a query. Keys
  look like `labs/<memberId>/<uuid>`; the member never sees the key.
- Accepted types are a code-level allowlist (PDF, JPEG, PNG, 25 MB cap);
  widening it is a deploy, not a config change.
- The Comprehend scan reuse from the RAG pipeline is deliberately deferred:
  this story lands the storage path only.

## Notice and consent

- The intro copy says why state and age are asked. When the flow carries a
  consent section (`consent_terms`, `consent_marketing`), answers are stored
  as versioned, timestamped observations so "what did they agree to, and to
  which version" is a query. The section is not structurally required
  (decision 2026-08-26): a flow without it must present the Terms and Privacy
  agreement on the Clerk sign-up screen instead (legal consent in the Clerk
  Dashboard), and completion then subscribes nobody to Klaviyo, since that
  requires an explicit `consent_marketing` true.
- Carried-over companion data is shown and confirmed by the visitor, never
  applied silently; confirming a companion-captured email is still not
  marketing consent (the completion screen promises no email).
- Notify-me ("tell me when my state opens") is a request about serviceability,
  not a marketing opt-in: no list subscription, wording to be confirmed by
  counsel (brief, section 9).

## Identity and linking

- The intake cookie (`joice_onboarding_session`) is a session handle, not a
  fingerprint: random, httpOnly, not derived from IP or user agent.
- Claim (Phase 2) links a session to a member only on a Clerk-verified email;
  a different member is refused; a gated session cannot be claimed.
- Notify-me lives in `service_area_requests`: not `waitlist_entries`, no join to
  `brain_profiles`. Klaviyo, deduping by email, is the only place the funnels
  meet (memory rule: the waitlist never sees the brain).

## Retention

- `ONBOARDING_SESSION_IDLE_DAYS` (default 30): an in-progress session idle that
  long becomes `abandoned`.
- `ONBOARDING_SESSION_TTL_DAYS` (default 90): an unclaimed session untouched
  that long loses its answers, observations, profile and row.
- Registered sessions never expire. The sweep (`onboarding.sweep()`, dry-run
  capable) becomes a scheduled task in Phase 2 (story 2.7). Counsel confirms
  both numbers.
- IPs are stored only as salted hashes (`ip_hash`), as everywhere else.

## Analytics and events

`apps/web/lib/analytics.ts` (GTM) and the `onboarding_events` table carry
question keys and outcomes only: never a value, a name, an email or a state
code. GTM sits outside the BAA boundary; that rule is what makes it usable.

## Abuse

Every public intake endpoint is rate-limited per IP (the same in-memory limiter
as the rest of the api, per task), answer values are validated per question
type against the pinned definition, payloads are zod-validated, and the whole
surface answers 404 until the `onboarding` flag is on.

## Open for counsel

Lifestyle questions' tier; notify-me wording; retention numbers; the age-stop
and closed-state copy; whether Clerk needs a BAA once accounts carry health
context (Clerk holds name and email; traits stay in RDS). See the brief,
section 9.
