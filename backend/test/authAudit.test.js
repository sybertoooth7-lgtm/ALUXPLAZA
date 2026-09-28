// Tests for the SSRF blocklist in lib/authAudit.js.
//
// These are pure-function tests, no database and no network, because that is
// the only way to test an address blocklist honestly: every case here is an
// address that must never be reachable, and asserting them through a live
// request would need a real server bound to a private address.
//
// The two bypasses below were both live when these tests were written. The
// IPv4-mapped one is the reason the check works on parsed groups rather than
// a regex.
import { describe, it, expect } from 'vitest';
import { isBlockedIPv4, isBlockedIPv6, isBlockedAddress } from '../src/lib/authAudit.js';

describe('authAudit IPv4 blocklist', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.1.2.3', 'loopback, non-canonical form'],
    ['10.1.2.3', 'RFC1918'],
    ['10.255.255.254', 'RFC1918 upper edge'],
    ['172.16.5.5', 'RFC1918'],
    ['172.31.255.254', 'RFC1918 upper edge'],
    ['192.168.1.1', 'RFC1918'],
    ['169.254.169.254', 'cloud metadata'],
    ['100.64.0.1', 'CGNAT'],
    ['0.0.0.0', 'this network'],
    ['255.255.255.255', 'limited broadcast'],
    ['224.0.0.1', 'multicast'],
    ['240.0.0.1', 'reserved for future use'],
  ])('blocks %s (%s)', (ip) => {
    expect(isBlockedIPv4(ip)).toBe(true);
  });

  it.each([
    ['8.8.8.8', 'public DNS'],
    ['1.1.1.1', 'public DNS'],
    ['93.184.216.34', 'public web host'],
    ['172.32.0.1', 'just outside RFC1918'],
    ['11.0.0.1', 'just outside RFC1918'],
    ['100.128.0.1', 'just outside CGNAT'],
    ['169.253.0.1', 'just below link-local'],
  ])('allows %s (%s)', (ip) => {
    expect(isBlockedIPv4(ip)).toBe(false);
  });
});

describe('authAudit IPv6 blocklist', () => {
  it('blocks loopback, unspecified, and link-local in every spelling', () => {
    expect(isBlockedIPv6('::1')).toBe(true);
    expect(isBlockedIPv6('0:0:0:0:0:0:0:1')).toBe(true);
    expect(isBlockedIPv6('::')).toBe(true);
    expect(isBlockedIPv6('fe80::1')).toBe(true);
    expect(isBlockedIPv6('fe80::1%eth0')).toBe(true); // zone id must not defeat it
    expect(isBlockedIPv6('fec0::1')).toBe(true); // site-local, deprecated
  });

  it('blocks unique-local addresses', () => {
    expect(isBlockedIPv6('fc00::1')).toBe(true);
    expect(isBlockedIPv6('fd12:3456:789a::1')).toBe(true);
    expect(isBlockedIPv6('fdff::1')).toBe(true);
  });

  it('blocks the hex spelling of an IPv4-mapped loopback', () => {
    // THE BYPASS. ::ffff:7f00:1 and ::ffff:127.0.0.1 are the same address.
    // The previous check matched only the dotted-quad spelling with a regex,
    // so the hex form passed every test and reached the loopback interface.
    expect(isBlockedIPv6('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIPv6('::ffff:7f00:1')).toBe(true);
    expect(isBlockedIPv6('0:0:0:0:0:ffff:7f00:1')).toBe(true); // fully expanded
    expect(isBlockedIPv6('0:0:0:0:0:ffff:0:7f00:1')).toBe(true); // v4-compatible
  });

  it('blocks IPv4-mapped forms of every private range, in hex and dotted-quad', () => {
    const mapped = [
      ['::ffff:10.0.0.1', '::ffff:a00:1'],
      ['::ffff:192.168.1.1', '::ffff:c0a8:101'],
      ['::ffff:172.16.0.1', '::ffff:ac10:1'],
      ['::ffff:169.254.169.254', '::ffff:a9fe:a9fe'],
      ['::ffff:127.0.0.1', '::ffff:7f00:1'],
    ];
    for (const [dotted, hex] of mapped) {
      expect(isBlockedIPv6(dotted), dotted).toBe(true);
      expect(isBlockedIPv6(hex), hex).toBe(true);
    }
  });

  it('still allows an IPv4-mapped public address', () => {
    // The fix normalizes IPv4-mapped addresses and reuses the IPv4 blocklist.
    // If that reuse were wrong in the permissive direction it would block
    // legitimate public IPv6 targets, so it needs a negative case too.
    expect(isBlockedIPv6('::ffff:8.8.8.8')).toBe(false);
    expect(isBlockedIPv6('::ffff:808:808')).toBe(false);
  });

  it('inspects the address embedded in a 6to4 prefix', () => {
    // 2002::/16 embeds the target IPv4 in the next 32 bits, so checking only
    // the 2002:: prefix would let 6to4 be a tunnel straight to loopback.
    expect(isBlockedIPv6('2002:7f00:1::1')).toBe(true); // -> 127.0.0.1
    expect(isBlockedIPv6('2002:a9fe:a9fe::1')).toBe(true); // -> 169.254.169.254
    expect(isBlockedIPv6('2002:0808:0808::1')).toBe(false); // -> 8.8.8.8
  });

  it('blocks NAT64 to a private target', () => {
    // 64:ff9b::/96 is the well-known NAT64 prefix and translates to whatever
    // IPv4 is in the low 32 bits.
    expect(isBlockedIPv6('64:ff9b::7f00:1')).toBe(true);
    expect(isBlockedIPv6('64:ff9b::808:808')).toBe(true);
  });

  it('allows ordinary public IPv6', () => {
    expect(isBlockedIPv6('2606:4700:4700::1111')).toBe(false);
    expect(isBlockedIPv6('2a00:1450:4001:80f::200e')).toBe(false);
  });

  it('refuses to allow an address it cannot parse', () => {
    // Fail closed. A blocklist that returns "not blocked" for input it does
    // not understand is a blocklist with a hole exactly where the attacker
    // would look for one.
    expect(isBlockedIPv6('not-an-address')).toBe(true);
    expect(isBlockedIPv6('gggg::1')).toBe(true);
    expect(isBlockedIPv6('1:2:3:4:5:6:7:8:9')).toBe(true); // too many groups
  });
});

describe('authAudit isBlockedAddress', () => {
  it('dispatches on family', () => {
    expect(isBlockedAddress('127.0.0.1', 4)).toBe(true);
    expect(isBlockedAddress('8.8.8.8', 4)).toBe(false);
    expect(isBlockedAddress('::1', 6)).toBe(true);
    expect(isBlockedAddress('2606:4700::1111', 6)).toBe(false);
  });
});
