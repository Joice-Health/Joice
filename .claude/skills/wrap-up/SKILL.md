---
name: wrap-up
description: "Close the loop when Joice work ships: bring docs/ to as-built, sweep Shortcut story states and post a product-voiced epic status comment, and write or update the feature's Notion page under the Documentation page in the Joice Health workspace. MANDATORY TRIGGERS: a feature, phase, or epic just finished; before claiming an epic done; the user says 'wrap up', 'wrap-up', 'close out', 'ship the docs'. ALSO TRIGGER after a batch of fixes that touched shipped behavior, to refresh the Notion changelog. Do NOT trigger mid-build for a single story; story states move with the code as part of normal work."
---

# Wrap-up: three surfaces current when work ships

The companion to `kickoff`. Kickoff wrote the engineering docs and the epic before code; wrap-up makes everything true again after the code, and adds the third surface: Notion, where the rest of the team learns what the feature is and how to use it.

House rules on every surface: no em dashes anywhere. Product voice outside `docs/`: no table names, no file paths, no code identifiers.

## Step 1: as-built engineering docs

Docs normally land PR-by-PR (a story is not done until its docs are in the same PR). This step is the catch-anything pass:

1. Diff what the plan said against what was built (read the epic's stories and the merged PRs if needed).
2. Update `docs/<area>/*` to reality; update the decisions log in `00-plan.md` if a decision changed along the way.
3. Update every CLAUDE.md whose rules the work touched (root plus `apps/*/CLAUDE.md`, `packages/*/CLAUDE.md`).
4. Update the `docs/README.md` index for any doc added or renamed.

## Step 2: Shortcut sweep

1. Move any finished-but-unmoved stories to **Done** (`mcp__shortcut__stories-update`); attach missing PR links.
2. Post an epic status comment (`mcp__shortcut__epics-create-comment`). Lead with one plain-language paragraph a stakeholder can read cold: "Members can now ...". Only after that, the detail: merged PRs with story refs, what remains open and who owns it, how to try it (click-test steps).
3. If every story is done, move the epic to **done**; otherwise leave it in progress and make the comment say exactly what is left.

## Step 3: Notion product doc

Target: a sub-page per feature under the **Documentation** page in the **Joice Health** Notion workspace, and nowhere else:
`https://app.notion.com/p/Documentation-3587e3a92b3980328d06cf9a71b0f7d7` (page id `3587e3a92b3980328d06cf9a71b0f7d7`). Never create a different home and never write into another workspace; a Notion authorization is granted per workspace, so a wrong grant silently lands pages in the wrong place.

**Check the connection first.** Fetch the Documentation page by that id before writing anything. If the fetch fails as unauthenticated, or the page cannot be found (the token points at a workspace other than Joice Health): stop this leg, tell the user to re-authenticate the Notion server via `/mcp` in an interactive session and pick **Joice Health** on the authorization screen, and leave a "Notion docs pending" comment on the epic so it is not forgotten. Never fail silently and never fall back to a different location.

1. Open the **Documentation** page by its id (the `Notion:search` and `Notion:create-page` skills wrap the Notion tools). Sub-pages live directly under it, one per feature.
2. Create or update the feature's sub-page:
   - **What it is / Who it's for**: plain language, two or three sentences.
   - **How to use it**: numbered steps a teammate can follow today, in the voice of `docs/onboarding/05-admin-guide.md` (where to click, what they will see, what the words on screen mean). If something needs a flag, a login, or an open service area first, say so as step 1.
   - **How it works**: one simple Mermaid diagram in a code block with language `mermaid` (Notion renders a live preview). Fewer than ten boxes; this is the team's mental model, not the architecture.
   - **Links**: the Shortcut epic, the GitHub-rendered engineering docs.
   - **Changelog**: a table (date, what changed, in plain words). Append a row on every later update; never rewrite history.
3. On later runs (fixes, follow-ups): update the affected sections and append the changelog row; keep the page's URL stable.

## Step 4: report

Tell the user what landed on each surface, with links: docs files touched, the epic comment URL, the Notion page URL (or "pending auth"). Note anything still owed and by whom.
