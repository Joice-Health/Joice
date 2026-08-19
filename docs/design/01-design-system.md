# Joice design system

The system is lifted from the Dinamo Foundry type deck and the "Joice option 5" palette
card, then made to work in Tailwind v4 (`packages/ui/src/theme.css`) and a handful of
primitives (`packages/ui`, `apps/web/components/ui`). This is the reasoning behind the
tokens; the tokens themselves are the source of truth.

## Colour

| Token | Value | Role |
| --- | --- | --- |
| `canvas` | #F5F0E9 | The paper. Every page is cream. |
| `surface` | #FFFFFF | Panels and fields sitting on the paper. |
| `ink` | #4D4F3F | Text, and the dark band. Never pure black. 7.4:1 on cream. |
| `stone` | #ABA8A0 | Fills, rules, disabled. 2.1:1 on cream: never text. |
| `line` | = stone | Hairlines. |
| `muted` | oklch(0.52 0.02 105) | Secondary text, 4.8:1 on cream. |
| `brand-600` | #877C00 | The olive. 3.8:1 on cream: an accent, not a text colour. |
| `brand-700` | oklch(0.51 0.11 103) | The smallest olive that may carry small text (5:1). |
| `card-from/to` | gold | Membership card only. |

The deck uses the olive once, as a stripe across the top of the phone. Keep it that rare:
the announcement bar, focus rings, the companion's dot, hover colour on titles. Everything
else is cream, ink, stone and white.

## Type

Three faces from Dinamo, Light only (the cuts we license), served with `next/font/local`.

| Role | Face | Case | Tracking | Utility |
| --- | --- | --- | --- | --- |
| Text | ABC Ginto Light | Sentence | +1% | default (`font-sans`) |
| Display | ABC Ginto Nord Condensed Light | UPPER | +3% | `display` |
| Label | ABC Gaisyr Mono Light | UPPER | +5% | `mono-label` |

The specimen tells you the role by its content. Ginto: "GLP-1 / Tesamorelin / Tirzepatide
2.5mg", so product names, sentences, and body. Nord Condensed: "WEIGHT LOSS / MUSCLE
GROWTH / (99% PURITY)", so care areas, benefits, page titles, closing statements. Gaisyr:
"SMALL-DOSE / BPC-157 / PRESERVING", so labels, nav, buttons, indices, the wordmark.

Because only Light ships, `html { font-synthesis: none }` stops the browser faking bold and
oblique. Emphasis comes from size, case, or a bracket, never weight.

## Devices

- **Brackets** mark a variable inside the system: the person (`[ you ]`), a place in a real
  sequence (`[ 01 ]`), an action (`[ get started ]`). `Bracket` and `Index` in `@joice/ui`
  render them as real characters, so they read, copy and speak as text. Inside an uppercase
  label, `[ you ]` stays lowercase: that is the human voice inside the technical one.
- **The button** is a dotted-outline pill with a mono label, drawn in `currentColor` so it
  works in ink on cream and in white on a photo or the dark band. Forward actions end in
  ` +` (`LET'S BEGIN +`, `LEARN +`). Dotted means "press me"; fields use a solid hairline,
  which means "type here". One `solid` (ink) button per page at most, for the commit action.
- **Structure** is hairlines and open lists. A section starts with a `border-t border-line`;
  a list is `border-t` with `border-b` rows. Cards, shadows and glass are gone from the main
  site; `glass` survives only on the waitlist, over the water.
- **Image panels** take soft top corners (`rounded-t-card`, 2rem) and carry white mono on
  them. Until photography lands, `ImageSlot` draws the organic green field from the deck.
- **The dark band** (`bg-ink`, full-bleed) is the one place a page goes dark: Values.

## What is placeholder

Photography (`public/hero.jpg`, `public/areas/<slug>.jpg`, `public/products/<slug>.jpg`),
the logo mark from the deck (the wordmark is set in Gaisyr Mono for now), and the copy,
which is still pre content pass.
