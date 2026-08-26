---
name: kickoff
description: "Set up team visibility for a piece of Joice work BEFORE code is written: engineering docs in docs/, a Shortcut epic with product-voiced stories under the Engineering team, everything cross-linked. MANDATORY TRIGGERS: a plan was just approved for feature-sized work; the user says 'kickoff', 'kick off', 'start the feature', 'set up the epic', 'create the stories'. ALSO TRIGGER (small-fix path) when starting a bug fix or tweak that has no Shortcut story yet. Do NOT trigger for research, questions, or conversation with no work starting."
---

# Kickoff: docs and epic before code

Joice work is visible on three surfaces, each with its own audience and voice:

| Surface | Audience | Voice | Written |
|---|---|---|---|
| `docs/` in the repo | engineers | technical: flows, diagrams, file:line refs | at kickoff, kept as-built in every PR |
| Shortcut | product managers and stakeholders | product: outcomes, plain words, no code identifiers | at kickoff, states move with the code |
| Notion "Product Docs" | the whole team | how to use the feature | at wrap-up |

This skill sets up the first two before implementation starts. The companion skill `wrap-up` closes the loop when the work ships. Same facts, three voices; never paste the technical doc into Shortcut or Notion.

House rules on every surface: no em dashes anywhere. In `docs/`: Mermaid for anything with more than two boxes, file:line references where a doc points at code, one "why" paragraph per decision (the style of `docs/rag/*`).

## Step 0: classify the work

- **Feature-sized**: a new capability, a new area, or more than roughly two stories of work. Run the full kickoff (steps 1 to 5).
- **Small fix or tweak**: jump to the small-fix path at the end. No new epic, no new doc set.

When unsure, ask the user which it is.

## Step 1: engineering docs

- **New area**: create `docs/<area>/00-plan.md`, the design brief the epic will point at. Match the shape of `docs/onboarding/00-plan.md`: an HTML comment header (approval date, epic name + URL once step 3 has run, story range, an instruction to keep the decisions log current), then product design, architecture, implementation plan, phases and stories, decisions log.
- **Existing area**: extend the area's doc set instead. Files are `NN-kebab-slug.md`, zero-padded, numbered in reading order; `00-plan.md` is reserved for the approved brief.

## Step 2: the index

Update `docs/README.md`: the area's section gets a `| Doc | What it covers |` table row per new doc (dense one-line summary), and a bold reading-order pointer if the area has more than two docs ("New here? Read 01, then ...").

## Step 3: the Shortcut epic

Resolve the **Engineering** team at runtime with `mcp__shortcut__teams-list` (never hardcode ids), then create the epic with `mcp__shortcut__epics-create` in the team's epic naming style: `Area: short name` (like "Onboarding: intake logic tree").

Epic description template, product voice throughout (a PM must be able to read every word; no table names, no file paths, no code identifiers except in the final links):

1. **What and why**: one paragraph in plain language. What can a visitor, member, or admin do when this ships, and why does it matter to the business.
2. **The flow in words**: a numbered plain-text step list ("1. The visitor opens ... 2. They see ... 3. ..."). Shortcut does not render Mermaid; this list is the diagram's stand-in.
3. **See it visualized**: a link to the GitHub-rendered doc. Derive the URL from `git remote get-url origin`: `https://github.com/<org>/<repo>/blob/<branch>/docs/<area>/<file>.md` (GitHub renders the Mermaid there).
4. **Phases**: plain names with one line each, if the work is phased.
5. **Definition of done**: `bun run check` green, tests for new logic, docs and CLAUDE.md updated in the same PR, PR reviewed, no em dashes in copy, no answer values in analytics.
6. **Open questions**: anything a stakeholder still owes a decision on, addressed to them by name.

## Step 4: the stories

One story per deliverable slice, created with `mcp__shortcut__stories-create` on the epic, team Engineering, state To Do. Phase-prefixed names (`0.1 ...`, `1.2 ...`) when phased. Estimate with the S/M/L meaning from the onboarding brief: S is a day or less, M is 2 to 3 days, L is about a week (the workspace estimate scale is 0/1/2/4/8; use 1 for S, 2 for M, 4 for L).

Story template, product voice:

- **Title**: the outcome, what a person can do afterwards, not the component built. "Visitors can resume an unfinished intake" beats "Session resume endpoint".
- **What**: two or three sentences on what changes for the user or the team.
- **Why it matters**: one sentence.
- **How you'll know it's done**: acceptance a PM can verify by clicking, written as things to try and what they should see.
- **Engineering notes**: one line at most plus the docs link. All technical detail lives in `docs/`, not here.

## Step 5: cross-link and report

- Put the epic URL into the doc's HTML comment header (and the story range once stories exist).
- Confirm the epic description links to the doc (step 3.3).
- Report to the user: epic URL, story list, docs written, and the branch to start on (`<area>/<phase>-<story>-<slug>`, like `onboarding/2-1-member-clerk`).

## Small-fix path

1. Find the epic the fix belongs to with `mcp__shortcut__epics-search`. If none fits, use the standing "Maintenance" epic (create it once if it does not exist: team Engineering, a one-paragraph description saying it collects fixes and tweaks that belong to no feature epic).
2. Add one story there (product voice, same template as step 4), state To Do, and move it along with the work as usual.
3. The affected `docs/*` pages and any relevant CLAUDE.md are updated **in the same PR** as the fix. If the fix changes member-visible or admin-visible behavior, note on the story that the feature's Notion page needs a changelog line at the next `wrap-up`.

## While building (after kickoff, every story)

These are CLAUDE.md rules, restated here because kickoff is where the habit starts:

- Story started (branch created or first commit): move it to **In Progress** and assign it.
- PR opened: attach the PR URL to the story (`mcp__shortcut__stories-add-external-link`) and move it to **In Review**. PR title `[P<phase>] <story#> <Title> (sc-NNN)`.
- PR merged: move the story to **Done**; if scope changed along the way, say so in a story comment.
