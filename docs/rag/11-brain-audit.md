# 11 — The brain audit, and what the brain-v2 branch did about it

*Audited 2026-08-12; remediation landed on the `brain-v2` branch (six commits,
each independently reviewed by two fresh-context reviewers before merge). This
doc is the plain-English record: what was found, what changed, and what is
deliberately still open — with owners.*

---

## How the brain answered a question before this branch

```
Visitor asks a question
        │
        ▼
  Brain service
        │  1. Turn the question into a vector, search the note library
        │  2. Did any notes match?
        │        no ──► canned "not covered" reply. The model NEVER runs.
        ▼ yes
  Model (Bedrock) reads the matched notes, writes the answer
        │
        ▼
  Answer streams to the screen, with citations (+ spoken via Polly)
```

That step-2 wall made hallucination structurally impossible — and made the
companion a dead-end for anything outside the notes ("what do you sell?").

## How it answers now, when `toolsEnabled` is on (default: off)

```
Visitor asks a question
        │
        ▼
  Model — holding a toolbelt
        ├── search_notes        same pgvector search, on demand, type-filterable
        ├── search_catalogue    the product catalogue via CatalogPort (stub today)
        ├── request_clinician_handoff   draws the "talk to the team" card
        └── flag_intent         nudges the conversion offer's timing
        │   (loop: search → read → search again; ≤3 rounds, token budget,
        │    per-round fan-out cap; failures fed back, never crashes)
        ▼
  Answer streams as before. Citations can only point at what a tool
  actually returned — a per-request provenance registry enforces it in code.
```

The old structural guarantee is replaced by three layers: the prescriptive
`TOOL_SAFETY_FLOOR` (code constant, not admin-editable), the provenance
registry (the model cannot mint a citation to something it didn't retrieve),
and the eval harness (`apps/brain/scripts/eval.ts`), whose off-corpus refusal
cases measure the residual risk — **running it is the gate for enabling the
flag anywhere real**. Rollback is the admin toggle: off runs the classic
pipeline byte-for-byte, live within ~30s, no deploy.

---

## What the audit found — and the disposition of each finding

### Fixed on this branch

| Finding | Fix |
|---|---|
| "I want to sign up" typed at the name step was saved as the visitor's **name** | Intent outranks capture; non-question buying signals get the offer and always get a reply |
| Typed (and spoken) names/emails were sent to Bedrock as chat history | `capture`-kind turns render normally but never enter the model's history; voice routes through the same capture router as typing |
| The capture re-ask could never fire (guard always true) | Re-anchors after two knowledge detours, once per field |
| The conversion card showed exactly once, ever | Fresh buying signals re-offer, ≥2 exchanges apart; finishing capture checks immediately |
| Companion emails went nowhere | Klaviyo sync via `LeadSyncPort` — profile import only (no consent claimed), `lead_*` property prefix, no `first_name` clobbering, serialized so retries can't regress newer state |
| Zero analytics despite GTM loading | Typed dataLayer taxonomy (chat/capture/CTA/handoff events); structurally cannot carry message text, names, or emails |
| `/get-started` dead-ended on a disabled button | Honest interim ending; no unbacked "we'll email you" promise (companion emails carry no marketing consent) |
| Chat answered only from one markdown corpus | `source_type` on every chunk + `knowledge_documents` inventory + PDF ingestion (in-process; BAA verified down to the bundled pdf.js) |
| No way to measure answer quality | `eval.ts` + `fixtures/golden.jsonl`: retrieval recall, citation honesty, refusal shape, tool choice, latency percentiles |
| Prod model id `us.anthropic.claude-sonnet-5` was invalid (undated) | Dated Sonnet 4.5 profile everywhere a default lived (env, tfvars default, compose, .env.example, admin presets); verify with `aws bedrock list-inference-profiles` before switching prod off Nova |
| Token usage columns never populated | The tool loop reports usage per answer; `record()` persists it |
| Transcript lost on reload; one endless thread per session | Resume + welcome-back behind `historyEnabled` (dark until persistence flips); threads rotate after 24h idle; "start a new conversation" opens a fresh server thread |
| Cut-off answers vanished entirely | Recorded with `{aborted: true}` (drop-off evidence), excluded from replays; Bedrock errors are *not* miscounted as abandonment |
| Answers longer than the 2000-char wire cap made every follow-up a 400 | History turns clipped to the cap in `buildChatHistory`, shared constant with the schema |
| No retention or erasure story | Nightly retention task (dormant-safe, always scheduled) + `deleteForRequester` erasure primitives with Klaviyo suppression, transactional and retryable |

### Deliberately NOT done (with reasons)

- **No waitlist coupling, anywhere.** The waitlist and the brain are separate
  funnels that never touch; Klaviyo deduping by email is the only place they
  meet. (Owner's standing rule.)
- **Capture stays a deterministic state machine**, not tool calls. Validated
  data, admin-owned copy, zero LLM on the PII path. `flag_intent` lets the
  model improve *timing* only.
- **`add_to_cart` is designed but not built** (no commerce exists). The shape
  is fixed: a tool may only draw a confirmation card; a plain endpoint the
  model can't reach — the only code able to call
  `cart.addItem({confirmedByMember: true})` — executes the human's click.
- **No member auth on the brain yet.** `requester.ts` is the seam (`memberId`
  always null today); `claim()` exists on both services for the day it ships.
- **Member context is not a tool.** When members exist, it becomes a
  `systemSuffix` — rendered server-side after the prompt-cache point, never
  round-tripping the browser.

### Still open — the honest list

**Shaun / counsel (decisions, not code):**
1. Retention *number* (`brain_retention_days`, default 90 — a default, not a
   policy) and the persistence-gate sign-off before `BRAIN_PERSIST_CONVERSATIONS`
   ever flips true.
2. AWS **AI-services opt-out** at the Organizations level (also in the
   standing manual-steps list).
3. Counsel review of disclaimer/companion copy (pre-existing gate).
4. The **Before-PHI infra list** (infra/README.md): BAA in Artifact, ALB HTTPS
   via custom domain + ACM, private subnets + VPC endpoints (incl. Bedrock),
   CloudTrail/flow logs/access logs, RDS Multi-AZ + KMS CMKs, Redis-backed
   rate limiting, app-level chat audit logging.

**Engineering follow-ups (none block merging this branch):**
5. **No alarms on the brain service at all** — 5xx, unhealthy tasks, Bedrock
   throttling, ingest failures, and (once enabled) a silently failing nightly
   retention task. `alarms.tf` covers only the api target group and RDS.
6. Prod model decision: run `eval.ts --full` (and `--full --tools`) against
   the real corpus on Nova Pro vs Claude; the numbers decide.
7. The erasure **endpoint** (blocked on member auth); the future handler must
   log error *names only* — `KlaviyoRequestError.message` can echo the email.
8. PDFs get **no automated PHI scan** (prep-vault is markdown-only). Ingest
   refuses PDFs outside `products/`, `faq/`, `policies/` as the control;
   extending prep-vault to scan PDF text is the real fix.
9. In-memory rate limiting multiplies by task count (pre-existing; Redis is a
   Before-PHI item).
10. Klaviyo suppression is profile-global: erasing a companion lead whose
    email is also on the waitlist silences waitlist email too. Intended —
    erasure only ever over-suppresses — recorded here so nobody "fixes" it.

---

## Rollout order

```
merge brain-v2 ─► deploy ─► ingest real corpus (types via prefixes)
      │
      ├─► eval.ts (retrieval)          — recall against the real vault
      ├─► eval.ts --full               — classic pipeline baseline
      ├─► eval.ts --full --tools       — tool loop, Nova Pro vs Claude
      │        │
      │        ▼ numbers acceptable?
      ├─► admin: toolsEnabled ON       (kill switch stays one toggle away)
      ├─► admin: promptCache ON        (verify cacheReadInputTokens > 0)
      │
      └─► LATER, gated on the counsel/infra list above:
          BRAIN_PERSIST_CONVERSATIONS=true  (resume + welcome-back light up,
          retention is already sweeping nightly)
          member auth → claim() → erasure endpoint → member context suffix
          commerce → CatalogPort adapter → propose_add_to_cart + /cart/confirm
```

## Operational notes

- **Klaviyo on the brain task**: the task definition now injects
  `KLAVIYO_API_KEY` (same secret the api uses). Requires `terraform apply`.
- **Retention infra**: six new resources in `infra/retention.tf`; the
  schedule is enabled but harmless while persistence is off (empty sweep).
  Apply order doesn't matter, but the brain image must contain
  `retention.ts` before the first *enabled* run does real work.
- **Migrations 0008–0010** are additive only (marketing_synced_at,
  source_type/title/knowledge_documents, messages.metadata). The HNSW index
  is untouched — verified against the snapshots each time.
- The corpus inventory is now queryable: `knowledge_documents` says what the
  brain knows, from where, since when — a future admin page reads it as-is.
