# Joice Docs

Deep-dive documentation that doesn't fit in a `CLAUDE.md` or a code comment.

## RAG chatbot ("Ask Joice")

The member-facing peptide chatbot: grounded, cited answers sourced from the
clinical team's notes, using pgvector + AWS Bedrock. It runs as **its own
service** (`apps/brain`, everything under `/api/brain/*`) — start at 10 if you
want the shape of the system before the detail.

| Doc | What it covers |
|---|---|
| [01 — Overview & Architecture](rag/01-overview.md) | What it is, system diagram, every component, design decisions and why |
| [02 — Data Model & Embeddings](rag/02-data-model.md) | The `note_chunks` table, Titan embeddings, HNSW index, migration mechanics |
| [03 — Content Prep & Ingestion](rag/03-ingestion.md) | Vault prep (dedupe + PHI scan), S3 upload, the ingest task, the chunker |
| [04 — Query Flow & API](rag/04-query-flow.md) | Request lifecycle, retrieval, prompt construction, citations, SSE protocol |
| [05 — Running Locally](rag/05-local-development.md) | Every env var, step-by-step local setup, seeding data, curl examples |
| [06 — Deployment Runbook](rag/06-deployment-runbook.md) | One-time AWS setup, Terraform, first ingestion, verification, rollback |
| [07 — Compliance (HIPAA/BAA)](rag/07-compliance.md) | Why everything runs on Bedrock, the PHI review gate, pre-launch checklist |
| [08 — Troubleshooting](rag/08-troubleshooting.md) | Symptom → cause → fix for every known failure mode |
| [09 — Admin Brain Settings](rag/09-admin-brain.md) | The `/admin/brain` control panel: persona, tone, guardrails, retrieval, model, voice |
| [10 — The Brain as Its Own Service](rag/10-architecture.md) | Why it's a separate deployable, the URL namespace, ports, schema ownership, migrations, how to deploy it |
| [11 — The Brain Audit](rag/11-brain-audit.md) | What the audit found and what the `brain-v2` branch changed: tool mode, source types, the corpus inventory, retention/erasure — and what is deliberately still open |

**New here? Read 01 and 10, then 05 to get it running.**

## Onboarding (intake logic tree)

The admin-configurable intake flow behind `/get-started`: state and age gates, goal
branches, a profile with provenance, registration, and the data shape protocols will match
on. Work lands on the `onboarding/intake` branch; the design brief is the place to start.

| Doc | What it covers |
|---|---|
| [00 Design brief (approved plan)](onboarding/00-plan.md) | Tracked as Shortcut epic 127. Product design (journey, gates, carry-over, segments), architecture (data model, flow definition, condition DSL, engine, versioning, brain exchange, compliance), file-level implementation plan, phases and stories, verification, documentation and branch workflow, decisions log, council verdict |
| [01 Overview](onboarding/01-overview.md) | The journey (flowchart), the three tiers and the flags, what exists and what comes later, file by file |
| [02 The flow model](onboarding/02-flow-model.md) | The definition (bank + sections), the condition language and its why-trace, the engine (walk, minor rule, pruning, back), versions and pinning, the publish validator's codes |
| [03 The data model](onboarding/03-data-model.md) | Every table with its writer, the trait registry and tiers, the profile fold and provenance precedence, migrations and seeds, retention |
| [04 Sessions and registration](onboarding/04-sessions-and-registration.md) | The cookie, requireMember and the no-webhook member record, the claim (rules and sequence), the brain's JWT-key recognition, retention, the Clerk dashboard checklist |
| [05 The admin guide](onboarding/05-admin-guide.md) | For non-engineers: change wording, add a question, what locks and tiers mean, simulate before publishing, roll back, what the surface refuses by design |
| [06 The brain and the intake](onboarding/06-brain-integration.md) | The three exchanges (carry-over, claim, member context over /api/internal), what may cross by tier, anonymous-on-failure, the trust boundary and 4.7 |
| [07 Compliance](onboarding/07-compliance.md) | Sensitivity tiers, the two PHI keys, minors, notice and consent, identity linking, retention, analytics rules, what is open for counsel |
| [08 Running it locally](onboarding/08-local-development.md) | Migrate, open the flag, click through, drive the API with curl, look at the data, tests, reset |
| [09 Troubleshooting](onboarding/09-troubleshooting.md) | Symptom, cause, fix: flags and caches, cookie and credentials, action error codes, publish refusals, rollback and schema versions, local Docker quirks |

Page 10 (protocol readiness) arrives with Phase 5; see section 7 of the brief. **New here? Read 01, then 02, then 08 to run it.**

## CI/CD

| Doc | What it covers |
|---|---|
| [How Joice deploys](ci-cd/README.md) | Push-to-main pipeline: change detection with `turbo ls --affected`, what each `scripts/ci/*.sh` does, the migrate/roll/restore steps, Turborepo caching in CI, and the open simplification candidates |

## Design

| Doc | What it covers |
|---|---|
| [01 — Design system](design/01-design-system.md) | The palette, the three Dinamo faces and their roles, the bracket and dotted-pill devices, what is still placeholder |

## Marketing (Klaviyo)

| Doc | What it covers |
|---|---|
| [01 — Klaviyo Waitlist Sync](marketing/01-klaviyo.md) | Architecture (shared client → per-domain ports), the fire-and-forget sync, what data leaves the DB, config/secrets, the checkpoint extension recipe, troubleshooting |

> Diagrams are [Mermaid](https://mermaid.js.org/). GitHub renders them natively.
> **Cursor/VS Code's markdown preview needs a one-time extension:**
> `cursor --install-extension bierner.markdown-mermaid` (or search "Markdown
> Preview Mermaid Support" in the extensions panel), then reopen the preview.
