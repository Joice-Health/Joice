# 05. The admin guide: running the intake without an engineer

For whoever operates `/admin/onboarding`. Everything here is a browser task;
nothing needs a deploy. The one hard rule: **you edit drafts and publish;
published versions are frozen.** A visitor mid-intake keeps the logic they
started with; only pure copy changes reach them silently.

## The pages

| Page | What you do there |
|---|---|
| Onboarding (the hub) | See what is live, what is drafted, how many states are open |
| Flow | Edit the questions: wording, options, order, branching. Save shows the report; Publish ships it |
| Simulator | Answer as a pretend visitor and watch exactly what they would see, and why |
| Versions | The history; roll back to an earlier version (a pointer move) |
| Service areas | Open a state, set it to "tell me when", or close it; set the minimum age |
| Funnel | Where people drop, per question, per version |
| Requests | Who asked to hear when their state opens |

## Change wording (the most common task)

1. Flow → if there is no draft, "Make a draft +" (it copies what is live).
2. Click the question on the left; edit the Question and Help text fields.
3. Save draft → the report should say "Validates clean".
4. Publish + → done. A copy-only change reaches visitors mid-intake too.

## Add a question

1. In a section that is not locked, "Add a question +".
2. Write the wording; pick the Type (choice pills, text, number, date...).
3. Pick the trait it writes. Use a registered trait when one fits; otherwise
   the `custom.your_key` field appears; name it in snake_case. Custom traits
   are always marketing tier.
4. For choice questions, add options: `value` is the stored token (stable,
   snake_case-ish), `Label` is what the visitor reads. Traits with a fixed
   vocabulary list the allowed values above the options.
5. "Show this question when" if it should branch: rows of trait / operator /
   value, joined by ALL or ANY.
6. Save, read the report, simulate, publish.

## What the badges and locks mean

- **locked** on a section or question (eligibility, consent terms): the
  wording is yours; the structure is not. Publishing refuses a flow that
  removes the state or date-of-birth questions, the age or state gates, or
  the required terms consent.
- **marketing / personal / health** on a question: the sensitivity tier of
  the trait it writes. **health** means "Medical question. Publishing is
  locked until the Before-PHI checklist is complete and both PHI keys are
  on" — you can draft it, never publish it, until engineering turns the key.
- **health locked / health unlocked** in the editor header: the state of the
  two PHI keys, straight from the server. Locked names which half is off —
  the infrastructure key (`PHI_READY`, set by engineering, never a toggle
  here) and the `onboarding_health` flag (Flags page). Both on turns the
  badge green and a published flow may ask health questions; each still
  carries a PHI warning in the report.
- **optional**: the visitor gets "Skip for now".

## Gates are not copy

The under-18 stop and the state gates live in the flow, but what they *do*
is decided elsewhere on purpose: **Service areas** owns which states are
open and the minimum age, each change confirmed and separately audited.
Remember what the page says: self-reported state is a courtesy filter;
enforcement happens again at prescribing and shipping.

## Before you publish

Run the **Simulator** with at least three personas: your target visitor in
an open state; someone in a "tell me when" state; a 17-year-old. The path
table is exactly what they would see; expand a "why" row when something
surprises you. Publishing refuses with the report when something is broken;
each line names the problem and where it is.

## If something goes wrong after publishing

Versions → Roll back on the previous version. New sessions pick it up
immediately; nobody mid-intake is disturbed. Rollback is audited, like every
publish, gate change and age change (Audit log page, actions
`onboarding.publish`, `onboarding.rollback`, `service_area.update`,
`onboarding.settings`).

## What you cannot do here (by design)

Ask a health question before the PHI keys (engineering + the checklist);
change what a locked section asks; edit a published version in place; see a
visitor's answers in the funnel (it counts steps, never values); subscribe a
notify-me email to marketing (they asked about their state, not for email).
