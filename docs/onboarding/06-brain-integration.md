# 06. The brain and the intake: what crosses, and how

Two systems build one picture of a person: the companion (the brain) learns a
name, an email and a goal conversationally; the intake asks the structured
questions. Neither reads the other's tables, ever. This page is the contract.

## The three exchanges

```mermaid
flowchart LR
  subgraph browser[The visitor's browser]
    V[web app]
  end
  subgraph brain[brain service]
    BP[(brain_profiles)]
  end
  subgraph api[api service]
    OP[(profiles, observations)]
  end
  V -- "1. carry-over: GET /api/brain/profile,<br/>values confirmed into the intake" --> BP
  V -- "answers" --> OP
  V -- "2. claim on sign-up: both services,<br/>same member id from the token" --> BP
  V -- "claim" --> OP
  brain -- "3. member context: GET /api/internal/profile/:id<br/>Bearer INTERNAL_API_TOKEN" --> api
  brain -- "observations: POST /api/internal/observations" --> api
```

1. **Carry-over (pre-registration)** is client-composed: the web reads the
   companion's capture and sends it as `carryOver` when the intake starts. The
   values arrive as prefills marked "carried over" and become answers only
   when the visitor confirms them (`source: companion`). The platform never
   reads `brain_profiles` for this; the one documented read of that table
   remains the admin leads list.
2. **Claim (at sign-up)**: the web calls both services with the new Clerk
   session. Both read the member id from the token's `metadata.memberId`
   claim, which the api stamped on the member's first call (see 04). The
   brain verifies tokens networklessly with the instance's public JWT key
   (`CLERK_JWT_KEY`); the Clerk secret never lives on the brain task.
3. **Member context (post-registration)**: the brain's `MemberContextPort`
   and `ObservationSinkPort` are HTTP adapters
   (`apps/brain/src/ports/platform-client.ts`) to `/api/internal/*` on the
   api, presented with the shared bearer (`INTERNAL_API_TOKEN`, a Terraform
   `random_password` on both tasks). This is the promised port evolution:
   "the stubs become HTTP clients to the api service and nothing in the
   domain changes" (docs/rag/10-architecture.md).
4. **The write path (story 5.5)**: when a signed-in member sets their goal in
   chat, the companion records one observation through `ObservationSinkPort`
   (source `companion`, confidence 0.6): the vocabulary token only, never the
   free-text note, per the port contract. Anonymous visitors record nothing.
   The call is fire-and-forget with the same tolerance as the reads: a dead
   api never fails a capture turn. In the fold, onboarding answers outrank
   companion observations (`packages/core/src/profile/projector.ts`), so chat
   can never overwrite what the intake asked properly.

## What may cross, and what never does

- The internal profile read returns first name, goal, segment and
  **marketing and personal tier traits only**, the same rule the member
  themselves gets; health-tier traits stay out until both PHI keys are on.
- The adapter filters further before the prompt: identity fields, derived
  internals and the raw date of birth never reach the model; `Age: 43` does.
- The suffix (`buildMemberSuffix`) opens with "personalisation only, not
  medical assessment" and rides **after the prompt-cache point**
  (`systemSuffix` in providers/bedrock.ts), server-side only: it never
  round-trips the browser.
- Observations the brain hands back are vocabulary tokens with provenance
  (`source: companion`), never free text.
- The minor stop erases across the boundary: the api purges the intake, the
  web calls `DELETE /api/brain/profile`, and the companion lead goes too.

## Failure is anonymous, not broken

Every adapter call has a 1.5s timeout and degrades: an unreachable api means
the member chats exactly like an anonymous visitor, with one warning in the
brain's log (`platform profile read failed`). A chat answer never waits on,
or fails because of, the platform.

## The trust boundary today, and 4.7

The only route between tasks today is the public canonical URL (the ALB
admits only CloudFront; tasks admit only the ALB), so `/api/internal/*` is
internet-reachable and the bearer token is the boundary: constant-time
compare, 503 when unset, never logged, high rate limit, outside the typed
RPC chain. Story 4.7 (Shaun) adds ECS Service Connect so brain → api becomes
VPC-private and the middleware can additionally refuse anything that arrived
through CloudFront (the `X-Origin-Verify` header marks it).

## Who asks what

On `/get-started`, the intake engine owns "what is next". In chat, the
companion's deterministic capture machine owns its three fields (name,
email, goal). They never both ask the same person the same thing: capture
pre-fills the intake through carry-over, and a member's context flows into
chat through the port.
