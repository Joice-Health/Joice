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

## Architecture

Turborepo monorepo; the type flow is the core design — **no hand-written DTOs anywhere**:

```
packages/db          Drizzle schema, split by owner (schema/{waitlist,identity,platform,brain}.ts)
  ├► packages/core   platform domain: waitlist + admin/* — runtime-agnostic
  │    └► apps/api   Hono on Bun :4000 — `export type AppType`
  └► packages/brain  THE BRAIN: retrieval, generation, voice, config, ports
       └► apps/brain Hono on Bun :4100 — `export type BrainAppType`
            └► packages/api-client   hc<AppType> + hc<BrainAppType> clients + TanStack hooks
                 └► apps/web         Next.js App Router consumes the typed hooks
packages/ui          Tailwind v4 theme tokens (theme.css) + primitives (Button, Input, cn)
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

## Access model (three tiers)

1. **Public**: `/waitlist` (+ `?ref=` referral links) — the only public surface until launch.
   The waitlist itself sits behind the `waitlist` feature flag (seeded on by migration, toggled
   in `/admin/flags`); off, `/waitlist` and the public `/api/waitlist*` endpoints close and
   visitors land on `/coming-soon` ("Something special is coming").
2. **Team preview**: everything else redirects anonymous visitors to `/waitlist` via
   `apps/web/middleware.ts`. Team logs in at `/team` with `TEAM_PASSWORD` (HMAC cookie,
   no session store). `SITE_LAUNCHED=true` removes this gate entirely.
3. **Admin** (`/admin/*`, `/api/admin/*`): Clerk auth. Admin = Clerk user with
   `publicMetadata.role === 'admin'`, surfaced through a session-token claim
   (Clerk Dashboard → Sessions → customize with `{ "metadata": "{{user.public_metadata}}" }`).
   If `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is absent, middleware hides `/admin` completely.

## Environment variables — the recurring gotcha

`NEXT_PUBLIC_*` values are **inlined at image build time** (GitHub Actions build-args from repo
Variables: `CLOUDFRONT_URL`, `CLERK_PUBLISHABLE_KEY`). Changing them requires a **rebuild**, not
a redeploy or task-env change: run the Deploy workflow manually with `scope=all`, because no
file in git changed and change detection would otherwise skip the web image. Everything else
(`TEAM_PASSWORD`, `SITE_LAUNCHED`, `CLERK_SECRET_KEY`, `DATABASE_URL`) is runtime env on the
ECS tasks, changed via `terraform apply`, no rebuild.

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

Tokens live in `packages/ui/src/theme.css` (Tailwind v4 CSS-first `@theme`): `brand-*` is a
clinical stone (grey-brown, deliberately desaturated — never pure green/black), `ink` is very
dark grey (**never pure black text**), `canvas`/`surface`/`line`/`muted` neutrals, warm
`card-from/card-to` gradient reserved for the membership-card identity. Sans font is
Yantramanav (no 600 weight — `font-semibold` renders as 700); mono is Geist Mono, used for
eyebrow labels/uppercase microcopy. Prefer soft drop shadows over borders on cards; the `glass`
utility (frosted panels) needs something visual behind it. The animated water/video background
(`water-background.tsx`) belongs to `/waitlist` only.

## Compliance posture

Phase 0 stores marketing data only (waitlist emails + referral attribution) — treated as not
PHI. HIPAA-ready pieces are already baked in (encrypted RDS, forced DB TLS, salted IP hashes —
never store raw IPs). Before any health data ships, work through the "Before PHI" checklist in
`infra/README.md`. Referral reward copy ("a month free") is gated on counsel review.
