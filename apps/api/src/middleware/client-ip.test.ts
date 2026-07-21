import { describe, expect, test } from 'bun:test';
import { clientFromForwardedFor } from './client-ip';

/**
 * Rate limiting is the only thing standing between an anonymous caller and
 * metered Bedrock/Polly/Transcribe spend, and it keys entirely on this
 * function. A client can put anything at the LEFT of X-Forwarded-For, so these
 * tests exist to keep anyone from "simplifying" it back to reading hops[0].
 */

// Production topology: CloudFront appends the viewer, then the ALB appends
// CloudFront's edge address.
const PROD_HOPS = 2;

describe('clientFromForwardedFor', () => {
  test('reads the viewer address behind CloudFront + ALB', () => {
    expect(clientFromForwardedFor('203.0.113.7, 130.176.0.1', PROD_HOPS)).toBe('203.0.113.7');
  });

  test('ignores a spoofed value the client prepended', () => {
    const spoofed = 'evil-1, 203.0.113.7, 130.176.0.1';
    expect(clientFromForwardedFor(spoofed, PROD_HOPS)).toBe('203.0.113.7');
  });

  test('a whole spoofed chain still resolves to the real viewer', () => {
    const header = 'a, b, c, d, 203.0.113.7, 130.176.0.1';
    expect(clientFromForwardedFor(header, PROD_HOPS)).toBe('203.0.113.7');
  });

  test('two callers spoofing different values share one bucket', () => {
    const a = clientFromForwardedFor('1.1.1.1, 203.0.113.7, 130.176.0.1', PROD_HOPS);
    const b = clientFromForwardedFor('2.2.2.2, 203.0.113.7, 130.176.0.1', PROD_HOPS);
    expect(a).toBe(b); // the bypass this whole change exists to close
  });

  test('falls back to the socket address when not behind a proxy', () => {
    expect(clientFromForwardedFor(undefined, 0)).toBeNull();
    expect(clientFromForwardedFor('203.0.113.7', 0)).toBeNull();
  });

  test('handles fewer hops than configured without throwing', () => {
    expect(clientFromForwardedFor('203.0.113.7', PROD_HOPS)).toBe('203.0.113.7');
  });

  test('tolerates whitespace and empty entries', () => {
    expect(clientFromForwardedFor('  , 203.0.113.7 ,  130.176.0.1 ', PROD_HOPS)).toBe('203.0.113.7');
    expect(clientFromForwardedFor('   ', PROD_HOPS)).toBeNull();
  });
});
