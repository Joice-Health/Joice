<!--
  Approved 2026-08-27. Epic: "Brain: toolbelt and boundaries"
  https://app.shortcut.com/joice-health/epic/237 (stories sc-238 to sc-240, shipped).
  Extended 2026-09-12 by "Brain: the product tool"
  https://app.shortcut.com/joice-health/epic/285 (stories sc-286 to sc-289):
  the product tool section below is that epic's design brief until it lands.
  Extended 2026-08-31 by "Brain: audience tiers"
  https://app.shortcut.com/joice-health/epic/244 (stories sc-245 to sc-249):
  the access model section below is that epic's design brief until it lands.
  Keep the decisions log at the bottom current as decisions are made.
-->

# 13 — The toolbelt

How the companion's abilities are built, organized, surfaced, and grown. This
doc exists because the toolset will grow (member context, orders, protocols,
cart) and adding ability number five should be a routine afternoon.

## Where tools live

One file per tool in `packages/brain/src/tools/` (`search-notes.ts`,
`search-catalogue.ts`, `clinician-handoff.ts`, `flag-intent.ts`), each
exporting a `BrainTool` (`types.ts`): the Bedrock spec, the zod input schema
kept beside it, the visitor-facing label, and the per-request executor
factory. `index.ts` is the registry: the `TOOLS` list, the derived
`toolLabels` map, and `buildToolExecutors(deps)`. The generic loop in
`packages/brain/src/generation/agent-loop.ts` knows nothing about any
specific tool:

```mermaid
flowchart LR
    model["Bedrock Converse<br/>(model decides to call a tool)"] -->|toolUse| loop["runToolLoop<br/>agent-loop.ts"]
    loop -->|"Map.get(name)"| exec["ToolExecutor.execute<br/>tools/*"]
    exec -->|search_notes| reg["provenance registry<br/>(request-scoped chunk list)"]
    exec -->|search_catalogue| port["CatalogPort<br/>(CarePortals public API)"]
    exec -->|toolResult| loop
    loop -->|final text| fin["finalize()<br/>citations resolve ONLY<br/>against the registry"]
    loop -.->|"tool events (SSE)"| ui["chat UI status line<br/>+ tools-used chips"]
```

The four tools: `search_notes` (retrieval into the provenance registry),
`search_catalogue` (live over `CatalogPort`: the curated shelf with
CarePortals prices, feeding the product-card registry),
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
3. **Tool visibility** (sc-240): the `showToolActivity` brain setting
   (default on, managed on `/admin/brain` next to Show citations). The gate
   lives in `answer-service.ts`'s stream re-yield, so when it is off tool
   names never reach the wire at all; when on, the finished answer also
   carries a deduped `toolsUsed` trace (name + label, silent tools excluded)
   in the recommendation payload, rendered as chips beside the citation
   chips on `/ask`. The public config slice exposes the toggle so an
   already-open tab honors a flip within its next answer.

## The access model (audience tiers)

Everyone talking to the companion is at one of four lifecycle stages, the
universal vocabulary defined once in `packages/utils/src/audience.ts`:

| Tier | Meaning | Resolved from |
|---|---|---|
| `visitor` | anonymous, nothing known | neither of the below |
| `lead` | shared an email | `brain_profiles.email` for the session (pure `peek`, no insert) |
| `user` | signed-in account | verified `memberId` on the request |
| `subscriber` | active subscription | `subscribed` on the member context, sourced from CarePortals via the api's SubscriptionPort over `/api/internal/profile` |

Tiers are ordered; `tierAtLeast(a, b)` is the one comparison helper. Resolution
happens per chat request in the answer service and degrades gracefully: a
failed lookup lowers the tier, never the answer.

Each tool carries a `settingKey` mapping to one flat brain setting whose value
is `'off'` or the minimum tier (`toolSearchNotes`, `toolSearchCatalogue`,
`toolClinicianHandoff`, `toolFlagIntent`; flat because the settings row merges
shallowly). `buildToolExecutors` filters the belt by setting and audience
before the model ever sees it: an out-of-tier tool is invisible, not refused.
Two special rules:

- If `search_notes` itself does not clear the gate, the request runs the
  classic pipeline; tool mode without retrieval has no grounding.
- The tools-mode system prompt reflects the advertised belt, so it never
  demands a tool that is not there.

Variants live in each tool's code keyed on `deps.audience` (admin controls
availability, code controls behavior): the first is `search_catalogue`, which
mentions ordering only from `user` up. The eval console records which tier a
run simulated (default `subscriber`, the full belt).

## The product tool (search_catalogue goes live)

The catalogue tool sells from the SAME curated shelf as `/shop`: the curation
map (`SHOP_CATALOG`) lives in `packages/utils/src/shop-catalog.ts` as shared
reference data (web re-exports it; slugs stay the canonical identifiers), and
the adapter `apps/brain/src/ports/careportals-catalog.ts` implements the
upgraded `CatalogPort` over the CarePortals PUBLIC API (organization header,
no secret): the full active list fetched and cached ~5 minutes, merged onto
the curation by `careportalsId`, matched locally against entry names, dose
lines and care areas, with the literal query `all` returning the whole shelf
for browse asks. A miss returns empty, honestly: "do you sell ozempic" must
never answer with the full range.

The card rides PROVENANCE, not the action channel: the executor pushes
slug-deduped structured hits into a request-scoped `ToolDeps.products`
registry (the citations pattern), and the answer service attaches
`recommendation.products = { items (max 4, retrieval order), canOrder }` at
complete, so both the streaming and non-streaming paths carry it and the
model can never invent card content. `canOrder` is one bit
(`tierAtLeast(audience, 'user')`), never the tier itself. The action channel
stays enum-only per its contract.

On `/ask`, one product renders as a card (the handoff-card panel idiom),
several as a plain-CSS snap carousel (max 4, fixed-width tiles, edge peek as
the scroll affordance). The browser joins by slug against the shared catalog
for image, hue and the CarePortals id: a slug outside the catalog renders
facts with no CTAs, never a dead link. View goes to `/shop/[slug]`; Add to
cart shows only when `canOrder`, the `commerce` flag is on (the first
`usePublicFlags` consumer), the product is available and the slug joins; the
add uses the shop's own cart hooks and STAYS in the conversation ("Added." +
View cart link). Card engagement counts as a buying signal for the existing
conversion machinery. Cards are product surface, not introspection: they are
NOT gated by `showToolActivity` (the handoff precedent); the kill switch is
the `toolSearchCatalogue` access setting.

Deliberately later, not now: cart-aware cards ("already in your cart"),
order-history awareness once `MemberOrder` is real, per-area browse chips,
persisting shelves if conversation persistence turns on.

## Adding a tool (the checklist)

1. New file in `packages/brain/src/tools/` exporting a `BrainTool`:
   Bedrock JSON schema + zod input schema (kept together, they move together),
   the visitor-facing label (empty string = deliberately silent), the
   `settingKey` naming its access setting, and the executor factory over
   `ToolDeps` (which carries `audience` for tier variants).
2. Register it in `tools/index.ts`, add its key to `TOOL_ACCESS_KEYS`, its
   field to `brainSettingsSchema`, and its default to
   `DEFAULT_BRAIN_SETTINGS` (config/schemas.ts); the admin Toolbelt card
   picks it up from the key list.
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
| 2026-08-27 | The eval harness pins showToolActivity on, like showCitations | expectTool scoring reads the tool events this toggle gates at the source; a visitor-facing presentation switch must never blind the quality gate (caught in review before it shipped) |
| 2026-08-27 | Trace chips record successful completions only, and are not persisted | A 'started' event fires before the loop decides to execute, so a chip could otherwise claim a check that never ran. Stored history restores citations but not the trace; revisit if conversation persistence turns on |
| 2026-08-31 | Trial subscriptions count as subscriber | CarePortals statuses active/trialing/trial all clear the tier: someone mid-trial has committed payment details and should get the full experience they are trialling. Revisit if trials become free |
| 2026-08-31 | Subscription lookups never sit on the request path | The adapter answers from cache and revalidates in the background: the internal profile read lives inside the brain's 1500ms budget, and a cold third-party chain there would make subscriber unreachable while degrading the whole member context. Cost: the first turn in a cache window reads user, not subscriber |
| 2026-09-12 | Product cards ride the recommendation payload, not the action channel | Actions are enum-only by contract and never reach the non-streaming path; the shelf attaches at complete like citations, so both paths carry it and the model can never invent card content |
| 2026-09-12 | Cards are not gated by showToolActivity, and the shelf is never persisted | Product surface, not introspection (the handoff precedent); the kill switch is the toolSearchCatalogue access setting. Stored prices would lie on restore, so shelves join toolsUsed in staying unpersisted |
| 2026-09-12 | The slug is the chat-to-shop join key, and cart analytics carry no product ids | Cards join client-side against the shared catalog for image, hue and the CarePortals id, so drift degrades to CTA-less cards, never dead links; the cart_item_added funnel gains only a source enum, keeping the commerce namespace free of identifiers |
| 2026-09-12 | Add to cart in chat stays in the conversation | Navigation mid-conversation destroys the thread that sold the product; the quiet Added plus a cart link keeps the person where the selling happened (Shaun) |
| 2026-09-12 | View and View cart open a new tab until history persistence ships | The transcript is client state and restore ships dark, so an in-tab navigation would destroy the conversation the card came from; a new tab keeps both. Revisit when conversation persistence turns on |
