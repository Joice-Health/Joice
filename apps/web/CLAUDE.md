# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
directory (`apps/web` — Next.js 16 App Router). Read the root CLAUDE.md first; this adds
web-specific detail.

## Route map & gates

- `/waitlist` — public. Join form + referral confirmation (same route, two views switched by
  the persisted Zustand store). Owns the animated video background (`AmbientBackground`).
  The whole thing sits behind the `waitlist` feature flag (seeded by migration, toggled in
  `/admin/flags`). Flag off: the page and the public `/api/waitlist*` endpoints close, and the
  page redirects to `/coming-soon`.
- `/coming-soon`: public. The bare "Something special is coming." page shown while the waitlist
  flag is off; redirects back to `/waitlist` once it is on. Must stay in `PUBLIC_PATHS` or the
  preview gate bounces it to `/waitlist` and loops.
- `/` and future site pages — final URLs, gated by `middleware.ts` until `SITE_LAUNCHED=true`;
  anonymous → redirected to `/waitlist` (public must never see a login).
- `/team` — team password login; sets the HMAC cookie from `lib/team-auth.ts`.
- `/admin/*` — Clerk-gated dashboard (`admin/(dashboard)/` route group); sign-in at
  `/admin/sign-in` (in-app page, not Clerk's hosted portal). Non-admin users are bounced to
  `/waitlist`, same as anonymous.

`middleware.ts` composes both gates and has a no-Clerk fallback: without
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` at build time, `/admin` is unreachable by design — if
admin "redirects to waitlist" in prod, the key was missing from the image build (rebuild via
the deploy workflow; setting task env does nothing for `NEXT_PUBLIC_*`).

## Patterns to follow

- **Data**: import hooks from `@joice/api-client` (`useJoinWaitlist`, `useWaitlistStats`,
  admin hooks). Never `fetch` the API by hand — the Hono RPC client is fully typed.
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
