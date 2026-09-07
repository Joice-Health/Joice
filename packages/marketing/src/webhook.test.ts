import { describe, expect, test } from 'bun:test';
import { signAttentiveWebhook, verifyAttentiveWebhook } from './webhook';

describe('Attentive webhook signatures', () => {
  test('matches the published HMAC-SHA256 test vector, hex encoded', async () => {
    // RFC-style vector: key "key", message "The quick brown fox jumps over the lazy dog".
    expect(await signAttentiveWebhook('key', 'The quick brown fox jumps over the lazy dog')).toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    );
  });

  test('a signature verifies against the raw body it was computed over', async () => {
    const body = '{"type":"email.unsubscribed","subscriber":{"email":"a@example.com"}}';
    const signature = await signAttentiveWebhook('secret', body);

    expect(await verifyAttentiveWebhook('secret', body, signature)).toBe(true);
    expect(await verifyAttentiveWebhook('secret', body, signature.toUpperCase())).toBe(true);
  });

  test('a wrong secret, a tampered body, or a missing header fails', async () => {
    const body = '{"type":"email.unsubscribed"}';
    const signature = await signAttentiveWebhook('secret', body);

    expect(await verifyAttentiveWebhook('other', body, signature)).toBe(false);
    expect(await verifyAttentiveWebhook('secret', body + ' ', signature)).toBe(false);
    expect(await verifyAttentiveWebhook('secret', body, undefined)).toBe(false);
    expect(await verifyAttentiveWebhook('secret', body, '')).toBe(false);
    expect(await verifyAttentiveWebhook('', body, signature)).toBe(false);
  });
});
