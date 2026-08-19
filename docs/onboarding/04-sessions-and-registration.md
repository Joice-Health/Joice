# 04. Sessions and registration: the cookie, the claim, the member record

How an anonymous intake becomes a member's, end to end. Code:
`apps/api/src/middleware/onboarding-session.ts` (the cookie),
`apps/api/src/member/auth.ts` (`requireMember`),
`apps/api/src/onboarding/routes.ts` (the claim),
`packages/core/src/onboarding/onboarding-service.ts` (`claim`, `sweep`),
`apps/brain/src/app.ts` (`/api/brain/profile/claim`),
`apps/web/components/member/welcome-claim.tsx` (/welcome).

## The session cookie

`joice_onboarding_session`: a random uuid in an httpOnly cookie, issued by the
api on the first `/api/onboarding/session` call. A session handle, not a
fingerprint (not derived from IP or user agent), one year long because
resuming is the point; retention is enforced on the row, not the cookie.
Deliberately separate from the brain's `joice_brain_session`: platform
identity is not brain identity. `SameSite=Lax` in production (one CloudFront
origin); `None; Secure` in dev where the web (:3000) and the api (:4000) are
different origins, which is why the api client sends `credentials: 'include'`
and the api's CORS allows it.

## There is no webhook

A deliberate decision (2026-08-19): the member's `users` row is created from
the **sign-up response**, not from a Clerk webhook. Right after `<SignUp/>`
completes, the web lands on `/welcome` and calls the api with the new session
token; `requireMember` does the rest. One fewer secret, one fewer endpoint,
no out-of-band race: the member exists exactly when they first act.

## requireMember

Any signed-in Clerk user (no role). Resolution order for `memberId` (our
`users.id`, the member identifier across services):

1. The session token's `metadata.memberId` claim (the fast path; the Clerk
   session-token template already forwards `public_metadata`).
2. The `users` row by Clerk id.
3. Neither: **this is the member's first call.** One Clerk backend lookup for
   the primary email, its verification status and the names; `upsertFromClerk`
   creates the row; `publicMetadata.memberId` is stamped once (keeping `role`),
   so every later token carries the claim and the brain can read it too.

Exposes `memberId`, `memberClerkUserId`, `memberEmail`, `memberEmailVerified`,
`memberFirstName`. Routes: `GET /api/me` (who am I), `GET /api/me/profile`
(the member's own view: marketing and personal tier traits with labels,
goal, segment, and their intake state), `POST /api/onboarding/session/claim`.

## The claim

```mermaid
sequenceDiagram
  participant W as Web
  participant C as Clerk
  participant A as api
  participant B as brain
  W->>C: sign-up completes (email verified per dashboard policy)
  C-->>W: session token
  W->>A: POST /api/onboarding/session/claim (cookie + token)
  A->>A: requireMember: users row created on this first call, memberId stamped
  A->>A: onboarding.claim: link session + observations + profile to the member, re-project
  A-->>W: { memberId, alreadyClaimed, state }
  W->>B: POST /api/brain/profile/claim (token; best-effort)
  B->>B: lead + threads attach to memberId from the token's claim
  W->>W: /welcome shows the profile
```

Rules (all in `onboarding-service.claim` and tested): verified email only
(409 `not_claimable`); idempotent for the same member; another member is 403
`forbidden`; a gated session is 409; nothing to claim is 404 `no_session`
(/welcome then offers "Start your intake +"). The claim stamps the member on
the session and its observations, re-projects the profile under the member
key (a member may already carry observations from another device), marks the
session `registered`, and fires the Klaviyo completion with the consent flag:
a list subscription only when `consent_marketing` was ticked.

## The brain's side

The brain recognises a member without ever holding the Clerk secret:
`clerkMiddleware` verifies the bearer token networklessly with the instance's
**public JWT key** (`CLERK_JWT_KEY`; the secret key is only a local-dev
fallback), and `identifyRequester` reads `metadata.memberId`. Anonymous
requests are unchanged. `POST /api/brain/profile/claim` attaches the
browser's lead and threads to the member (only unclaimed rows; a session id
is a bearer token). This honours the IAM stance that the brain task cannot
touch Clerk's API (`infra/iam.tf`).

## Retention

`apps/api/scripts/onboarding-retention.ts`, nightly at 04:40 UTC
(`infra/onboarding-retention.tf`): idle in-progress sessions (30 days) become
`abandoned`; unclaimed sessions past the TTL (90 days) lose answers,
observations, profile and row. Registered sessions never expire. Dry-run:
`ONBOARDING_RETENTION_DRY_RUN=true`. Counsel confirms the numbers
(brief, section 9).

## Clerk dashboard checklist (Shaun, before prod sign-ups)

1. Enable public sign-ups (email/password + Google), require email
   verification.
2. Session token template already maps `{ "metadata": "{{user.public_metadata}}" }`
   (the admin role uses it; `memberId` rides the same claim).
3. `terraform.tfvars`: `clerk_jwt_key` (Dashboard -> API keys -> JWT public
   key, PEM) for the brain task; then `terraform apply`.
4. Nothing else: no webhook, no signing secret.
