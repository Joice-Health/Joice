# The team visibility workflow

How a piece of Joice work stays visible to the whole team, from approved plan to shipped
feature. The rules live in the root `CLAUDE.md` ("Team visibility workflow") and are executed
by two Claude Code skills checked into this repo: `.claude/skills/kickoff/SKILL.md` and
`.claude/skills/wrap-up/SKILL.md`.

**Why:** the engineering detail, the product plan, and the "how do I use this" guide have
three different audiences, and any one artifact written for all three serves none of them.
So the same facts live on three surfaces in three voices, and the workflow makes writing and
updating them a step of the work itself rather than an afterthought.

## The three surfaces

| Surface | Audience | Voice | Written | Kept current by |
|---|---|---|---|---|
| `docs/` (this directory) | engineers | technical: Mermaid flows, file:line refs, "why" paragraphs | at kickoff | every PR (docs in the same PR as code) |
| Shortcut (Engineering team) | PMs and stakeholders | product: outcomes, plain words, no code identifiers | at kickoff | story states move with the code; epic comments at wrap-up |
| Notion ([Documentation page](https://app.notion.com/p/Documentation-3587e3a92b3980328d06cf9a71b0f7d7), Joice Health workspace) | the whole team | instructional: what it is, how to use it | at wrap-up | changelog rows on later wrap-ups |

## The lifecycle

```mermaid
flowchart TD
    plan[Plan approved] --> kickoff[kickoff skill]
    kickoff --> docs["docs/&lt;area&gt;/ brief + README index"]
    kickoff --> epic[Shortcut epic + product-voiced stories]
    docs <-. cross-linked .-> epic
    epic --> build[Build, story by story]
    build --> pr["PR: code + docs + CLAUDE.md together"]
    pr --> states[Story: In Progress, In Review with PR link, Done]
    states --> more{More stories?}
    more -- yes --> build
    more -- no --> wrap[wrap-up skill]
    wrap --> asbuilt[docs/ brought to as-built]
    wrap --> comment[Epic status comment + epic done]
    wrap --> notion[Notion page: what it is, how to use it, changelog]
    wrap --> slack[Slack announcement, handed over ready to paste]
```

Wrap-up also drafts a Slack announcement in the same product voice, formatted for Slack, and
hands it over for a person to post. **Why not a fourth surface:** Slack is where the team
hears the news, not where it lives; the message stays short and links to the Notion page and
the epic instead of duplicating them, so there is nothing in Slack to go stale.

Small fixes skip the epic: one story on the feature's epic (or the standing "Maintenance"
epic), docs updated in the same PR, and a Notion changelog row at the next wrap-up if the fix
changed something the team can see.

## Voice, by example

The same fact on each surface:

- `docs/`: "The engine is pure and lives in core (`packages/core/src/onboarding/engine.ts`);
  the server computes the next step and the browser only renders it, so gates cannot be
  bypassed."
- Shortcut story: "Visitors can't skip past the age and state checks, even with browser
  tricks. How you'll know it's done: open the intake, try to jump ahead via the URL, and
  watch it hold the line."
- Notion: "The intake decides what to ask next on the server, so every visitor sees the right
  questions for their situation and the safety checks always apply."

## Conventions the surfaces share

- Branch `<area>/<phase>-<story>-<slug>`; PR title `[P<phase>] <story#> <Title> (sc-NNN)`;
  commit bodies are prose ending with a story reference line.
- No em dashes anywhere. Mermaid for anything with more than two boxes (GitHub and Notion
  both render it; Shortcut does not, so epics carry a numbered step list plus a link to the
  rendered doc instead).
- `docs/README.md` indexes every doc; a page that is not in the index does not exist.

## Notion access

Product pages live under one page and nowhere else: **Documentation** in the **Joice Health**
workspace (`https://app.notion.com/p/Documentation-3587e3a92b3980328d06cf9a71b0f7d7`).
A Notion authorization is granted per workspace, chosen on the authorization screen, so a
grant to the wrong workspace silently lands pages in the wrong place; wrap-up therefore
fetches the Documentation page by id before writing and stops if it cannot. When the fetch
fails (no auth, or a wrong-workspace token), re-authenticate via `/mcp` in an interactive
Claude Code session and pick Joice Health; until then, wrap-up completes the other surfaces
and leaves a "Notion docs pending" comment on the epic rather than failing silently.
