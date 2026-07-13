# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Joice — a peptide/supplement membership platform (pre-launch). A public waitlist with referral
loop is live at https://joicehealth.com; the main site and an admin dashboard are being built
behind access gates in the same app. Bun is the package manager and runtime everywhere.

## Commands

```bash
bun install                 # install all workspaces
bun run dev                 # all apps in dev via Turbo (api :4000, web :3000)
bun run type-check          # tsc across all packages — run before claiming work done
bun run lint                # eslint across all packages
bun run test                # bun test (currently packages/core admin services)
bun run db:generate         # drizzle-kit: emit migration from schema changes
bun run db:migrate          # apply migrations (needs DATABASE_URL)

# Single test file:
cd packages/core && bun test src/admin/feature-flag-service.test.ts

# Preferred dev environment — full stack in Docker with hot reload:
docker compose up           # docker-compose.override.yml auto-merges: bind mounts + next dev/bun --hot
docker compose -f docker-compose.yml up --build   # production images (no hot reload)
```

Local Postgres publishes on **5433** (5432 is taken on this machine; `POSTGRES_PORT` in `.env`).
If a container stops seeing file edits (stale Docker Desktop mount cache — has happened):
`docker compose up -d --force-recreate api web`.

## Architecture

Turborepo monorepo; the type flow is the core design — **no hand-written DTOs anywhere**:

```
packages/db         Drizzle schema (single source of truth) + client + migrations
  └► packages/core  domain services (waitlist, admin/*) + shared Zod schemas — runtime-agnostic
       └► apps/api  Hono on Bun; routes chained so `export type AppType` carries full req/res types
            └► packages/api-client  hc<AppType> typed client + TanStack Query hooks
                 └► apps/web        Next.js App Router consumes the typed hooks
packages/ui         Tailwind v4 theme tokens (theme.css) + primitives (Button, Input, cn)
infra/              Terraform for all of AWS (see infra/README.md)
```

Rules that keep this working:
- API routes must stay in the single `.get(...).post(...)` chain in `apps/api/src/app.ts`
  (or a sub-router mounted with `.route()`), or `AppType` inference breaks for the web client.
- Browser-safe imports from `@joice/core` must use the `@joice/core/schemas` subpath — the
  barrel export pulls in the Postgres driver and breaks the web build.
- DB schema changes: edit `packages/db/src/schema.ts` → `bun run db:generate` → commit the
  migration. Both API containers run migrations at boot (local dev and prod).

## Access model (three tiers)

1. **Public**: `/waitlist` (+ `?ref=` referral links) — the only public surface until launch.
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
a redeploy or task-env change. Everything else (`TEAM_PASSWORD`, `SITE_LAUNCHED`,
`CLERK_SECRET_KEY`, `DATABASE_URL`) is runtime env on the ECS tasks — changed via
`terraform apply`, no rebuild.

In production the web app is built with `NEXT_PUBLIC_API_URL=""` — CloudFront serves web and
API from one origin (`/api/*` → API service), so browser calls are relative and CORS never
applies. Don't "fix" the empty string.

## Deployment

Push to `main` → `.github/workflows/deploy.yml` builds both images (web needs the
`NEXT_PUBLIC_*` build-args), pushes to ECR, forces new ECS deployments. Infra is Terraform in
`infra/` (CloudFront → ALB → 2× Fargate + RDS; Route53 for joicehealth.com + joice.health,
which 301s to the canonical domain preserving `?ref=`). Secrets/config that can't be committed
live in `infra/terraform.tfvars` (gitignored): `team_password`, `clerk_publishable_key`,
`clerk_secret_key`. Terraform state is local — it contains secrets; never commit it.

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
