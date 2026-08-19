import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { createRequireMember, emailOf, type ClerkUserLike, type MemberEnv } from './auth';

// @hono/clerk-auth's getAuth calls c.get('clerkAuth')(); we set that the way
// clerkMiddleware would after verifying a token.
function appWith(auth: { userId: string; sessionClaims?: Record<string, unknown> } | null, deps: Parameters<typeof createRequireMember>[0]) {
  const authObject = auth ? { ...auth, sessionClaims: auth.sessionClaims ?? {} } : { userId: null };
  return new Hono<MemberEnv>()
    .use('*', async (c, next) => {
      c.set('clerkAuth' as never, (() => authObject) as never);
      await next();
    })
    .use('*', createRequireMember(deps))
    .get('/me', (c) => c.json({ memberId: c.get('memberId'), email: c.get('memberEmail'), verified: c.get('memberEmailVerified'), first: c.get('memberFirstName') }));
}

const clerkUser: ClerkUserLike = {
  id: 'user_1',
  firstName: 'Sam',
  lastName: 'Lee',
  primaryEmailAddress: { emailAddress: 'Sam@Example.com', verification: { status: 'verified' } },
  emailAddresses: [{ emailAddress: 'Sam@Example.com', verification: { status: 'verified' } }],
  publicMetadata: { role: 'admin' },
};

function deps(opts: { existing?: { id: string; email: string; firstName: string | null }; user?: ClerkUserLike } = {}) {
  const calls = { upserts: [] as unknown[], stamps: [] as unknown[], lookups: 0 };
  const d = {
    users: {
      async getByClerkId() {
        return opts.existing;
      },
      async upsertFromClerk(input: { clerkUserId: string; email: string }) {
        calls.upserts.push(input);
        return { id: 'mem-new', email: input.email, firstName: 'Sam' };
      },
    },
    clerk: {
      async getUser() {
        calls.lookups += 1;
        return opts.user ?? clerkUser;
      },
      async updateUserMetadata(id: string, input: { publicMetadata: Record<string, unknown> }) {
        calls.stamps.push({ id, ...input });
      },
    },
    log: () => {},
  };
  return { d, calls };
}

describe('requireMember', () => {
  test('401 without a session', async () => {
    const { d } = deps();
    const res = await appWith(null, d).request('/me');
    expect(res.status).toBe(401);
  });

  test('the metadata claim wins: no db, no stamp', async () => {
    const { d, calls } = deps();
    const res = await appWith({ userId: 'user_1', sessionClaims: { metadata: { memberId: 'mem-claim' } } }, d).request('/me');
    expect(await res.json()).toEqual({ memberId: 'mem-claim', email: 'sam@example.com', verified: true, first: 'Sam' });
    expect(calls.upserts).toEqual([]);
    expect(calls.stamps).toEqual([]);
  });

  test('an existing row is found by Clerk id and the metadata is stamped once', async () => {
    const { d, calls } = deps({ existing: { id: 'mem-row', email: 'sam@example.com', firstName: 'Samantha' } });
    const res = await appWith({ userId: 'user_1' }, d).request('/me');
    expect(await res.json()).toMatchObject({ memberId: 'mem-row', first: 'Samantha' });
    expect(calls.upserts).toEqual([]);
    expect(calls.stamps).toEqual([{ id: 'user_1', publicMetadata: { role: 'admin', memberId: 'mem-row' } }]);
  });

  test('the first call after sign-up creates the member and stamps the id, keeping the role', async () => {
    const { d, calls } = deps();
    const res = await appWith({ userId: 'user_1' }, d).request('/me');
    expect(await res.json()).toMatchObject({ memberId: 'mem-new', email: 'sam@example.com', verified: true });
    expect(calls.upserts).toEqual([{ clerkUserId: 'user_1', email: 'sam@example.com', firstName: 'Sam', lastName: 'Lee' }]);
    expect(calls.stamps).toEqual([{ id: 'user_1', publicMetadata: { role: 'admin', memberId: 'mem-new' } }]);
  });

  test('an unverified email is reported as such; no email is 403', async () => {
    const unverified = { ...clerkUser, primaryEmailAddress: { emailAddress: 'x@example.com', verification: { status: 'unverified' } } };
    const { d } = deps({ user: unverified });
    const res = await appWith({ userId: 'user_1' }, d).request('/me');
    expect(await res.json()).toMatchObject({ verified: false });
    const { d: d2 } = deps({ user: { ...clerkUser, primaryEmailAddress: null, emailAddresses: [] } });
    expect((await appWith({ userId: 'user_1' }, d2).request('/me')).status).toBe(403);
  });

  test('emailOf lowercases and prefers the primary address', () => {
    expect(emailOf(clerkUser)).toEqual({ email: 'sam@example.com', verified: true });
  });
});
