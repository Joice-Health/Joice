import { describe, expect, test } from 'bun:test';
import { METRICS, type KlaviyoClient } from '@joice/marketing';
import { createKlaviyoMarketingAdapter } from './klaviyo-adapter';
import type { WaitlistMarketingProfile } from './port';

/**
 * The adapter is the one place waitlist vocabulary becomes Klaviyo calls, so
 * these tests pin the call sequence, the metric constants, and the dedupe
 * unique_ids — the things a flow in Klaviyo silently depends on.
 */

function fakeClient() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const client: KlaviyoClient = {
    async importProfile(...args) {
      calls.push({ method: 'importProfile', args });
    },
    async subscribeToList(...args) {
      calls.push({ method: 'subscribeToList', args });
    },
    async trackEvent(...args) {
      calls.push({ method: 'trackEvent', args });
    },
  };
  return { client, calls };
}

const profile: WaitlistMarketingProfile = {
  id: 'entry-1',
  email: 'a@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  referralCode: 'abc123',
  referralCount: 2,
  signupSequence: 7,
  status: 'pending',
  joinedAt: new Date('2026-08-01T00:00:00Z'),
  wasReferred: true,
};

describe('createKlaviyoMarketingAdapter', () => {
  test('subscribeToWaitlist: import → list subscribe → Joined Waitlist event with entry-id dedupe', async () => {
    const { client, calls } = fakeClient();
    const adapter = createKlaviyoMarketingAdapter(client, { listId: 'LIST99' });

    await adapter.subscribeToWaitlist(profile);

    expect(calls.map((c) => c.method)).toEqual([
      'importProfile',
      'subscribeToList',
      'trackEvent',
    ]);
    expect(calls[0]!.args[0]).toEqual({
      email: 'a@example.com',
      externalId: 'entry-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      properties: {
        referral_code: 'abc123',
        referral_count: 2,
        signup_sequence: 7,
        waitlist_status: 'pending',
        joined_waitlist_at: '2026-08-01T00:00:00.000Z',
      },
    });
    expect(calls[1]!.args).toEqual(['LIST99', 'a@example.com', 'Joice waitlist signup']);
    expect(calls[2]!.args).toEqual([
      METRICS.joinedWaitlist,
      'a@example.com',
      { referral_code: 'abc123', was_referred: true },
      'entry-1',
    ]);
  });

  test('updateProfile: profile import only — no consent, no event', async () => {
    const { client, calls } = fakeClient();
    const adapter = createKlaviyoMarketingAdapter(client, { listId: 'LIST99' });

    await adapter.updateProfile(profile);

    expect(calls.map((c) => c.method)).toEqual(['importProfile']);
  });

  test('statusChanged: import + event deduped per entry-per-status, no consent change', async () => {
    const { client, calls } = fakeClient();
    const adapter = createKlaviyoMarketingAdapter(client, { listId: 'LIST99' });

    await adapter.statusChanged({ ...profile, status: 'invited' });

    expect(calls.map((c) => c.method)).toEqual(['importProfile', 'trackEvent']);
    expect(calls[1]!.args).toEqual([
      METRICS.waitlistStatusChanged,
      'a@example.com',
      { waitlist_status: 'invited' },
      'entry-1:invited',
    ]);
  });
});
