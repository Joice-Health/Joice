import { describe, expect, test } from 'bun:test';
import type { AttentiveClient } from '@joice/marketing';
import { createAttentiveMarketingAdapter } from './attentive-adapter';
import type { WaitlistMarketingProfile } from './port';

/**
 * The adapter is where the waitlist's field names meet Attentive's. These
 * tests pin the call order, the exact attribute map, the dedupe ids and the
 * event times: the things a journey in Attentive silently depends on.
 */

function fakeClient() {
  const calls: Array<{ method: keyof AttentiveClient; args: unknown[] }> = [];
  const client: AttentiveClient = {
    async upsertProfile(...args) {
      calls.push({ method: 'upsertProfile', args });
    },
    async subscribe(...args) {
      calls.push({ method: 'subscribe', args });
    },
    async trackEvent(...args) {
      calls.push({ method: 'trackEvent', args });
    },
    async unsubscribe(...args) {
      calls.push({ method: 'unsubscribe', args });
    },
    async requestDeletion(...args) {
      calls.push({ method: 'requestDeletion', args });
    },
    async me() {
      calls.push({ method: 'me', args: [] });
      return {
        applicationName: '',
        attentiveDomainName: '',
        companyName: '',
        contactEmail: '',
        companyId: '',
      };
    },
  };
  return { client, calls };
}

const joinedAt = new Date('2026-09-07T10:00:00.000Z');

const profile: WaitlistMarketingProfile = {
  id: 'entry-1',
  email: 'a@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  referralCode: 'abc123',
  referralCount: 2,
  signupSequence: 17,
  status: 'pending',
  joinedAt,
  wasReferred: true,
};

describe('createAttentiveMarketingAdapter', () => {
  test('subscribeToWaitlist upserts, subscribes through the sign-up unit, then records Joined Waitlist', async () => {
    const { client, calls } = fakeClient();
    const port = createAttentiveMarketingAdapter(client, { signUpSourceId: 'unit-9' });

    await port.subscribeToWaitlist(profile);

    expect(calls.map((c) => c.method)).toEqual(['upsertProfile', 'subscribe', 'trackEvent']);
    const user = { email: 'a@example.com', clientUserId: 'entry-1' };
    expect(calls[0]!.args[0]).toEqual({
      user,
      firstName: 'Ada',
      lastName: 'Lovelace',
      properties: {
        referral_code: 'abc123',
        referral_count: 2,
        signup_sequence: 17,
        waitlist_status: 'pending',
        joined_waitlist_at: '2026-09-07T10:00:00.000Z',
      },
    });
    expect(calls[1]!.args[0]).toEqual({ user, signUpSourceId: 'unit-9' });
    expect(calls[2]!.args).toEqual([
      'Joined Waitlist',
      user,
      { referral_code: 'abc123', was_referred: true },
      { externalEventId: 'entry-1', occurredAt: joinedAt },
    ]);
  });

  test('updateProfile is an upsert only: no consent change, no event', async () => {
    const { client, calls } = fakeClient();
    const port = createAttentiveMarketingAdapter(client, { signUpSourceId: 'unit-9' });

    await port.updateProfile({ ...profile, referralCount: 3 });

    expect(calls.map((c) => c.method)).toEqual(['upsertProfile']);
    const input = calls[0]!.args[0] as { properties: Record<string, unknown> };
    expect(input.properties.referral_count).toBe(3);
  });

  test('statusChanged refreshes the profile and records the transition once per entry and status', async () => {
    const { client, calls } = fakeClient();
    const port = createAttentiveMarketingAdapter(client, { signUpSourceId: 'unit-9' });

    await port.statusChanged({ ...profile, status: 'invited' });

    expect(calls.map((c) => c.method)).toEqual(['upsertProfile', 'trackEvent']);
    expect(calls[1]!.args).toEqual([
      'Waitlist Status Changed',
      { email: 'a@example.com', clientUserId: 'entry-1' },
      { waitlist_status: 'invited' },
      { externalEventId: 'entry-1:invited' },
    ]);
  });

  test('a phone rides along when a surface supplies one', async () => {
    const { client, calls } = fakeClient();
    const port = createAttentiveMarketingAdapter(client, { signUpSourceId: 'unit-9' });

    await port.updateProfile({ ...profile, phone: '+15555550123' });

    expect((calls[0]!.args[0] as { user: unknown }).user).toEqual({
      email: 'a@example.com',
      phone: '+15555550123',
      clientUserId: 'entry-1',
    });
  });
});
