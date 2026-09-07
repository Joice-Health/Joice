/**
 * Attentive signs every webhook delivery: `x-attentive-hmac-sha256` carries the
 * hex HMAC-SHA256 of the raw request body under the webhook's signing key
 * (issued by the dashboard when the webhook is created). Signer and verifier
 * live together so the api middleware, its tests and the curl recipe in
 * docs/marketing/01-attentive.md can never disagree on the encoding.
 */

export const ATTENTIVE_SIGNATURE_HEADER = 'x-attentive-hmac-sha256';

const encoder = new TextEncoder();

/** Hex HMAC-SHA256 of `rawBody` under `secret`, exactly as Attentive computes it. */
export async function signAttentiveWebhook(secret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * True when `presented` (the header value) is the signature of `rawBody`.
 * Constant-time on the digest bytes; a missing header or secret is simply false.
 */
export async function verifyAttentiveWebhook(
  secret: string,
  rawBody: string,
  presented: string | null | undefined,
): Promise<boolean> {
  if (!secret || !presented) return false;
  const expected = encoder.encode(await signAttentiveWebhook(secret, rawBody));
  const given = encoder.encode(presented.trim().toLowerCase());
  if (expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected[i]! ^ given[i]!;
  return diff === 0;
}
