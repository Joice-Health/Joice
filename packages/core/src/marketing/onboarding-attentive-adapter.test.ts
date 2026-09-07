import { describe, expect, test } from 'bun:test';
import type { AttentiveClient } from '@joice/marketing';
import { createOnboardingAttentiveAdapter } from './onboarding-attentive-adapter';

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

describe('createOnboardingAttentiveAdapter', () => {
  test('notify-me upserts and records the request, and never subscribes or sends a client id', async () => {
    const { client, calls } = fakeClient();
    const port = createOnboardingAttentiveAdapter(client, { signUpSourceId: 'unit-9' });
    const requestedAt = new Date('2026-09-07T10:00:00.000Z');

    await port.serviceAreaRequested({
      email: 'a@example.com',
      firstName: 'Ada',
      stateCode: 'NY',
      goal: null,
      requestedAt,
    });

    expect(calls.map((c) => c.method)).toEqual(['upsertProfile', 'trackEvent']);
    expect(calls[0]!.args[0]).toEqual({
      user: { email: 'a@example.com' },
      firstName: 'Ada',
      properties: {
        onboarding_state: 'NY',
        onboarding_state_requested_at: '2026-09-07T10:00:00.000Z',
      },
    });
    expect(calls[1]!.args).toEqual([
      'Service Area Requested',
      { email: 'a@example.com' },
      { onboarding_state: 'NY' },
      { externalEventId: 'a@example.com:NY', occurredAt: requestedAt },
    ]);
  });

  test('intake completed subscribes only with consent, and every property is onboarding_*', async () => {
    const { client, calls } = fakeClient();
    const port = createOnboardingAttentiveAdapter(client, { signUpSourceId: 'unit-9' });
    const completedAt = new Date('2026-09-07T11:00:00.000Z');
    const base = {
      email: 'm@example.com',
      firstName: 'Mo',
      goal: 'sleep',
      segment: 'explorer',
      stateCode: 'CA',
      completedAt,
      eventId: 'intake:m1',
    };

    await port.intakeCompleted({ ...base, consentMarketing: true });
    expect(calls.map((c) => c.method)).toEqual(['upsertProfile', 'subscribe', 'trackEvent']);
    const input = calls[0]!.args[0] as { properties: Record<string, unknown> };
    for (const key of Object.keys(input.properties)) expect(key.startsWith('onboarding_')).toBe(true);
    expect(input.properties).toEqual({
      onboarding_goal: 'sleep',
      onboarding_segment: 'explorer',
      onboarding_state: 'CA',
      onboarding_completed_at: '2026-09-07T11:00:00.000Z',
      onboarding_marketing_consent: true,
    });
    expect(calls[1]!.args[0]).toEqual({ user: { email: 'm@example.com' }, signUpSourceId: 'unit-9' });
    expect(calls[2]!.args).toEqual([
      'Onboarding Completed',
      { email: 'm@example.com' },
      { onboarding_goal: 'sleep', onboarding_segment: 'explorer' },
      { externalEventId: 'intake:m1', occurredAt: completedAt },
    ]);

    calls.length = 0;
    await port.intakeCompleted({ ...base, consentMarketing: false });
    expect(calls.map((c) => c.method)).toEqual(['upsertProfile', 'trackEvent']);
  });
});
