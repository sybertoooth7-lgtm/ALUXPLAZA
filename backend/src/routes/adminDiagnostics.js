// backend/src/routes/adminDiagnostics.js
// Superadmin-only diagnostics, mounted at /api/admin/diagnostics.
//
// GET /client-ip shows what this request looked like to the app: the IP it
// settled on, the proxy chain it was given, and the raw forwarding headers. It
// exists to answer one question that cannot be answered from the code: how many
// proxies does the host put in front of us? Open it from a real device, compare
// the detected address with that device's public IP, and set TRUST_PROXY_HOPS to
// match. It only describes the caller's own request.

import { Router } from 'express';
import net from 'node:net';

const router = Router();

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

/** True for a private/internal address. Accepts IPv4-mapped IPv6 (::ffff:10.0.0.1). */
export function isInternalAddress(ip) {
  if (!ip) return false;
  const address = String(ip).replace(/^::ffff:/i, '');
  const family = net.isIPv4(address) ? 'ipv4' : net.isIPv6(address) ? 'ipv6' : null;
  return family ? INTERNAL.check(address, family) : false;
}

function guidanceFor(detectedIp, looksInternal, hops) {
  if (looksInternal) {
    return (
      `The detected address ${detectedIp} is private or internal, so the app is reading one of the host's own proxies, not the visitor. ` +
      `Raise TRUST_PROXY_HOPS by one (now ${hops}), redeploy, and check again.`
    );
  }
  return (
    `The detected address ${detectedIp} is public. Compare it with this device's real public IP (search "what is my IP" on the same device and network). ` +
    `If they match, leave TRUST_PROXY_HOPS alone: a higher value would let visitors forge their IP with their own X-Forwarded-For header. ` +
    `If they differ, the app is reading a proxy; raise TRUST_PROXY_HOPS by one and check again. Repeat from a second network (for example mobile data) to be sure.`
  );
}

router.get('/client-ip', (req, res) => {
  const hops = req.app.get('trust proxy');
  const detectedIp = req.ip;
  const looksInternal = isInternalAddress(detectedIp);
  const header = (name) => req.get(name) ?? null;

  res.set('Cache-Control', 'no-store');
  res.json({
    detectedIp,
    looksInternal,
    trustProxyHops: hops,
    // req.ips is the trusted part of the chain (empty when no proxy is trusted).
    trustedChain: req.ips,
    socketAddress: req.socket.remoteAddress ?? null,
    headers: {
      'x-forwarded-for': header('x-forwarded-for'),
      'true-client-ip': header('true-client-ip'),
      'cf-connecting-ip': header('cf-connecting-ip'),
      'x-real-ip': header('x-real-ip'),
      forwarded: header('forwarded'),
    },
    guidance: guidanceFor(detectedIp, looksInternal, hops),
  });
});

export default router;
