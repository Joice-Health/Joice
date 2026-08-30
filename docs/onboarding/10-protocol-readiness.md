# Protocol readiness

What exists today so that protocols can arrive as data, not a rewrite: the
sketch story 5.4 promised (design: `docs/onboarding/00-plan.md` section 3.12).

## The shape

A protocol rule is a condition over traits, in the same condition language as
gates, show-when rules and segments, evaluated by the same evaluator:

```jsonc
{
  "protocolKey": "weight-experienced",
  "label": "Weight: experienced starter",
  "when": { "all": [
    { "trait": "goal", "op": "eq", "value": "weight-metabolic" },
    { "trait": "peptide_experience", "op": "in", "value": ["some", "regular"] }
  ] },
  "priority": 20,
  "requiresClinician": true
}
```

`requiresClinician` is a zod literal `true`
(`packages/core/src/protocols/schemas.ts`): a match is a recommendation record
for a clinician and the admin simulator, structurally never a prescription and
never member-facing. `evaluateProtocolRules(rules, traits)`
(`packages/core/src/protocols/evaluate.ts`) returns every matching rule ranked
by priority with the evaluator's why-trace, not one winner: a reviewing
clinician wants the alternatives visible.

## Where the rules live

One `app_settings` row (`key = 'protocol_rules'`), managed by
`createProtocolRulesService` (`packages/core/src/protocols/protocol-rules-service.ts`)
exactly like the onboarding settings row: zod-validated, merged onto the code
defaults in `default-rules.ts` so a stale or invalid row can never break the
simulator, cached about 30 seconds, every write audited as
`protocols.rules_saved` on its own entity.

**Why not a table:** protocols are not a domain yet. There is no catalogue, no
clinical sign-off flow, no member surface. The settings row keeps the rules
admin-editable through `GET/PUT /api/admin/onboarding/protocol-rules` without a
migration; when protocols become real, the rules move into that domain with an
expand/contract migration and this service becomes the adapter.

## How to see it work

The admin simulator (`/admin/onboarding/simulator`) runs a persona through the
real engine and then evaluates the stored rules against the persona's final
traits. The "Protocols this persona matches" panel lists ranked matches, each
expandable to the why-trace. A persona missing the traits simply matches
nothing; it is never an error.

The save endpoint refuses a rule set whose conditions reference unknown traits
(the schema's `traitRefSchema` refuses them outright) or use a type-invalid
operator (`ProtocolRulesInvalidError` carries the same issue shape the flow
editor's condition builder shows).

## What is deliberately not built

- No protocol catalogue, dosing, or products: `protocolKey` is a forward
  reference the catalogue will resolve later.
- No member-facing surface anywhere. The brain's `MemberContextPort.protocols`
  stays empty until the clinical workstream fills it.
- No rules editor UI: the API exists and is audited; the editor arrives with
  the protocol domain, on the condition-builder component the flow editor
  already uses.
- No automatic anything: every match says `requiresClinician: true`, and the
  simulator labels the panel a preview.
