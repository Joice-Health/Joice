# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Joice — a peptide/supplement membership platform (pre-launch). A public waitlist with referral
loop is live at https://joicehealth.com; the main site and an admin dashboard are being built
behind access gates in the same app. Bun is the package manager and runtime everywhere.

## Commands

```bash
bun install                 # install all workspaces
bun run dev                 # all apps in dev via Turbo (api :4000, brain :4100, web :3000)
bun run check               # type-check + lint + test in one turbo run; run before claiming work done
bun run type-check          # tsc across all packages
bun run lint                # eslint across all packages
bun run test                # bun test (currently packages/core admin services)
bun run db:generate         # drizzle-kit: emit migration from schema changes
bun run db:migrate          # apply migrations (needs DATABASE_URL)

# Single test file:
cd packages/brain && bun test src/conversation/history.test.ts

# Preferred dev environment — full stack in Docker with hot reload:
docker compose up           # docker-compose.override.yml auto-merges: bind mounts + next dev/bun --hot
docker compose -f docker-compose.yml up --build   # production images (no hot reload)
```

Local Postgres publishes on **5433** (5432 is taken on this machine; `POSTGRES_PORT` in `.env`).
If a container stops seeing file edits (stale Docker Desktop mount cache — has happened):
`docker compose up -d --force-recreate api brain web`. If that isn't enough (the container
sees a *truncated* file and reports a syntax error at a line that looks fine on the host),
give the file a fresh inode: `cp f /tmp/x && rm f && cp /tmp/x f`, then restart.
A second overnight failure mode: after the Mac sleeps, a long-running api/brain container's
pooled Postgres sockets die silently; every db-backed request then hangs ~10s and the browser
sees `ERR_EMPTY_RESPONSE` (`[Bun.serve]: request timed out` in the container log) while
Postgres itself is healthy. Fix: `docker restart joice-api-1` (or whichever service hangs).

## Architecture

Turborepo monorepo; the type flow is the core design — **no hand-written DTOs anywhere**:

```
packages/db          Drizzle schema, split by owner (schema/{waitlist,identity,platform,brain,onboarding}.ts)
  ├► packages/core   platform domain: waitlist + admin/* + onboarding/* + profile/* + rules/*, runtime-agnostic
  │    └► apps/api   Hono on Bun :4000 — `export type AppType`
  └► packages/brain  THE BRAIN: retrieval, generation, voice, config, ports
       └► apps/brain Hono on Bun :4100 — `export type BrainAppType`
            └► packages/api-client   hc<AppType> + hc<BrainAppType> clients + TanStack hooks
                 └► apps/web         Next.js App Router consumes the typed hooks
packages/ui          Tailwind v4 theme tokens (theme.css) + primitives (Button, Input, cn)
packages/utils       dependency-free helpers any package or app may import (US states, ...)
infra/               Terraform for all of AWS (see infra/README.md)
```

**Two services, one database.** The brain is a separate deployable because it holds the
AI permissions, scales differently, and is where the product is going. Everything it serves
lives under `/api/brain/*`; the ALB routes that prefix to it at a *higher* rule priority than
`/api/*`. Full rationale and the deploy steps: `docs/rag/10-architecture.md`.

Rules that keep this working:
- Routes must stay in the single `.get(...).post(...)` chain — `apps/api/src/app.ts` for the
  platform, `apps/brain/src/app.ts` for the brain (or a sub-router mounted with `.route()`),
  or RPC type inference breaks for the web client.
- Browser-safe imports must use the `/schemas` subpath (`@joice/core/schemas`,
  `@joice/brain/schemas`) — the barrels pull in the Postgres driver and the AWS SDK.
- **The brain never imports another domain's tables.** It declares interfaces in
  `packages/brain/src/ports` and gets adapters injected. Adding orders/catalogue/cart later
  should touch one adapter file, not the domain.
- A service writes only the tables in its own `packages/db/src/schema/*.ts` file.
- DB schema changes: edit the right file under `packages/db/src/schema/` → `bun run db:generate`
  → commit the migration. **Migrations do NOT run at boot** — compose runs a one-shot `migrate`
  service, and CI runs the `joice-migrate` ECS task to completion before deploying either
  service. Two services booting migrations against one database would race.

## Onboarding rules that keep this working

The intake flow on `/get-started` (design brief: `docs/onboarding/00-plan.md`; model:
`docs/onboarding/02-flow-model.md`, `03-data-model.md`):

- Flow definitions are **versioned and immutable once published**; sessions pin a version.
  A copy-only publish (same logic hash) moves live sessions forward; a logic change never does.
  Publish/rollback go through `createFlowService` (audited) and nothing else moves the pointer.
- **The engine is pure and lives in core** (`packages/core/src/onboarding/engine.ts`). The
  server computes the next step; the browser only renders it. Gates cannot be bypassed.
- **Traits are code with sensitivity tiers** (`packages/core/src/profile/traits.ts`); questions
  bind to traits; protocols and the brain read traits, never question ids. The publish
  validator refuses health-tier traits until both PHI keys are on: `PHI_READY` (Terraform) and
  the `onboarding_health` flag.
- **A date of birth under the minimum age is never persisted** (the engine checks the age gate
  before writing) and the session's answers and observations are purged.
- `onboarding_events` and GTM carry **keys and outcomes only**, never answer values, names or
  emails.
- **Notify-me** (`service_area_requests`) is its own table: not the referral waitlist, no brain
  lineage. Klaviyo under `onboarding_*` is the only place the funnels meet.
- The intake cookie (`joice_onboarding_session`, api) is separate from the brain cookie; the
  api client sends `credentials: 'include'` and the api's CORS allows it (dev is cross-origin).
- The brain reaches the profile **only over HTTP** (`/api/internal/*`, Phase 4); it never
  imports onboarding tables and the platform never reads brain tables for carry-over: the
  visitor carries companion data over and confirms it.
- Every onboarding change lands on the `onboarding/intake` branch with its docs
  (`docs/onboarding/*`) and the relevant CLAUDE.md in the same PR.

## Team visibility workflow

Every piece of work is visible on three surfaces: `docs/` speaks to engineers, Shortcut to
product, Notion to the whole team. Same facts, three voices. Full doc:
`docs/workflow/01-team-visibility.md`.

- **Feature-sized work**: after the plan is approved, run the `kickoff` skill **before writing
  code** (engineering docs under `docs/<area>/`, the `docs/README.md` index, a Shortcut epic
  with product-voiced stories under the Engineering team, all cross-linked). When it ships,
  run the `wrap-up` skill (as-built docs, story sweep + a plain-language epic status comment,
  the feature's Notion page under the Documentation page in the Joice Health workspace).
- **Fixes and small updates**: no new epic. One story on the relevant epic (or the standing
  "Maintenance" epic), and the affected `docs/*` and CLAUDE.md updated **in the same PR** as
  the change; this generalizes the onboarding rule above to the whole repo. If member-visible
  or admin-visible behavior changed, the feature's Notion page gets a changelog row at the
  next wrap-up.
- **Shortcut moves in lockstep with the code**, via the Shortcut MCP: story started (branch or
  first commit) means In Progress and assigned; PR opened means the PR URL attached to the
  story and In Review; PR merged means Done (with a story comment if scope changed).
  `wrap-up` is the catch-all sweep, not the mechanism.
- **Docs house style** (repo-wide, from the onboarding brief section 7): Mermaid for anything
  with more than two boxes, file:line references where a doc points at code, one "why"
  paragraph per decision, no em dashes anywhere (docs, stories, commits, copy), and
  `docs/README.md` indexes every new doc.
- **Conventions**: branch `<area>/<phase>-<story>-<slug>` (like `onboarding/2-1-member-clerk`);
  PR title `[P<phase>] <story#> <Title> (sc-NNN)`; commit bodies are prose ending with a story
  reference line, `Story sc-NNN (epic NNN).`

## Access model (four tiers)

1. **Public**: `/waitlist` (+ `?ref=` referral links) — the only public surface until launch.
   The waitlist itself sits behind the `waitlist` feature flag (seeded on by migration, toggled
   in `/admin/flags`); off, `/waitlist` and the public `/api/waitlist*` endpoints close and
   visitors land on `/coming-soon` ("Something special is coming"). The intake flow
   (`/get-started`, `/api/onboarding/*`) sits behind the `onboarding` flag (seeded off) and,
   like every other page, behind the team gate until launch.
2. **Team preview**: everything else redirects anonymous visitors to `/waitlist` via
   `apps/web/middleware.ts`. Team logs in at `/team` with `TEAM_PASSWORD` (HMAC cookie,
   no session store). `SITE_LAUNCHED=true` removes this gate entirely.
3. **Member** (`/sign-up`, `/sign-in`, `/welcome`, `/api/me/*`, the claim): Clerk, any
   signed-in user, no role. The `users` row is created on the member's first authenticated
   call after sign-up (`requireMember`), never by a webhook; `publicMetadata.memberId`
   (our users.id) is stamped then and rides the session-token `metadata` claim, which is
   also how the brain recognises members (public JWT key, no Clerk secret on that task).
   Behind the team gate until launch like the rest of the site.
4. **Admin** (`/admin/*`, `/api/admin/*`): Clerk auth. Admin = Clerk user with
   `publicMetadata.role === 'admin'`, surfaced through a session-token claim
   (Clerk Dashboard → Sessions → customize with `{ "metadata": "{{user.public_metadata}}" }`).
   If `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is absent, middleware hides `/admin` completely.

## Environment variables — the recurring gotcha

`NEXT_PUBLIC_*` values are **inlined at image build time** (GitHub Actions build-args from repo
Variables: `CLOUDFRONT_URL`, `CLERK_PUBLISHABLE_KEY`). Changing them requires a **rebuild**, not
a redeploy or task-env change: run the Deploy workflow manually with `scope=all`, because no
file in git changed and change detection would otherwise skip the web image. Everything else
(`TEAM_PASSWORD`, `SITE_LAUNCHED`, `CLERK_SECRET_KEY`, `DATABASE_URL`, the onboarding knobs
`PHI_READY`, `ONBOARDING_SESSION_IDLE_DAYS`, `ONBOARDING_SESSION_TTL_DAYS`) is runtime env on
the ECS tasks, changed via `terraform apply`, no rebuild.

In production the web app is built with `NEXT_PUBLIC_API_URL=""` — CloudFront serves web and
API from one origin (`/api/*` → API service), so browser calls are relative and CORS never
applies. Don't "fix" the empty string.

## Deployment

Push to `main` → `.github/workflows/deploy.yml`, gated on `ci.yml` (`bun run check`, with the
Turborepo cache carried between runs through the Actions cache). It deploys **only what
changed**: `scripts/ci/affected-apps.sh` diffs HEAD against the last commit the workflow
deployed successfully and asks `turbo ls --affected` which of web / api / brain that touches
(a workspace counts as changed when any file in it, or in a workspace it depends on, changed;
`packages/api-client` imports the api and brain route types, so a backend change also rebuilds
web, by design). Only those images are built (web needs the `NEXT_PUBLIC_*` build-args) and
only those services are rolled; the migrate task runs when the api image changed, since
`packages/db` ships inside it. Unchanged images are retagged with the commit sha, so
`web/api/brain:<sha>` in ECR always names the whole release. `/health` therefore reports the
sha that last *changed* a service, not the last commit deployed. Anything the detection is
unsure about (no previous run, rewritten history, a change to `.github/workflows`,
`scripts/ci` or `.dockerignore`) deploys all three, and a manual run with `scope=all` forces
that. A failed rollout is detected (the deployment's `rolloutState`, not
`wait services-stable`) and `:latest` is put back on the previous release; that is what makes
the expand/contract migration rule matter. Full walkthrough with diagrams: `docs/ci-cd/README.md`.

The ALB health check for web is `/health` (`apps/web/app/health/route.ts`, a plain 200 that is
public in `middleware.ts`). Never point it at a page: `/waitlist` 307s when the waitlist flag is
off, and a health check that can fail on a flag means no web deploy can complete while it is off.

CI never touches infrastructure: it pushes images and rolls the existing ECS services, nothing
else. Infra is Terraform in `infra/`, run locally by Shaun (CloudFront → ALB → 2× Fargate +
RDS; Route53 for joicehealth.com + joice.health, which 301s to the canonical domain preserving
`?ref=`). Secrets/config that can't be committed live in `infra/terraform.tfvars` (gitignored):
`team_password`, `clerk_publishable_key`, `clerk_secret_key`. Terraform state is local, it
contains secrets; never commit it.

The ALB rejects requests without CloudFront's secret header (origin lock) — hitting the ALB
directly returning 403 is by design. joicehealth.com email (Google Workspace MX) is a Terraform
record in `infra/dns.tf` — do not remove it.

## Design system

The system comes from the Dinamo type deck and the "Joice option 5" palette; the full spec
with the reasoning is `docs/design/01-design-system.md`. Tokens live in
`packages/ui/src/theme.css` (Tailwind v4 CSS-first `@theme`); primitives in `packages/ui`.

- **Colour**: `canvas` cream paper (#F5F0E9), `ink` dark olive-grey (#4D4F3F, never pure
  black), `stone` warm grey (#ABA8A0: fills, rules, disabled; never text), `muted` for
  secondary text, `surface` white. `brand-*` is the olive ramp with #877C00 at 600. Olive is
  an accent, not a body colour: it carries the announcement bar, focus rings, dots. The
  `card-from/card-to` gold gradient is reserved for the membership card.
- **Type**: three Dinamo faces, all Light 300, licensed files in `apps/web/fonts` (not
  `public/`, so they are never served raw) loaded via `next/font/local` in
  `apps/web/app/layout.tsx`. `font-sans` ABC Ginto (text, +1% tracking),
  `display` utility = ABC Ginto Nord Condensed uppercase (+3%, short charismatic statements),
  `mono-label` utility = ABC Gaisyr Mono uppercase 11px (+5%: eyebrows, nav, buttons, indices).
  `font-synthesis: none` is on `html`, so `font-bold`/`font-semibold` render as Light: do not
  use weight for emphasis, use size, case, or a bracket.
- **Devices**: square brackets mark a variable in the system, `[ you ]`, `[ 01 ]`,
  `[ get started ]` (`Bracket`/`Index` from `@joice/ui`); the button is a dotted-outline pill
  with a mono label whose forward actions end in ` +` (`buttonClasses`, `Button`, `CtaLink`);
  structure is hairlines (`border-line`) and open lists, not cards, shadows or glass. Large
  image panels take `rounded-card`; everything small is a pill. `ImageSlot` renders the
  organic green field until a photo lands under `public/`.
- Frost is for things that float over content: the full-width sticky nav (frosted cream, no
  rule beneath it) and the `glass` panels in admin. White surfaces (`panel`, `Input`, `glass`)
  carry no frame; the white on the cream is the edge. The animated water/video background
  (`water-background.tsx`) belongs to `/waitlist` only.

## Compliance posture

Phase 0 stores marketing data only (waitlist emails + referral attribution) — treated as not
PHI. HIPAA-ready pieces are already baked in (encrypted RDS, forced DB TLS, salted IP hashes —
never store raw IPs). Before any health data ships, work through the "Before PHI" checklist in
`infra/README.md`. Referral reward copy ("a month free") is gated on counsel review.
