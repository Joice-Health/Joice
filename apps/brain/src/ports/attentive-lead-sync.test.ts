import { describe, expect, test } from 'bun:test';
import { AttentiveRequestError, type AttentiveClient } from '@joice/marketing';
import { createAttentiveLeadSync } from './attentive-lead-sync';

function fakeClient(fail: Partial<Record<'unsubscribe' | 'requestDeletion', number>> = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const failWith = (method: 'unsubscribe' | 'requestDeletion') => {
    const status = fail[method];
    if (status) throw new AttentiveRequestError(`/${method}`, status, 'nope');
  };
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
      failWith('unsubscribe');
    },
    async requestDeletion(...args) {
      calls.push({ method: 'requestDeletion', args });
      failWith('requestDeletion');
    },
    async me() {
      throw new Error('not used');
    },
  };
  return { client, calls };
}

describe('createAttentiveLeadSync', () => {
  test('upsertLead sends lead_* attributes only: no name, no client id, no subscription', async () => {
    const { client, calls } = fakeClient();
    const port = createAttentiveLeadSync(client);

    await port.upsertLead({ email: 'v@example.com', name: 'Vee', goal: 'sleep', status: 'exploring' });

    expect(calls.map((c) => c.method)).toEqual(['upsertProfile']);
    expect(calls[0]!.args[0]).toEqual({
      user: { email: 'v@example.com' },
      properties: { lead_source: 'companion', lead_status: 'exploring', lead_goal: 'sleep' },
    });
  });

  test('suppressLead unsubscribes quietly, then files the delete request', async () => {
    const { client, calls } = fakeClient();
    const port = createAttentiveLeadSync(client);

    await port.suppressLead('gone@example.com');

    expect(calls.map((c) => c.method)).toEqual(['unsubscribe', 'requestDeletion']);
    expect(calls[0]!.args).toEqual([{ email: 'gone@example.com' }]);
    expect(calls[1]!.args).toEqual([{ email: 'gone@example.com' }, 'Joice erasure request']);
  });

  test('a person Attentive never had (404) does not block their erasure', async () => {
    const { client, calls } = fakeClient({ unsubscribe: 404, requestDeletion: 404 });
    const port = createAttentiveLeadSync(client);

    await port.suppressLead('gone@example.com');

    expect(calls.map((c) => c.method)).toEqual(['unsubscribe', 'requestDeletion']);
  });

  test('any other failure propagates so the erasure transaction rolls back', async () => {
    const { client } = fakeClient({ unsubscribe: 500 });
    const port = createAttentiveLeadSync(client);

    await expect(port.suppressLead('gone@example.com')).rejects.toBeInstanceOf(AttentiveRequestError);
  });
});
