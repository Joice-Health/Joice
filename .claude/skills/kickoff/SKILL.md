---
name: kickoff
description: "Set up team visibility for a piece of Joice work BEFORE code is written: engineering docs in docs/, a Linear project with product-voiced issues under the Engineering team, everything cross-linked. MANDATORY TRIGGERS: a plan was just approved for feature-sized work; the user says 'kickoff', 'kick off', 'start the feature', 'set up the project', 'create the issues'. ALSO TRIGGER (small-fix path) when starting a bug fix or tweak that has no Linear issue yet. Do NOT trigger for research, questions, or conversation with no work starting."
---

# Kickoff: docs and project before code

Joice work is visible on three surfaces, each with its own audience and voice:

| Surface | Audience | Voice | Written |
|---|---|---|---|
| `docs/` in the repo | engineers | technical: flows, diagrams, file:line refs | at kickoff, kept as-built in every PR |
| Linear | product managers and stakeholders | product: outcomes, plain words, no code identifiers | at kickoff, issue states move with the code |
| Notion "Documentation" page (Joice Health workspace) | the whole team | how to use the feature | at wrap-up |

This skill sets up the first two before implementation starts. The companion skill `wrap-up` closes the loop when the work ships. Same facts, three voices; never paste the technical doc into Linear or Notion.

House rules on every surface: no em dashes anywhere. In `docs/`: Mermaid for anything with more than two boxes, file:line references where a doc points at code, one "why" paragraph per decision (the style of `docs/rag/*`).

## Step 0: classify the work

- **Feature-sized**: a new capability, a new area, or more than roughly two issues of work. Run the full kickoff (steps 1 to 5).
- **Small fix or tweak**: jump to the small-fix path at the end. No new project, no new doc set.

When unsure, ask the user which it is.

## Step 1: engineering docs

- **New area**: create `docs/<area>/00-plan.md`, the design brief the project will point at. Match the shape of `docs/onboarding/00-plan.md`: an HTML comment header (approval date, project name + URL once step 3 has run, issue range, an instruction to keep the decisions log current), then product design, architecture, implementation plan, phases and issues, decisions log.
- **Existing area**: extend the area's doc set instead. Files are `NN-kebab-slug.md`, zero-padded, numbered in reading order; `00-plan.md` is reserved for the approved brief.

## Step 2: the index

Update `docs/README.md`: the area's section gets a `| Doc | What it covers |` table row per new doc (dense one-line summary), and a bold reading-order pointer if the area has more than two docs ("New here? Read 01, then ...").

## Step 3: the Linear project

Load the Linear MCP tools via ToolSearch (the server is `linear` in the repo's `.mcp.json`; tool names are not pinned here on purpose, find the team/project/issue tools by search). Resolve the **Engineering** team at runtime (never hardcode ids), then create the project in the established naming style: `Area: short name` (like "Onboarding: intake logic tree"), under the Engineering team.

Project description template, product voice throughout (a PM must be able to read every word; no table names, no file paths, no code identifiers except in the final links):

1. **What and why**: one paragraph in plain language. What can a visitor, member, or admin do when this ships, and why does it matter to the business.
2. **The flow in words**: a numbered plain-text step list ("1. The visitor opens ... 2. They see ... 3. ..."). It reads in any tool; the diagram lives behind the next link.
3. **See it visualized**: a link to the GitHub-rendered doc. Derive the URL from `git remote get-url origin`: `https://github.com/<org>/<repo>/blob/<branch>/docs/<area>/<file>.md` (GitHub renders the Mermaid there).
4. **Phases**: plain names with one line each, if the work is phased.
5. **Definition of done**: `bun run check` green, tests for new logic, docs and CLAUDE.md updated in the same PR, PR reviewed, no em dashes in copy, no answer values in analytics.
6. **Open questions**: anything a stakeholder still owes a decision on, addressed to them by name.

## Step 4: the issues

One issue per deliverable slice, created on the project, team Engineering, state Todo/To Do (resolve state names at runtime, the workspace was imported from Shortcut with its state names). Phase-prefixed titles (`0.1 ...`, `1.2 ...`) when phased. Sizing keeps the S/M/L meaning from the onboarding brief: S is a day or less, M is 2 to 3 days, L is about a week; set Linear estimates only if the team has estimates enabled (check at runtime, otherwise skip).

Issue template, product voice:

- **Title**: the outcome, what a person can do afterwards, not the component built. "Visitors can resume an unfinished intake" beats "Session resume endpoint".
- **What**: two or three sentences on what changes for the user or the team.
- **Why it matters**: one sentence.
- **How you'll know it's done**: acceptance a PM can verify by clicking, written as things to try and what they should see.
- **Engineering notes**: one line at most plus the docs link. All technical detail lives in `docs/`, not here.

## Step 5: cross-link and report

- Put the project URL into the doc's HTML comment header (and the issue range, like ENG-301 to ENG-312, once issues exist).
- Confirm the project description links to the doc (step 3.3).
- Report to the user: project URL, issue list, docs written, and the branch to start on (`<area>/<issue-id>-<slug>` with the id lowercased, like `onboarding/eng-301-member-clerk`).

## Small-fix path

1. Find the project the fix belongs to (list or search projects). If none fits, use the standing "Maintenance" project. It was imported from Shortcut; find it, never create a duplicate.
2. Add one issue there (product voice, same template as step 4), state Todo, and move it along with the work as usual.
3. The affected `docs/*` pages and any relevant CLAUDE.md are updated **in the same PR** as the fix. If the fix changes member-visible or admin-visible behavior, note on the issue that the feature's Notion page needs a changelog line at the next `wrap-up`.

## While building (after kickoff, every issue)

These are CLAUDE.md rules, restated here because kickoff is where the habit starts:

- The branch name carries the issue id (`<area>/eng-NNN-<slug>`) and the PR title ends with it (`[P<phase>] <phase.issue> <Title> (ENG-NNN)`). With Linear's GitHub integration enabled, that alone moves the issue: In Progress when the branch gets commits, In Review when the PR opens (with the PR linked), Done on merge.
- Fallback, when the integration has not caught something: move the issue yourself via the Linear MCP. Starting work also means assigning the issue.
- If scope changed along the way, say so in an issue comment; the state moves never carry the story.
