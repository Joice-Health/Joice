# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
directory (`apps/web` — Next.js 16 App Router). Read the root CLAUDE.md first; this adds
web-specific detail.

## Route map & gates

- `/waitlist` — public. Join form + referral confirmation (same route, two views switched by
  the persisted Zustand store). Shows the animated water background (`AmbientBackground`),
  shared with `/coming-soon`.
  The whole thing sits behind the `waitlist` feature flag (seeded by migration, toggled in
  `/admin/flags`). Flag off: the page and the public `/api/waitlist*` endpoints close, and the
  page redirects to `/coming-soon`.
- `/coming-soon`: public. The bare "Something special is coming." page shown while the waitlist
  flag is off; redirects back to `/waitlist` once it is on. Must stay in `PUBLIC_PATHS` or the
  preview gate bounces it to `/waitlist` and loops.
- `/home`, `/shop`, `/shop/[id]`, `/checkout` — public, the certification storefront
  (`app/(shop)/`, docs: `docs/shop/00-plan.md`). Every page opens with
  `requireShopEnabled()` (`lib/shop-gate.ts`): the `shop` flag off redirects to `/waitlist`.
  Products and carts come live from the CarePortals Public API via `lib/careportals/`
  (`products.server.ts` is server-only; `cart.client.ts` is browser-only, cart id in
  localStorage); the curated shelf is the `SHOP_PRODUCT_IDS` const in `lib/shop-products.ts`
  (Glutathione only for the certification). Glutathione has a bespoke page at
  `/shop/glutathione` (static segment beats `[id]`; copy is the approved spec of record,
  its Add to cart button puts the product in the cart and lands on /checkout, and the hero price
  is live from CarePortals). Checkout hands off to the hosted portal
  (care.joicehealth.com); no payment code here.
  Line quantities are pinned to 1 by CarePortals for subscription products, so the cart UI
  offers Remove, never a stepper. `/products` (gated site PDP) is deliberately not reused.
- `/terms`, `/privacy`, `/faq` — public, permanent, flag-free (`app/(legal)/`, minimal
  chrome). Placeholder copy until the approved content lands; they move under the main-site
  shell at launch.
- `/` and future site pages — final URLs, gated by `middleware.ts` until `SITE_LAUNCHED=true`;
  anonymous → redirected to `/waitlist` (public must never see a login).
- `/get-started`: the intake flow. The server component reads the `onboarding` flag
  (`flagEnabled`): on, it mounts `components/onboarding/flow.tsx` (the server-driven step
  runner over the `@joice/api-client` intake hooks); off, the companion lead summary. The runner
  also falls back when the API answers 404 (flag flipped mid-session). Behind the team gate until
  launch like every site page. Design and rules: `docs/onboarding/00-plan.md`,
  `docs/onboarding/01-overview.md`.
- `/sign-up`, `/sign-in`, `/welcome`: the member tree (`(member)` route group with its own
  ClerkProvider; the api client carries the member token). `/welcome` claims the intake and
  the companion lead on first render and shows the profile; middleware requires a session for
  it and no-Clerk builds redirect member pages to `/get-started`. See
  `docs/onboarding/04-sessions-and-registration.md`.
- `/team` — team password login; sets the HMAC cookie from `lib/team-auth.ts`.
- `/admin/*` — Clerk-gated dashboard (`admin/(dashboard)/` route group); sign-in at
  `/admin/sign-in` (in-app page, not Clerk's hosted portal). Non-admin users are bounced to
  `/waitlist`, same as anonymous. The eval console lives at `/admin/eval`
  (+ `/admin/eval/[id]`) over the brain-service admin hooks in
  `@joice/api-client` (`useEvalRuns`, `useEvalRun` with its scoped 2s poll,
  `useStartEvalRun`, case CRUD); `AdminProviders` passes `brainBaseUrl` so those
  hooks reach the brain in bare-host dev. The onboarding surface lives at `/admin/onboarding/*`
  (hub, flow editor, simulator, versions, service areas, funnel, requests) over the
  `@joice/api-client` admin onboarding hooks; the editor edits drafts only and the inline help
  must keep saying what `docs/onboarding/05-admin-guide.md` says.

`middleware.ts` composes both gates and has a no-Clerk fallback: without
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` at build time, `/admin` is unreachable by design — if
admin "redirects to waitlist" in prod, the key was missing from the image build (rebuild via
the deploy workflow; setting task env does nothing for `NEXT_PUBLIC_*`).

## Patterns to follow

- **Data**: import hooks from `@joice/api-client` (`useJoinWaitlist`, `useWaitlistStats`,
  admin hooks, the intake hooks `useOnboardingSession` / `useAnswerQuestion` / `useSkipQuestion` /
  `useGoBack` / `useRestartOnboarding` / `useSubmitNotify`). Never `fetch` the API by hand: the
  Hono RPC client is fully typed. The api client sends `credentials: 'include'` because the
  intake session is an httpOnly cookie; the api's CORS allows it.
- **The intake runner** (`components/onboarding/`): the server decides the next step, the
  runner renders it. Every question is a `fieldset` whose legend takes focus; pills are real
  radios/checkboxes; Continue is the one solid action; a required boolean is a checkbox that
  must be ticked. What the companion knew arrives as a prefilled value marked "carried over",
  never applied silently. Gate screens never dead-end. Analytics events are `onboarding_*`
  with question keys and outcomes only: never a value, a name, an email or a state code
  (`lib/analytics.ts`).
- **Feature flags in server components**: `flagEnabled(FLAG_KEYS.x)` from `lib/flags.ts` (keys
  in `@joice/core/schemas`). It keeps its own ~30s process cache and bypasses Next's fetch data
  cache on purpose: under `next dev`/Bun that cache served a stale flag map indefinitely.
  Client components use `usePublicFlags()`.
- **Validation**: import Zod schemas from `@joice/core/schemas` (subpath!) — the `@joice/core`
  barrel drags the Postgres driver into the client bundle and breaks the build.
- **Redirects in route handlers**: use relative `Location` headers
  (`new NextResponse(null, { status: 303, headers: { Location: '/x' } })`) — the server binds
  0.0.0.0, so `request.url`-based absolute redirects produce wrong hosts behind CloudFront.
- **Persisted-store hydration**: render the logged-out/new-user view on the server and first
  client render, then swap after `useEffect` mount (see `waitlist-experience.tsx`) — keeps SSR
  content and avoids hydration mismatch.
- **searchParams** is a Promise in Next 16 server pages: `const { ref } = await searchParams`.
- `?reset` on `/waitlist` clears the persisted card (dev/testing helper).

## Styling

Tailwind v4, CSS-first: tokens in `packages/ui/src/theme.css`, imported via `globals.css`
(which also `@source`'s the ui package for class detection). The system is described in the
root CLAUDE.md and `docs/design/01-design-system.md`. In practice:

- Labels: `<Eyebrow>` (mono uppercase, ink) or the `mono-label` utility on a span/link. Big
  uppercase statements: the `display` utility. Body: nothing, the body face is the default.
- Buttons and link-CTAs: `@joice/ui` `Button` and `components/ui/cta-link.tsx` share
  `buttonClasses()`; `outline` (default, dotted pill), `solid` (the one strong action, e.g. a
  form submit), `stone`, `ghost`. Forward actions end in ` +`. Never write button classes by
  hand.
- Structure: hairline `border-t border-line` sections and `border-b border-line` list rows
  (`ProductRow`, `ArticleRow`), not cards. Photos go through `ImageSlot` so a missing file
  shows the designed slot. Full-bleed bands (`components/home/values.tsx`) use the `w-screen`
  trick; `body` has `overflow-x: clip` for that.
- Fonts are `next/font/local` in `app/layout.tsx`; only Light cuts exist, and `html` has
  `font-synthesis: none`, so weight classes are inert on purpose.
- The nav (`components/layout/site-nav.tsx`) is full-width, sticky and frosted with no rule
  under it; page-level CSS that is not a token (the Ask microphone, the organic image field)
  lives in `app/globals.css`.
