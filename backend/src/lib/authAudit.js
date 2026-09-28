// backend/src/lib/authAudit.js
// Pure Node.js security audit — no Python subprocess needed.

import { URL } from 'url';
import dns from 'dns/promises';
import http from 'node:http';
import https from 'node:https';

const BLOCKED_IPV4_RANGES = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  // Reserved for future use (240.0.0.0/4). Not internal, but nothing
  // legitimate lives here and leaving it out means a scan of this range
  // silently "passes" the check.
  ['240.0.0.0', 4],
];

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

export function isBlockedIPv4(ip) {
  const target = ipv4ToInt(ip);
  return BLOCKED_IPV4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (target & mask) === (ipv4ToInt(base) & mask);
  });
}

/**
 * Expands an IPv6 address to its eight 16-bit groups.
 * Written out rather than pulled from a dependency because getting this wrong
 * is exactly the bug that made the previous check bypassable.
 */
function expandIPv6(ip) {
  let address = ip.toLowerCase().split('%')[0]; // strip zone id (fe80::1%eth0)

  // An embedded dotted-quad tail (::ffff:127.0.0.1) becomes two hex groups.
  const dotted = address.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) {
    const value = ipv4ToInt(dotted[1]);
    const high = ((value >>> 16) & 0xffff).toString(16);
    const low = (value & 0xffff).toString(16);
    address = address.slice(0, dotted.index) + high + ':' + low;
  }

  const [head, tail] = address.split('::');
  const headGroups = head ? head.split(':').filter(Boolean) : [];
  const tailGroups = tail !== undefined && tail ? tail.split(':').filter(Boolean) : [];

  let groups;
  if (tail === undefined) {
    groups = headGroups;
  } else {
    // '::' stands for however many zero groups are needed to reach eight.
    const fill = new Array(8 - headGroups.length - tailGroups.length).fill('0');
    groups = [...headGroups, ...fill, ...tailGroups];
  }

  if (groups.length !== 8) return null;
  return groups
    .map((g) => parseInt(g, 16))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff);
}

function groupMatches(groups, base, prefixLength) {
  const baseGroups = expandIPv6(base);
  if (!baseGroups) return false;
  let remaining = prefixLength;
  for (let i = 0; i < 8 && remaining > 0; i++) {
    const bits = Math.min(16, remaining);
    const mask = bits === 0 ? 0 : (~0 << (16 - bits)) & 0xffff;
    if ((groups[i] & mask) !== (baseGroups[i] & mask)) return false;
    remaining -= bits;
  }
  return true;
}

const BLOCKED_IPV6_RANGES = [
  ['::1', 128], // loopback
  ['::', 128], // unspecified
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local, deprecated by RFC 3879 but still a private range
  ['64:ff9b::', 96], // NAT64 well-known prefix — maps to arbitrary IPv4
  ['2002::', 16], // 6to4 — embeds an IPv4 address in the next 32 bits
  ['2001:db8::', 32], // documentation
];

export function isBlockedIPv6(ip) {
  const groups = expandIPv6(ip);
  if (!groups) return true; // unparseable: refuse rather than allow

  // IPv4-mapped (::ffff:0:0/96) and IPv4-compatible (::0:0/96) addresses carry
  // a full IPv4 address in their last 32 bits. The previous version matched
  // only the dotted-quad spelling with a regex, so ::ffff:7f00:1 — the exact
  // same address as 127.0.0.1, just written in hex — fell through every
  // check and reached the loopback interface. Normalizing the binary form
  // makes the spelling irrelevant.
  const isV4Mapped = groupMatches(groups, '::ffff:0:0', 96);
  const isV4Compat = !isV4Mapped && groupMatches(groups, '::', 96);
  if (isV4Mapped || isV4Compat) {
    const v4 = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join('.');
    return isBlockedIPv4(v4);
  }

  // 6to4 (2002::/16) embeds the target IPv4 in groups 1-2, so the embedded
  // address has to be checked, not just the 2002:: prefix.
  if (groupMatches(groups, '2002::', 16)) {
    const v4 = [groups[1] >> 8, groups[1] & 0xff, groups[2] >> 8, groups[2] & 0xff].join('.');
    return isBlockedIPv4(v4);
  }

  return BLOCKED_IPV6_RANGES.some(([base, bits]) => groupMatches(groups, base, bits));
}

export function isBlockedAddress(address, family) {
  return family === 4 ? isBlockedIPv4(address) : isBlockedIPv6(address);
}

async function assertPublicTarget(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Target is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Target must use http:// or https://.');
  }

  const { addresses } = await resolvePublicAddresses(url);
  // The single biggest hole in the old version: it validated a set of
  // addresses and then let fetch() resolve the hostname AGAIN, independently.
  // Those are two separate lookups, so an attacker running a DNS server with
  // a 0-second TTL returns a public IP for the check and 169.254.169.254 for
  // the connection — the classic rebinding TOCTOU, and it defeated the entire
  // blocklist. assertPublicTarget now returns the addresses it validated, and
  // the fetch is pinned to one of them via a custom lookup (see dnsLookupPinned),
  // so the address that was checked is provably the address connected to.
  return { url, addresses };
}

async function resolvePublicAddresses(url) {
  let addresses;
  try {
    addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('Target hostname could not be resolved.');
  }
  if (addresses.length === 0) {
    throw new Error('Target hostname could not be resolved.');
  }
  for (const { address, family } of addresses) {
    if (isBlockedAddress(address, family)) {
      throw new Error('Target resolves to a private or internal address — not allowed.');
    }
  }
  return { addresses };
}

/**
 * GETs a URL over a socket pinned to an already-validated address.
 *
 * Uses node:http/node:https rather than global fetch on purpose. fetch's
 * resolver is not overridable without the `dispatcher` option, which needs
 * the `undici` package as a direct dependency and has to track whatever
 * version Node bundles. http.request has had a first-class `lookup` option
 * forever, so the pin is dependency-free and cannot drift.
 *
 * `servername` is set for HTTPS so certificate validation and SNI still use
 * the real hostname even though the socket goes to a specific IP — pinning
 * the IP must not turn a valid cert into a mismatch error.
 */
function pinnedGet(url, { addresses, timeoutMs = 15000, maxBytes = 5 * 1024 * 1024 }) {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    if (!addresses || addresses.length === 0) {
      reject(new Error('No validated address available for this host.'));
      return;
    }
    // Prefer IPv4. The dual-stack happy-eyeballs behaviour in fetch is not
    // available here, and preferring v6 would make an audit fail on a host
    // whose v6 path is worse than its v4 path.
    const candidate = addresses.find((a) => a.family === 4) || addresses[0];

    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Host: url.host,
          'User-Agent': 'AluxPlaza-SecurityAudit/1.0',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        // The pin. `lookup` replaces name resolution entirely, so the socket
        // cannot end up somewhere other than an address that passed
        // isBlockedAddress() moments ago.
        lookup: (_hostname, _options, callback) => {
          callback(null, candidate.address, candidate.family);
        },
        // SNI + cert validation still use the real hostname.
        ...(isHttps ? { servername: url.hostname } : {}),
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          // An audit target is an arbitrary hostile page. Cap the body so a
          // huge or infinite response cannot exhaust memory here.
          if (size > maxBytes) {
            req.destroy();
            reject(new Error('Target response too large to audit.'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        );
        res.on('error', reject);
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Target timed out.'));
    });
    req.on('error', reject);
    req.end();
  });
}

export async function runAuthAudit(target, loginPath = null) {
  const { addresses } = await assertPublicTarget(target);

  const url = new URL(target);
  if (loginPath) {
    url.pathname = loginPath.startsWith('/') ? loginPath : '/' + loginPath;
  }

  // redirect: 'follow' would let a server redirect us to a private/internal
  // address AFTER the check already cleared the original URL — classic
  // SSRF-via-redirect. Instead we follow redirects manually, one hop at a
  // time, and re-validate every Location header before fetching it.
  const MAX_REDIRECTS = 5;
  let currentUrl = url;
  let currentAddresses = addresses;
  let resp;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    resp = await pinnedGet(currentUrl, { addresses: currentAddresses });

    const isRedirect = resp.status >= 300 && resp.status < 400 && resp.headers.location;
    if (!isRedirect) break;
    if (hop === MAX_REDIRECTS) {
      throw new Error('Too many redirects while auditing target.');
    }

    const nextUrl = new URL(resp.headers.location, currentUrl);
    const revalidated = await assertPublicTarget(nextUrl.toString());
    currentUrl = nextUrl;
    currentAddresses = revalidated.addresses;
  }

  url.href = currentUrl.href;

  const body = resp.body;
  const headersLower = Object.fromEntries(
    Object.entries(resp.headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  const bodyLower = body.toLowerCase();

  const checks = {};
  let passed = 0;
  let total = 0;

  const httpsEnforced = url.protocol === 'https:';
  checks.https_enforced = { passed: httpsEnforced, description: 'Site uses HTTPS' };
  total++;
  if (httpsEnforced) passed++;

  const reachable = resp.status < 500;
  checks.reachable = {
    passed: reachable,
    description: 'Target is reachable',
    status_code: resp.status,
  };
  total++;
  if (reachable) passed++;

  const securityHeaders = {
    'strict-transport-security': 'HSTS (HTTPS enforcement header)',
    'x-frame-options': 'Clickjacking protection',
    'content-security-policy': 'Content Security Policy',
    'x-content-type-options': 'MIME sniffing protection',
    'referrer-policy': 'Referrer policy',
  };

  for (const [header, description] of Object.entries(securityHeaders)) {
    const present = header in headersLower;
    checks[`header_${header.replace(/-/g, '_')}`] = {
      passed: present,
      description,
      value: headersLower[header] || null,
    };
    total++;
    if (present) passed++;
  }

  const hasPasswordField =
    bodyLower.includes('type="password"') || bodyLower.includes("type='password'");
  checks.login_form_detected = {
    passed: hasPasswordField,
    description: 'Password input field detected (indicates login form)',
  };
  total++;
  if (hasPasswordField) passed++;

  const autocompleteGood =
    bodyLower.includes('autocomplete="new-password"') ||
    bodyLower.includes("autocomplete='new-password'") ||
    bodyLower.includes('autocomplete="off"') ||
    bodyLower.includes("autocomplete='off'");
  checks.password_autocomplete_safe = {
    passed: autocompleteGood,
    description: 'Password field has safe autocomplete attribute',
  };
  total++;
  if (autocompleteGood) passed++;

  let score = 0;
  if (httpsEnforced) score += 25;
  if (reachable) score += 10;
  const headerCount = Object.keys(securityHeaders).filter((h) => h in headersLower).length;
  score += headerCount * 10;
  if (hasPasswordField) score += 15;
  if (autocompleteGood) score += 10;

  return {
    target: url.toString(),
    login_path: loginPath,
    checks,
    summary: {
      score: Math.min(score, 100),
      total_checks: total,
      passed,
    },
  };
}
