// backend/src/lib/ip.js
// One place that answers two questions: "is this string actually an address?"
// and "is it ours rather than a visitor's?". Both matter at a trust boundary —
// a proxy header is not a promise, and an infrastructure address must never be
// mistaken for the client on the other side of it.

import net from 'node:net';

// Addresses that can never be a visitor's public address: private, loopback,
// link-local and carrier-grade NAT (which hosts use between their own proxies).
const INTERNAL = new net.BlockList();
[
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
].forEach(([network, prefix]) => INTERNAL.addSubnet(network, prefix, 'ipv4'));
[
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
].forEach(([network, prefix]) => INTERNAL.addSubnet(network, prefix, 'ipv6'));

/**
 * True for a private/internal address. Accepts IPv4-mapped IPv6 (::ffff:10.0.0.1).
 * A non-address is not internal: callers that need validity check it separately.
 */
export function isInternalAddress(ip) {
  if (!ip) return false;
  const address = String(ip).replace(/^::ffff:/i, '');
  const family = net.isIPv4(address) ? 'ipv4' : net.isIPv6(address) ? 'ipv6' : null;
  return family ? INTERNAL.check(address, family) : false;
}

/**
 * Returns the address in a form a database column and an equality check can
 * both use, or null if the value is not an address at all.
 *
 * Handles the shapes proxies actually emit: bracketed IPv6 with a port,
 * IPv6 zone identifiers, and v4-mapped v6.
 */
export function normalizeIp(value) {
  if (typeof value !== 'string') return null;
  let candidate = value.trim();
  if (!candidate) return null;

  // Bracketed IPv6 with a port, as some proxies emit: [2001:db8::1]:443
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(candidate);
  if (bracketed) candidate = bracketed[1];

  // Zone identifiers (fe80::1%eth0) are OS-local, not part of the address.
  if (candidate.includes(':')) candidate = candidate.split('%')[0];

  // Treat a v4-mapped v6 address as the v4 address it wraps, so one client
  // cannot occupy two blocklist buckets depending on how the proxy wrote it.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(candidate);
  if (mapped) candidate = mapped[1];

  return net.isIP(candidate) ? candidate : null;
}
