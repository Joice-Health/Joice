import { NextResponse } from 'next/server';

/**
 * Liveness for the ALB target group (infra/alb.tf points the web health check
 * here). Deliberately checks nothing beyond "the Next server answered": web
 * has no state of its own, and a health check that depends on the api or on a
 * feature flag turns any of those being off into "web is unhealthy, no web
 * deploy can complete" (which is how /waitlist behaved as the check path once
 * the waitlist flag was off). Listed in middleware's PUBLIC_PATHS so the
 * preview gate never redirects it.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
