import { env } from './env';

/** One-way hash of an IP address (salted) so raw addresses are never stored. */
export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${env.IP_HASH_SALT}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
