# Linear migration, part B (temporary checklist, delete when done)

Written 2026-09-16 with the Shortcut→Linear switch (see the PR that added this file). This
part needs a live Linear connection, which no session had yet. Any Claude Code session with
the Linear MCP connected can execute it top to bottom; it needs no other context.
Deliberately not indexed in `docs/README.md`: staging, not documentation.

## Shaun, one time

1. Start a new interactive Claude Code session in this repo; approve the `linear` server
   from `.mcp.json` when prompted, then run `/mcp` and complete the Linear OAuth.
2. In Linear: Settings, Integrations, GitHub; connect the Joice-Health/Joice repo. This is
   what makes issues move automatically from branch names and PR titles carrying `eng-NNN`.

## Then, in that session

3. Verify the import: list teams and confirm the Engineering team and its issue-id key. The
   workflow files assume `ENG`; if the key differs, fix the examples in
   `.claude/skills/kickoff/SKILL.md`, `.claude/skills/wrap-up/SKILL.md`,
   `.github/pull_request_template.md`, root `CLAUDE.md` (Team visibility workflow section)
   and `docs/workflow/01-team-visibility.md` in the same commit as the rest of this list.
   List projects and spot-check one imported issue's states.
4. Create the migration issue retroactively on the **Maintenance** project (imported from
   Shortcut; find it, never create a duplicate), product voice: the team switched to Linear,
   the workflow and docs followed. Link the migration PR; mark Done when that PR is merged.
5. The augment pass: keep every old epic number as record and pair it with its imported
   Linear project link, in the form `epic 127 (now in Linear: <project url>)`. Files and
   epic numbers:

   | File | Epic(s) |
   |---|---|
   | `docs/onboarding/00-plan.md` header (lines 1-3) | 127 |
   | `docs/rag/12-eval-console.md` header (lines 3-4) | 200 |
   | `docs/rag/13-toolbelt.md` header (lines 3-8) | 237, 285, 244 (285 and 244 are in flight, most important) |
   | `docs/shop/00-plan.md` header | 218 |
   | `docs/shop/01-commerce.md` header | 261 |
   | `docs/admin/00-plan.md` header | 253 |
   | `docs/marketing/00-plan.md` header | 278 |
   | `docs/README.md` index rows (currently lines 38 and 65) | 127, 261 |
   | root `CLAUDE.md` Access-model prose (`since sc-251`, `by sc-263`) | link the two issues or leave ids with the project link for 261 |

   Find each project by name (the import kept epic names, like "Onboarding: intake logic
   tree"). Old `sc-NNN` ids in these files stay as they are; the era note in
   `docs/workflow/01-team-visibility.md` explains them.
6. Notion (Documentation page in the Joice Health workspace, id
   `3587e3a92b3980328d06cf9a71b0f7d7`): on the sub-pages "Chatbot eval console" (links epic
   200) and "Get Started intake" (links epic 127), replace the Shortcut epic links with the
   Linear project URLs and append a changelog row to each.
7. Verify: `grep -rn "app.shortcut.com" docs/ CLAUDE.md` shows every remaining hit paired
   with a Linear link on the same line or the next one.
8. Delete this file, commit everything from steps 3 to 8 as one commit referencing the
   migration issue.
