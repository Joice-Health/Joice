import { describe, expect, test } from 'bun:test';
import type { KlaviyoClient } from '@joice/marketing';
import { createOnboardingKlaviyoAdapter } from './onboarding-klaviyo-adapter';

function fakeClient() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const client: KlaviyoClient = {
    async importProfile(input) {
      calls.push({ method: 'importProfile', args: [input] });
    },
    async subscribeToList(listId, email, source) {
      calls.push({ method: 'subscribeToList', args: [listId, email, source] });
    },
    async trackEvent(metric, email, props, uniqueId) {
      calls.push({ method: 'trackEvent', args: [metric, email, props, uniqueId] });
    },
    async suppressProfile(email) {
      calls.push({ method: 'suppressProfile', args: [email] });
    },
  };
  return { client, calls };
}

describe('onboarding Klaviyo adapter', () => {
  test('a service area request upserts with onboarding_* properties and never subscribes', async () => {
    const { client, calls } = fakeClient();
    const adapter = createOnboardingKlaviyoAdapter(client, { listId: 'list-1' });
    await adapter.serviceAreaRequested({
      email: 'a@example.com',
      firstName: 'Sam',
      stateCode: 'NY',
      goal: null,
      requestedAt: new Date('2026-08-19T12:00:00Z'),
    });
    expect(calls.map((c) => c.method)).toEqual(['importProfile', 'trackEvent']);
    const profile = calls[0]!.args[0] as { externalId?: string; properties: Record<string, unknown> };
    expect(profile.externalId).toBeUndefined();
    expect(profile.properties).toEqual({ onboarding_state: 'NY', onboarding_state_requested_at: '2026-08-19T12:00:00.000Z' });
    expect(calls[1]!.args).toEqual(['Service Area Requested', 'a@example.com', { onboarding_state: 'NY' }, 'a@example.com:NY']);
  });

  test('intake completed subscribes only with consent, and the event is unique per member', async () => {
    const { client, calls } = fakeClient();
    const adapter = createOnboardingKlaviyoAdapter(client, { listId: 'list-1' });
    const base = {
      email: 'a@example.com',
      firstName: 'Sam',
      goal: 'energy',
      segment: 'energy',
      stateCode: 'CA',
      completedAt: new Date('2026-08-19T12:00:00Z'),
      eventId: 'intake:m1',
    };
    await adapter.intakeCompleted({ ...base, consentMarketing: false });
    expect(calls.map((c) => c.method)).toEqual(['importProfile', 'trackEvent']);
    calls.length = 0;
    await adapter.intakeCompleted({ ...base, consentMarketing: true });
    expect(calls.map((c) => c.method)).toEqual(['importProfile', 'subscribeToList', 'trackEvent']);
    expect(calls[1]!.args).toEqual(['list-1', 'a@example.com', 'Joice intake opt-in']);
    expect(calls[2]!.args[3]).toBe('intake:m1');
    const props = (calls[0]!.args[0] as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props).every((k) => k.startsWith('onboarding_'))).toBe(true);
  });
});
