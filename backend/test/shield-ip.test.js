import { describe, it, expect } from 'vitest';
import { getClientIp } from '../src/middleware/shieldMiddleware.js';

// Shape of the parts of an Express request getClientIp reads.
const request = (ip, remoteAddress = '203.0.113.9') => ({
  ip,
  socket: { remoteAddress },
});

describe('getClientIp', () => {
  it('returns a plain IPv4 address', () => {
    expect(getClientIp(request('198.51.100.7'))).toBe('198.51.100.7');
  });

  it('accepts IPv6', () => {
    expect(getClientIp(request('2001:db8::1'))).toBe('2001:db8::1');
  });

  it('unwraps a v4-mapped IPv6 address to IPv4', () => {
    expect(getClientIp(request('::ffff:198.51.100.7'))).toBe('198.51.100.7');
  });

  it('strips brackets and a port from a bracketed IPv6 literal', () => {
    expect(getClientIp(request('[2001:db8::1]:443'))).toBe('2001:db8::1');
  });

  it('drops an IPv6 zone identifier', () => {
    expect(getClientIp(request('fe80::1%eth0'))).toBe('fe80::1');
  });

  // This is the case that matters: an X-Forwarded-For entry becomes req.ip
  // when TRUST_PROXY_HOPS is one too high, and a non-address there would end
  // up in the VARCHAR(45) blocklist/event columns and break the write.
  it('ignores a req.ip that is not an address', () => {
    expect(getClientIp(request('not-an-ip'))).toBe('203.0.113.9');
    expect(getClientIp(request('x'.repeat(300)))).toBe('203.0.113.9');
    expect(getClientIp(request('1.2.3.4, 5.6.7.8'))).toBe('203.0.113.9');
  });

  it('ignores a req.ip that is missing or not a string', () => {
    expect(getClientIp(request(undefined))).toBe('203.0.113.9');
    expect(getClientIp({ ip: 42, socket: { remoteAddress: '198.51.100.4' } })).toBe(
      '198.51.100.4'
    );
  });

  it('uses the legacy connection object when there is no socket', () => {
    expect(getClientIp({ connection: { remoteAddress: '198.51.100.4' } })).toBe('198.51.100.4');
  });

  // The socket address in this case is the host's own proxy. Blocking it
  // because one client sent a malformed forwarding header would deny every
  // visitor behind that proxy, so the request becomes unattributable instead.
  it('does not fall back to a private socket address', () => {
    expect(getClientIp({ ip: 'not-an-ip', socket: { remoteAddress: '10.0.0.5' } })).toBe('unknown');
    expect(getClientIp({ ip: 'not-an-ip', socket: { remoteAddress: '::1' } })).toBe('unknown');
    expect(getClientIp({ ip: 'not-an-ip', socket: { remoteAddress: 'fe80::1%eth0' } })).toBe(
      'unknown'
    );
  });

  it('still accepts a private req.ip, which is what Express reports for a direct caller', () => {
    expect(getClientIp(request('127.0.0.1', '127.0.0.1'))).toBe('127.0.0.1');
  });

  it('returns "unknown" when there is no usable address at all', () => {
    expect(getClientIp({})).toBe('unknown');
    expect(getClientIp({ ip: 'evil.example.com', socket: {} })).toBe('unknown');
  });
});
