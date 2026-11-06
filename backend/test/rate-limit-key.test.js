import { describe, it, expect } from 'vitest';
import { rateLimitKey } from '../src/middleware/rate-limit.js';

const request = (ip, remoteAddress = '203.0.113.9') => ({
  ip,
  socket: { remoteAddress },
});

describe('rateLimitKey', () => {
  it('keys a IPv4 client by address under the limiter prefix', () => {
    expect(rateLimitKey('auth', request('198.51.100.7'))).toBe('auth:198.51.100.7');
  });

  it('keeps limiters in separate buckets for the same address', () => {
    expect(rateLimitKey('auth', request('198.51.100.7'))).not.toBe(
      rateLimitKey('mfa', request('198.51.100.7'))
    );
  });

  // The reason this helper exists: when TRUST_PROXY_HOPS is one too high, a
  // client controls req.ip. If the limiter keyed on it directly, varying the
  // header would mint a fresh bucket per request and the limit would never
  // apply. Keying on the validated address (here the socket) closes that.
  it('does not let a garbage req.ip mint a new bucket', () => {
    const first = rateLimitKey('api', request('garbage-one'));
    const second = rateLimitKey('api', request('garbage-two'));
    expect(first).toBe('api:203.0.113.9');
    expect(second).toBe(first);
    expect(rateLimitKey('api', request('x'.repeat(300)))).toBe(first);
  });

  it('groups IPv6 clients by /56 rather than per address', () => {
    const a = rateLimitKey('api', request('2001:db8:0:ab01::1'));
    const b = rateLimitKey('api', request('2001:db8:0:ab02::2'));
    const c = rateLimitKey('api', request('2001:db8:0:cd01::1'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('treats a v4-mapped v6 address as its IPv4 address', () => {
    expect(rateLimitKey('api', request('::ffff:198.51.100.7'))).toBe('api:198.51.100.7');
  });

  // No attributable source: every such request shares one bucket. That is the
  // safe direction — the alternative is unlimited buckets.
  it('puts unattributable requests into one shared bucket', () => {
    const a = rateLimitKey('auth', { ip: 'not-an-ip', socket: { remoteAddress: '10.0.0.5' } });
    const b = rateLimitKey('auth', { ip: 'also-not-an-ip' });
    expect(a).toBe('auth:unknown');
    expect(b).toBe(a);
  });
});
