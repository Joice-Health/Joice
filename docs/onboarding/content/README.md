# Authored intake content

Flow content that is data, not code: definition fragments an admin reviews in
the editor and publishes deliberately. Nothing in this folder reaches a
visitor by being merged; it reaches a visitor when an admin clicks Publish.

## goal-branches.json (story sc-165)

The five care-area sections plus "help me choose": one or two questions each,
marketing/personal tier only. Lifestyle questions (sleep hours, activity
level) are deliberately absent until counsel confirms their tier, and health
questions belong to the health workstream, not this file.

Load it as a draft for review:

```bash
DATABASE_URL=postgresql://joice:joice@localhost:5433/joice \
  bun apps/api/scripts/load-goal-branches.ts
```

The script merges the fragments into a copy of the live published definition,
saves a draft, and prints the validation report. Sections and questions that
already exist are skipped, so it is safe to re-run. Review the draft at
/admin/onboarding/flow, walk a persona per branch through the simulator, then
publish. Expect one warning: `goal_timeline` is asked by both the weight and
recovery branches, which can never both be shown (they hang off different
goals); the shared trait is what protocols want.

In production, run the same script with the production DATABASE_URL from a
machine that can reach it, or author the sections by hand in the editor
following the story's steps; the JSON is the copy of record either way.
