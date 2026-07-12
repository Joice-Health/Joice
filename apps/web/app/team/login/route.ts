import { NextResponse, type NextRequest } from 'next/server';
import { TEAM_COOKIE, TEAM_COOKIE_MAX_AGE, expectedCookieValue } from '@/lib/team-auth';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = form.get('password');
  const expected = process.env.TEAM_PASSWORD;

  // Relative Location headers survive any proxy chain (CloudFront/ALB) without
  // reconstructing scheme/host from the server binding.
  if (!expected || typeof password !== 'string' || password !== expected) {
    return new NextResponse(null, { status: 303, headers: { Location: '/team?error=1' } });
  }

  const response = new NextResponse(null, { status: 303, headers: { Location: '/' } });
  response.cookies.set({
    name: TEAM_COOKIE,
    value: await expectedCookieValue(expected),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TEAM_COOKIE_MAX_AGE,
  });
  return response;
}
