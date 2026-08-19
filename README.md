# Joice — Phase 0: Waitlist + Referral

A pre-launch waitlist with a viral referral loop. Sign up with an email → get a shareable
referral link + QR "membership card" → friends join via your link and you move up the line.

## Stack

| Layer    | Tech                                                                  |
| -------- | --------------------------------------------------------------------- |
| Monorepo | Turborepo + Bun workspaces                                            |
| API      | Bun + Hono (end-to-end typed via Hono RPC)                            |
| Web      | Next.js 16 (App Router), React 19, Tailwind v4, Zustand, TanStack Query |
| Data     | Postgres 17 + Drizzle ORM                                             |
| Deploy   | ECS Fargate via GitHub Actions (see CLAUDE.md → Deployment)           |

## Layout

```
apps/
  api/          Hono server (exports AppType for the typed client)
  web/          Next.js app — /waitlist page + share card
packages/
  db/           Drizzle schema, client, migrations
  core/         Waitlist domain service + shared Zod schemas
  api-client/   Hono RPC client + TanStack Query hooks
  ui/           Tailwind v4 theme tokens + primitives
  utils/        Dependency-free helpers usable anywhere (US states, ...)
  config/       Shared tsconfig + eslint
```

The DB schema is the single source of truth; the API exports its `AppType`, and the web app
consumes a fully-typed client — no hand-written DTOs.

## Run with Docker (recommended)

```bash
cp .env.example .env
docker compose up --build
```

- Web: http://localhost:3000 (redirects to `/waitlist`)
- API: http://localhost:4000/health
- The API container applies DB migrations on startup.

### Dev mode with hot reload (default)

`docker compose up` runs a **hot-reloading dev environment** — `docker-compose.override.yml`
is auto-merged. The repo is bind-mounted into the containers, so editing any file on the host
(components, styles, `public/`, API code) is picked up live (`next dev` + `bun --hot`). Each
workspace's `node_modules` is shadowed by an anonymous volume so the host's macOS modules never
clobber the container's Linux ones.

```bash
docker compose up --build   # first run (builds the dev images)
docker compose up           # subsequent runs
```

> If `5432` is taken on your host, set `POSTGRES_PORT` in `.env` (containers talk to Postgres
> over the internal network regardless).

### Production-style run

Bypass the dev override to build the optimized standalone images:

```bash
docker compose -f docker-compose.yml up --build
```

## Local development

```bash
bun install

# Start Postgres (or use your own and set DATABASE_URL)
docker compose up -d postgres

# Generate + apply the schema migration
bun run db:generate
bun run db:migrate

# Run API + web together
bun run dev
```

## Useful scripts

| Command               | What it does                              |
| --------------------- | ----------------------------------------- |
| `bun run dev`         | Run all apps in dev mode (Turbo)          |
| `bun run build`       | Build everything                          |
| `bun run check`       | Type-check, lint and test (what CI runs)  |
| `bun run type-check`  | Type-check the whole monorepo             |
| `bun run lint`        | Lint the whole monorepo                   |
| `bun run db:generate` | Generate a Drizzle migration from schema  |
| `bun run db:migrate`  | Apply pending migrations                  |

## API surface

| Method | Route                  | Purpose                              |
| ------ | ---------------------- | ------------------------------------ |
| POST   | `/api/waitlist`        | Join (idempotent by email); `{ email, ref? }` |
| GET    | `/api/waitlist/stats`  | Total signups (social proof)         |
| GET    | `/api/waitlist/:code`  | A code's position + referral count   |
| GET    | `/health`              | Healthcheck                          |

## Deferred to Phase 1

Email/SMS sends, reward/queue-jump logic, admin dashboard, auth/accounts, analytics.
