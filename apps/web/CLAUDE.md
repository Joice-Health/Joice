# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
directory (`apps/web` — Next.js 16 App Router). Read the root CLAUDE.md first; this adds
web-specific detail.

## Route map & gates

- `/waitlist` — public. Join form + referral confirmation (same route, two views switched by
  the persisted Zustand store). Owns the animated video background (`AmbientBackground`).
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
(which also `@source`'s the ui package for class detection). House style: Yantramanav sans,
Geist Mono for eyebrows/microcopy (`font-mono text-[10px] uppercase tracking-[0.2em]`), soft
drop shadows instead of borders on cards, `rounded-card` radius, `glass` utility for frosted
panels, brand stone palette (no pure black — use `ink`). The warm `card-from/to` gradient is
the membership-card identity — use it sparingly. Buttons: prefer `@joice/ui` `Button`
(`primary` = stone gradient, `glass`/`glassBrand` variants); for link-CTAs, replicate the
same classes on a `Link` (see `app/page.tsx` `ctaDark`).
