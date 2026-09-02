import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { TEAM_COOKIE, isValidTeamCookie, siteLaunched } from '@/lib/team-auth';

/**
 * Two gates, one middleware:
 *
 * 1. /admin/* — Clerk. Requires a signed-in user whose publicMetadata role is
 *    `admin` (surfaced via the session-token `metadata` claim). Non-admins are
 *    sent to /waitlist so the admin surface is never revealed.
 * 2. /welcome (member pages) — Clerk, any signed-in user; anonymous visitors go to
 *    our /sign-in with a redirect_url. /sign-up and /sign-in themselves pass
 *    through. All of it sits behind the preview gate below until launch.
 * 3. Everything else — the preview gate: until SITE_LAUNCHED=true, the main
 *    site requires a valid team cookie; anonymous visitors land on /waitlist.
 *    The waitlist itself is a feature flag: when it is off, /waitlist hands
 *    them on to /coming-soon, which is why that path is public too (otherwise
 *    the gate would bounce it back to /waitlist and loop). The flag is read by
 *    the page, not here, so middleware stays free of API calls.
 *
 * If Clerk isn't configured (no publishable key), the site still runs: /admin
 * is simply unreachable and only the preview gate applies.
 */

const isAdminRoute = createRouteMatcher(['/admin(.*)']);
const isAdminSignInRoute = createRouteMatcher(['/admin/sign-in(.*)']);
/** Member pages: any signed-in Clerk user (no role needed). /sign-up and /sign-in pass through. */
const isMemberRoute = createRouteMatcher(['/welcome(.*)']);

// /health is the ALB liveness check (app/health/route.ts): it must answer 200
// with no cookie, so it sits outside the gate.
// / through /checkout are the public storefront (docs/shop/00-plan.md): the
// root is the storefront landing (sc-251; /home 308s to it in next.config.ts)
// and the pages themselves check the `shop` flag, which outranks every other
// flag, redirecting to /waitlist when it is off. '/' matches only exactly
// (nothing starts with '//'), so every other path stays gated. /terms,
// /privacy, /faq and /states are permanent flag-free pages; /states is the
// LegitScript jurisdiction disclosure and must load cold with no credentials
// (sc-275). Note /shop covers /shop/[id] via the prefix match; /products and
// /preview stay gated.
const PUBLIC_PATHS = [
  '/',
  '/waitlist',
  '/coming-soon',
  '/team',
  '/health',
  '/shop',
  '/checkout',
  '/terms',
  '/privacy',
  '/faq',
  '/states',
];

const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

function redirectToWaitlist(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = '/waitlist';
  url.search = '';
  return NextResponse.redirect(url);
}

/** Preview gate for the pre-launch main site. */
async function teamGate(request: NextRequest) {
  if (siteLaunched()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(TEAM_COOKIE)?.value;
  if (await isValidTeamCookie(cookie, process.env.TEAM_PASSWORD)) {
    return NextResponse.next();
  }

  return redirectToWaitlist(request);
}

const withClerk = clerkMiddleware(
  async (auth, request) => {
    if (isAdminRoute(request)) {
      if (isAdminSignInRoute(request)) return NextResponse.next();

      const { userId, sessionClaims, redirectToSignIn } = await auth();
      // returnBackUrl must be relative: the dev server binds 0.0.0.0, so
      // request.url's host is unreliable and an absolute URL causes a
      // sign-in ↔ app redirect loop across origins.
      if (!userId) {
        return redirectToSignIn({
          returnBackUrl: request.nextUrl.pathname + request.nextUrl.search,
        });
      }
      if (sessionClaims?.metadata?.role !== 'admin') {
        return redirectToWaitlist(request);
      }
      return NextResponse.next();
    }

    if (isMemberRoute(request)) {
      // Still behind the team gate before launch, like every site page.
      const gate = await teamGate(request);
      if (gate.headers.get('location')) return gate;
      const { userId } = await auth();
      if (!userId) {
        // Our own sign-in page, relative (see the admin note above), carrying
        // where to come back to.
        const url = request.nextUrl.clone();
        url.pathname = '/sign-in';
        url.search = `?redirect_url=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    }

    return teamGate(request);
  },
  // Use the in-app sign-in page, never the hosted Account Portal.
  { signInUrl: '/admin/sign-in' },
);

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (!clerkConfigured) {
    if (isAdminRoute(request)) return redirectToWaitlist(request);
    // No Clerk, no accounts: member pages fall back to the intake.
    if (isMemberRoute(request)) {
      const url = request.nextUrl.clone();
      url.pathname = '/get-started';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return teamGate(request);
  }
  return withClerk(request, event);
}

export const config = {
  // Everything except Next internals and static assets (files with an extension).
  matcher: ['/((?!_next/|favicon.ico|.*\\..*).*)'],
};
