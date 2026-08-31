<!--
  Approved 2026-08-27. Epic: "Brain: toolbelt and boundaries"
  https://app.shortcut.com/joice-health/epic/237 (stories sc-238 to sc-240).
  Keep the decisions log at the bottom current as decisions are made.
  This file is the design brief until phase 2 lands, then the as-built
  reference for the toolbelt.
-->

# 13 — The toolbelt

How the companion's abilities are built, organized, surfaced, and grown. This
doc exists because the toolset will grow (member context, orders, protocols,
cart) and adding ability number five should be a routine afternoon.

## Where tools live today

Everything is in `packages/brain/src/tools/` (currently one module,
`index.ts`), consumed by the generic loop in
`packages/brain/src/generation/agent-loop.ts` which knows nothing about any
specific tool:

```mermaid
flowchart LR
    model["Bedrock Converse<br/>(model decides to call a tool)"] -->|toolUse| loop["runToolLoop<br/>agent-loop.ts"]
    loop -->|"Map.get(name)"| exec["ToolExecutor.execute<br/>tools/*"]
    exec -->|search_notes| reg["provenance registry<br/>(request-scoped chunk list)"]
    exec -->|search_catalogue| port["CatalogPort<br/>(ports, HTTP later)"]
    exec -->|toolResult| loop
    loop -->|final text| fin["finalize()<br/>citations resolve ONLY<br/>against the registry"]
    loop -.->|"tool events (SSE)"| ui["chat UI status line<br/>+ tools-used chips"]
```

The four tools: `search_notes` (retrieval into the provenance registry),
`search_catalogue` (via `CatalogPort`, stub until commerce), 
`request_clinician_handoff` (emits a handoff action), `flag_intent`
(emits a buying-signal action, deliberately invisible to the visitor).

Two rules keep this safe as it grows:

- **Provenance**: only chunks that passed through the registry can be cited.
  A citation marker pointing at anything else is silently dropped
  (`parseCitations`). A new tool that surfaces quotable content must append
  to the registry; a tool that must never be quoted must not.
- **Boundaries**: a tool that needs another domain's data goes through a port
  (`packages/brain/src/ports`), never a table import. The db-boundary tests
  (story sc-238) enforce the table half of this on every `bun run check`.

## The plan (phases match the epic)

1. **Boundary check** (sc-238): `packages/db/src/ownership.ts` derives the
   table lists from the schema modules at runtime and a small scanner checks
   every consuming package's imports; four per-package tests fail the build on
   a cross-domain table import. Allowlist = the two documented exceptions
   (brain reads `app_settings`; api reads `brain_profiles` for leads).
2. **Toolbelt reorganization** (sc-239): one file per tool exporting a
   `ToolDefinition` (Bedrock spec + zod input + UI label + executor factory);
   `index.ts` assembles the registry with an unchanged `buildToolExecutors`
   signature. The UI labels move out of `answer-service.ts` into the
   definitions so a new tool cannot forget its label. This doc gains the
   full adding-a-tool checklist as-built.
3. **Tool visibility** (sc-240): `showToolActivity` brain setting (default
   on), gated server-side so tool names never reach the wire when off; the
   finished answer carries a deduped `toolsUsed` trace rendered as chips.

## Adding a tool (checklist, completed as-built in phase 2)

1. New file in `packages/brain/src/tools/` exporting a `ToolDefinition`:
   Bedrock JSON schema + zod input schema (kept together, they move together),
   the visitor-facing label (empty string = deliberately silent), and the
   executor factory over `ToolDeps`.
2. Register it in `tools/index.ts`.
3. Decide provenance: registry append (quotable) or not (never cited).
4. Cross-domain data only through a port; wire the adapter in
   `apps/brain/src/services.ts`.
5. At least one eval case with `expectTool` in `/admin/eval` so the benchmark
   notices if the model stops (or starts wrongly) choosing it.
6. Reread `TOOL_SAFETY_FLOOR` (`packages/brain/src/generation/prompt.ts`);
   extend it if the tool changes what the model may promise or refuse.
7. A row in this doc's tool table.

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-08-27 | The brain keeps writing its own tables directly; API-driven stays the rule for cross-domain data only | Proxying the brain's own writes through the api would couple deploys, double write latency, and hand the api data it has no business with, reversing the least-privilege reason for the service split. The real boundary (cross-domain) is already HTTP-only via ports. Recorded in 10-architecture.md |
| 2026-08-27 | Ownership enforced by per-package boundary tests, not per-service Postgres roles (yet) | The CI check is free and catches the failure where it starts (a PR). Role separation is designed (NOLOGIN roles by migration, terraform-held passwords synced by the migrate task) and parked on the pre-PHI hardening list |
| 2026-08-27 | Tool visibility is a brain setting, not a feature flag | All chat-behavior knobs live in the audited brain settings row with the ~30s cache; the flags table is platform-owned and gates site surfaces. A flag would need a new cross-service read for one boolean |
| 2026-08-27 | Visibility = live status + tools-used chips, gated server-side | Showing the work builds trust, but when the switch is off the tool names must not reach the wire at all, not merely be hidden by the client |
