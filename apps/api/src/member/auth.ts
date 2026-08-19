import type { MiddlewareHandler } from 'hono';
import { getAuth } from '@hono/clerk-auth';

/**
 * Member identity for the api: any signed-in Clerk user (no role needed).
 *
 * There is deliberately no Clerk webhook. The member's `users` row is created
 * here, on the first authenticated call after sign-up (the web makes that call
 * from the sign-up response: claim, or the profile read), from the verified
 * token plus one Clerk backend lookup for the primary email and names. We then
 * stamp our `users.id` into Clerk's `publicMetadata.memberId`: the session
 * token's `metadata` claim already forwards publicMetadata, so every later
 * request (here and on the brain) reads the member id without a round trip,
 * and `brain_profiles.member_id` (a uuid) gets the right value to claim with.
 *
 * Resolution order: the `metadata.memberId` claim, else the `users` row by
 * Clerk id, else create it. Idempotent: the stamp happens once.
 */

export interface MemberVariables {
  /** Our users.id, the member identifier across services. */
  memberId: string;
  memberClerkUserId: string;
  memberEmail: string | null;
  memberEmailVerified: boolean;
  memberFirstName: string | null;
}

export type MemberEnv = { Variables: MemberVariables };

interface MemberClaims {
  metadata?: { memberId?: string; role?: string };
  email?: string;
}

/** The slice of Clerk's user object we need to create the record. */
export interface ClerkUserLike {
  id: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmailAddress: { emailAddress: string; verification: { status: string | null } | null } | null;
  emailAddresses: Array<{ emailAddress: string; verification: { status: string | null } | null }>;
  publicMetadata: Record<string, unknown>;
}

export interface RequireMemberDeps {
  users: {
    getByClerkId(clerkUserId: string): Promise<{ id: string; email: string; firstName: string | null } | undefined>;
    upsertFromClerk(input: {
      clerkUserId: string;
      email: string;
      firstName?: string | null;
      lastName?: string | null;
    }): Promise<{ id: string; email: string; firstName: string | null }>;
  };
  clerk: {
    getUser(clerkUserId: string): Promise<ClerkUserLike>;
    updateUserMetadata(clerkUserId: string, input: { publicMetadata: Record<string, unknown> }): Promise<unknown>;
  };
  log?: (message: string) => void;
}

/** The member's primary email and whether Clerk has verified it. */
export function emailOf(user: ClerkUserLike): { email: string; verified: boolean } | null {
  const primary = user.primaryEmailAddress ?? user.emailAddresses[0] ?? null;
  if (!primary) return null;
  return { email: primary.emailAddress.toLowerCase(), verified: primary.verification?.status === 'verified' };
}

export function createRequireMember(deps: RequireMemberDeps): MiddlewareHandler<MemberEnv> {
  const log = deps.log ?? ((m: string) => console.log(m));
  return async (c, next) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: 'Sign in to continue' }, 401);
    const claims = (auth.sessionClaims ?? {}) as MemberClaims;
    const clerkUserId = auth.userId;

    // Verification status is not in the token, so every path does one Clerk
    // lookup; cheap, and it is the source of truth for "verified".
    let clerkUser: ClerkUserLike;
    try {
      clerkUser = await deps.clerk.getUser(clerkUserId);
    } catch (err) {
      log(`[member] Clerk lookup failed for ${clerkUserId}: ${String(err)}`);
      return c.json({ error: 'Could not verify your account. Please try again.' }, 503);
    }
    const identity = emailOf(clerkUser);
    if (!identity) return c.json({ error: 'Your account has no email address' }, 403);

    let memberId = claims.metadata?.memberId;
    let firstName: string | null = clerkUser.firstName;
    if (!memberId) {
      const existing = await deps.users.getByClerkId(clerkUserId);
      if (existing) {
        memberId = existing.id;
        firstName = existing.firstName ?? firstName;
      } else {
        // First authenticated call after sign-up: this is where the member is born.
        const created = await deps.users.upsertFromClerk({
          clerkUserId,
          email: identity.email,
          firstName: clerkUser.firstName,
          lastName: clerkUser.lastName,
        });
        memberId = created.id;
      }
      if (clerkUser.publicMetadata.memberId !== memberId) {
        await deps.clerk.updateUserMetadata(clerkUserId, {
          publicMetadata: { ...clerkUser.publicMetadata, memberId },
        });
      }
    }

    c.set('memberId', memberId);
    c.set('memberClerkUserId', clerkUserId);
    c.set('memberEmail', identity.email);
    c.set('memberEmailVerified', identity.verified);
    c.set('memberFirstName', firstName);
    return next();
  };
}
