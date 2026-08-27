# Notion backfill (temporary staging)

One-time source for the product pages that belong under the **Documentation** page in the
**Joice Health** Notion workspace
(`https://app.notion.com/p/Documentation-3587e3a92b3980328d06cf9a71b0f7d7`). Written
2026-08-27 because the Notion connection was authorized against the wrong workspace when the
first wrap-up ran; the content was prepared here so it survives until the connection is
re-authorized.

**To publish** (any Claude Code session once Notion auth points at Joice Health): fetch the
Documentation page by id `3587e3a92b3980328d06cf9a71b0f7d7`, put the content of
`_documentation-intro.md` on the page itself, create one sub-page per remaining file (page
title = the H1), converting headings, tables, and `mermaid` code blocks as is. Then **delete
this directory**; the Notion pages become the live copy and the wrap-up skill maintains them.

Deliberately not indexed in `docs/README.md`: this is staging, not documentation.

| File | Notion page |
|---|---|
| `_documentation-intro.md` | Content of the Documentation page itself |
| `ask-joice.md` | Ask Joice chatbot |
| `eval-console.md` | Chatbot eval console |
| `get-started-intake.md` | Get Started intake |
| `waitlist-klaviyo.md` | Waitlist marketing sync |
| `design-system.md` | Design system |
| `deploys.md` | How the site deploys |
| `team-visibility.md` | How work stays visible |
