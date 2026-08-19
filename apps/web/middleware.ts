import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { TEAM_COOKIE, isValidTeamCookie, siteLaunched } from '@/lib/team-auth';

/**
 * Two gates, one middleware:
 *
 * 1. /admin/* — Clerk. Requires a signed-in user whose publicMetadata role is
 *    `admin` (surfaced via the session-token `metadata` claim). Non-admins are
 *    sent to /waitlist so the admin surface is never revealed.
 * 2. Everything else — the preview gate: until SITE_LAUNCHED=true, the main
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

// /health is the ALB liveness check (app/health/route.ts): it must answer 200
// with no cookie, so it sits outside the gate.
const PUBLIC_PATHS = ['/waitlist', '/coming-soon', '/team', '/health'];

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

    return teamGate(request);
  },
  // Use the in-app sign-in page, never the hosted Account Portal.
  { signInUrl: '/admin/sign-in' },
);

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (!clerkConfigured) {
    if (isAdminRoute(request)) return redirectToWaitlist(request);
    return teamGate(request);
  }
  return withClerk(request, event);
}

export const config = {
  // Everything except Next internals and static assets (files with an extension).
  matcher: ['/((?!_next/|favicon.ico|.*\\..*).*)'],
};
