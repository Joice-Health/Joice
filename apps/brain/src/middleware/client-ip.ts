/**
 * Deriving the caller's address from `X-Forwarded-For`, counted from the RIGHT.
 *
 * This matters: a client can put anything at the *left* of that header, and
 * CloudFront forwards it (the AllViewer origin request policy) rather than
 * replacing it. Reading the leftmost hop therefore let anyone reset every rate
 * limit at will — `-H "X-Forwarded-For: <random>"` in a loop bought unlimited
 * Bedrock, Polly and Transcribe spend on unauthenticated endpoints.
 *
 * Each proxy *appends* the address it received the connection from, so the
 * rightmost entries are written by infrastructure we control and can trust:
 * CloudFront appends the viewer, then the ALB appends CloudFront's edge. The
 * real client sits `trustedHops` from the end; everything further left is
 * attacker-controlled and ignored.
 *
 * Kept free of the env module so it stays unit-testable in isolation.
 */
export function clientFromForwardedFor(
  header: string | undefined,
  trustedHops: number,
): string | null {
  if (trustedHops <= 0) return null;
  const hops = (header ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (hops.length === 0) return null;

  // Fewer hops than configured means the request didn't arrive the expected
  // way — fall back to the leftmost, which is then the only one we were given.
  const index = Math.max(0, hops.length - trustedHops);
  return hops[index] ?? null;
}
