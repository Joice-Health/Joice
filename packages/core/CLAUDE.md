# CLAUDE.md

Guidance for `packages/core`, the platform domain: the waitlist, the admin
services, and (since the onboarding epic) the intake flow and the member
profile. Runtime-agnostic: it knows Drizzle and zod, never Hono, React, env or
the AWS SDK. Read the root CLAUDE.md first.

## Shape

```
src/schemas.ts        the browser-safe subpath (@joice/core/schemas): zod + pure helpers, NO db import
src/index.ts          the server barrel: everything, including services (pulls in the Postgres driver)
src/waitlist-service.ts
src/admin/            audit, feature flags, settings, users, leads, admin waitlist + their zod contracts
src/marketing/        the Klaviyo ports/adapters for each domain (waitlist, onboarding)
src/profile/          traits.ts (the registry + tiers), derive.ts, projector.ts, profile-service.ts
src/rules/            the condition language: conditions.ts, evaluate.ts, validate.ts
src/protocols/        the protocol_rules sketch: rule schema, ranked evaluator, defaults (browser-safe)
                      + protocol-rules-service (the app_settings row, server barrel only)
src/onboarding/       schemas.ts, default-flow.ts, validate-flow.ts, engine.ts, simulate.ts (browser-safe)
                      + the services: flow, onboarding (sessions), session-store, service-area,
                        service-area-request, onboarding-config, events, marketing-port, admin-schemas
```

## Rules

- **Services are factories**: `createXService(db, audit?, opts?)` returning an
  object literal, `export type XService = ReturnType<typeof createXService>`.
  Constructed once in `apps/api/src/services.ts`. Options carry an injectable
  clock (`now`) and cache TTL so tests never sleep.
- **Browser-safe means browser-safe.** Anything re-exported from
  `src/schemas.ts` may import zod, `@joice/utils` and other files that do the
  same, never `@joice/db` or a service. The web app imports the subpath only.
- **The engine has no db.** `onboarding/engine.ts`, `rules/*`, `profile/derive.ts`
  and `profile/projector.ts` are pure functions; the session service is the only
  caller that persists. Keep it that way: the admin simulator and the tests
  depend on it.
- **Traits are code.** New traits go in `profile/traits.ts` with a sensitivity
  tier; questions bind to them; admins may create `custom.*` traits (marketing
  tier only). Health-tier traits are refused by the publish validator until both
  PHI keys are on.
- **One writer per table.** The onboarding and profile tables
  (`packages/db/src/schema/onboarding.ts`) are written by the services here,
  on the api service, and nowhere else.
- **Never store values in events.** `onboarding_events` and anything that
  reaches GTM carry keys and outcomes only.
- **Tests**: `bun test`, colocated `*.test.ts`, hand-written fakes. Pure code
  gets table tests (`engine.test.ts` is the model); db-backed services get a
  recording stub db (`profile-service.test.ts`) or an in-memory store behind an
  interface (`onboarding-service.test.ts` with `SessionStore`). No test
  database, no mocking library.
- Docs: `docs/onboarding/02-flow-model.md` (definitions, rules, engine,
  versions) and `03-data-model.md` (tables, registry, fold, migrations).
