# Joice

A peptide/supplement membership platform. The public surfaces today are the storefront,
live at the root of https://joicehealth.com: `/` → `/shop` → `/checkout` (live products
and carts from the CarePortals Public API, checkout completing on the hosted care portal;
behind the `shop` flag, which outranks every other flag at the root; `/home`, the
landing's original URL, redirects there), the waitlist with its referral loop at
`/waitlist` (sign up with an email, get a shareable referral link and QR "membership
card", and move up the line as friends join), plus the permanent `/terms`, `/privacy`,
`/faq` and `/states` pages.

Behind access gates in the same repo, waiting for launch: the main site, the admin
dashboard at `/admin`, the "Ask Joice" companion (a retrieval-grounded chatbot running as
its own service, `apps/brain`), and the server-driven intake flow on `/get-started`.

This page is orientation only. The working rules live in [CLAUDE.md](CLAUDE.md); the deep
dives are indexed in [docs/README.md](docs/README.md); AWS layout and the pre-PHI
checklist are in [infra/README.md](infra/README.md).

## Stack

| Layer    | Tech                                                                     |
| -------- | ------------------------------------------------------------------------ |
| Monorepo | Turborepo + Bun workspaces                                               |
| API      | Bun + Hono on :4000, end-to-end typed via Hono RPC                       |
| Brain    | Bun + Hono on :4100, retrieval + generation on AWS Bedrock               |
| Web      | Next.js 16 (App Router), React 19, Tailwind v4, TanStack Query, Clerk    |
| Data     | Postgres 17 (pgvector) + Drizzle ORM                                     |
| Deploy   | ECS Fargate via GitHub Actions; Terraform in `infra/` (run locally)      |

## Layout

```
apps/
  api/          platform Hono server: waitlist, onboarding, member, admin (exports AppType)
  brain/        the Ask Joice service; everything under /api/brain/* (exports BrainAppType)
  web/          Next.js app: storefront (/, /shop, /checkout), waitlist, gated main site,
                /get-started intake, /admin dashboard
packages/
  db/           Drizzle schema (one file per owning service), client, migrations
  core/         platform domain: waitlist, admin, onboarding engine, profile, rules
  brain/        brain domain: retrieval, generation, voice, config, ports
  api-client/   typed Hono RPC clients for both services + TanStack Query hooks
  ui/           Tailwind v4 theme tokens + primitives (the design system)
  utils/        dependency-free helpers usable anywhere (US states, ...)
  marketing/    Klaviyo sync: shared client + per-domain ports
  config/       shared tsconfig + eslint
docs/           deep-dive engineering docs, indexed in docs/README.md
infra/          Terraform for all of AWS
scripts/ci/     change detection + deploy helpers used by GitHub Actions
```

The DB schema is the single source of truth: each service exports its route types and the
web app consumes fully typed clients. No hand-written DTOs anywhere.

Two services, one database: the brain is a separate deployable, and the ALB routes
`/api/brain/*` to it ahead of `/api/*`. Why, and the rules that keep it working, are in
CLAUDE.md and `docs/rag/10-architecture.md`.

## Run with Docker (recommended)

```bash
cp .env.example .env
docker compose up --build
```

- Web: http://localhost:3000 (anonymous visitors land on `/waitlist`)
- API: http://localhost:4000/health
- Brain: http://localhost:4100/health

Migrations are applied by the one-shot `migrate` service each time the stack comes up; the
api and brain wait for it. Nothing runs migrations at boot.

### Dev mode with hot reload (default)

`docker compose up` runs a **hot-reloading dev environment**: `docker-compose.override.yml`
is auto-merged, the repo is bind-mounted into the containers, and editing any file on the
host is picked up live (`next dev` + `bun --hot`). Each workspace's `node_modules` is
shadowed by an anonymous volume so the host's macOS modules never clobber the container's
Linux ones.

```bash
docker compose up --build   # first run (builds the dev images)
docker compose up           # subsequent runs
```

> If `5432` is taken on your host, set `POSTGRES_PORT` in `.env` (containers talk to
> Postgres over the internal network regardless).

### Production-style run

Bypass the dev override to build the optimized standalone images:

```bash
docker compose -f docker-compose.yml up --build
```

## Local development without Docker

```bash
bun install

# Start Postgres (or use your own and set DATABASE_URL)
docker compose up -d postgres

# Apply migrations
bun run db:migrate

# Run api + brain + web together
bun run dev
```

## Useful scripts

| Command               | What it does                                    |
| --------------------- | ----------------------------------------------- |
| `bun run dev`         | Run all apps in dev mode (Turbo)                |
| `bun run build`       | Build everything                                |
| `bun run check`       | Type-check, lint and test (what CI runs)        |
| `bun run type-check`  | Type-check the whole monorepo                   |
| `bun run lint`        | Lint the whole monorepo                         |
| `bun run test`        | Run all tests                                   |
| `bun run db:generate` | Generate a Drizzle migration from schema changes |
| `bun run db:migrate`  | Apply pending migrations                        |

## API surface

Route namespaces rather than a route list (the typed chains in `apps/api/src/app.ts` and
`apps/brain/src/app.ts` are the authoritative source):

| Namespace          | Service | What                                                        |
| ------------------ | ------- | ----------------------------------------------------------- |
| `/api/waitlist*`   | api     | join, stats, position; public while the `waitlist` flag is on |
| `/api/flags`       | api     | public feature-flag read                                    |
| `/api/onboarding/*`| api     | the `/get-started` intake, behind the `onboarding` flag     |
| `/api/me/*`        | api     | member endpoints (Clerk)                                    |
| `/api/admin/*`     | api     | admin dashboard endpoints (Clerk `role: admin`)             |
| `/api/internal/*`  | api     | service-to-service only, never called from the browser      |
| `/api/brain/*`     | brain   | chat, voice, conversations, recommendations, config, eval   |
| `/health`          | all     | health checks (web's is the ALB target)                     |

## Access

Four tiers: public waitlist, team preview behind the `/team` password gate, member
(Clerk), and admin (Clerk role). The full model, including the feature flags and how the
gates come off at launch, is CLAUDE.md's "Access model" section.
