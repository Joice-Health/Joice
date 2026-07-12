import { NextResponse, type NextRequest } from 'next/server';
import { TEAM_COOKIE, isValidTeamCookie, siteLaunched } from '@/lib/team-auth';

/**
 * Preview gate: the main site (everything outside the public set) requires a
 * valid team cookie until SITE_LAUNCHED=true. Visitors without one are sent to
 * /waitlist — the public never sees a login screen or learns the gate exists.
 */

const PUBLIC_PATHS = ['/waitlist', '/team'];

export async function middleware(request: NextRequest) {
  if (siteLaunched()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(TEAM_COOKIE)?.value;
  if (await isValidTeamCookie(cookie, process.env.TEAM_PASSWORD)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = '/waitlist';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals and static assets (files with an extension).
  matcher: ['/((?!_next/|favicon.ico|.*\\..*).*)'],
};
