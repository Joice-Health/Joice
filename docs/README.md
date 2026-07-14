# Joice Docs

Deep-dive documentation that doesn't fit in a `CLAUDE.md` or a code comment.

## RAG chatbot ("Ask Joice")

The member-facing peptide chatbot: grounded, cited answers sourced from the
clinical team's notes, served from the existing API with pgvector + AWS Bedrock.

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

**New here? Read 01, then 05 to get it running.**

> Diagrams are [Mermaid](https://mermaid.js.org/). GitHub renders them natively.
> **Cursor/VS Code's markdown preview needs a one-time extension:**
> `cursor --install-extension bierner.markdown-mermaid` (or search "Markdown
> Preview Mermaid Support" in the extensions panel), then reopen the preview.
