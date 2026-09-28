// middleware/shieldMiddleware.js
// Drop this into your Express app EARLY in the middleware chain —
// before your routes, ideally right after body parsing, so it can
// inspect req.body/query/params before any handler runs.

import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { isBlocked, blockIp } from '../shield/blocklist.js';
import { scanRequest } from '../shield/detector.js';
import { recordRequest } from '../shield/bruteForceGuard.js';
import { logSecurityEvent } from '../shield/eventLogger.js';

// detector.js scans the ENTIRE request body/query as one blob — it can't
// tell "SELECT * FROM" apart from someone typing "we need to select a
// union representative" in a free-text field. A single match blocks that
// visitor's IP for 6+ hours.
//
// Paths listed here skip signature scanning (step 3 below) but still go
// through isBlocked() and recordRequest() — so volume-based abuse and
// already-blocked IPs are still caught.
//
// NOTE: Every path in this list MUST end with a trailing slash check
// or use .startsWith() so sub-paths are also exempt.
// Every entry here is a cost, and it is paid on every request to that path.
// These five are the only places in the app where an unauthenticated or
// semi-trusted party can submit text that is meant to be free-form. The
// exempt set was NOT widened when the signature set grew, deliberately: every
// new pattern is a new way for a legitimate message to be blocked for 6
// hours, and adding a path to this list removes the only signature-based
// protection it has. The right response to a false positive in a new place is
// to make the pattern more precise, not to exempt the path.
const SIGNATURE_SCAN_EXEMPT_PATHS = [
  '/api/contact', // public contact form (message field)
  '/api/admin/submissions', // admin search queries (search param)
  '/api/admin/clients', // compliance notes (notes field on PATCH .../compliance/:itemId)
  '/api/admin/login', // free-text email/password fields can coincidentally match signatures
  '/api/client/login', // same — a legit password shouldn't be able to trigger an IP block
];

function getClientIp(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

// Lightweight check only — verifies the JWT signature and expiry, nothing
// more. It deliberately does NOT check the token blocklist or re-fetch the
// user's role from the DB (that's real auth's job, enforced downstream by
// requireAuth/requireClientAuth on every protected route). This function
// only decides what the request-volume counter buckets by; it grants no
// access by itself. A stolen-but-revoked token still passes this check and
// gets counted under its own identity instead of the shared IP, but gets
// 401'd the moment it hits any actual protected route — so nothing here is
// a real bypass.
//
// Returns a stable per-account identity string ("admin:42" / "client:7")
// when a validly signed session cookie is present, or null for anonymous
// requests. admin_users and clients are separate tables with independently
// numbered ids, so the prefix keeps an admin id=5 and a client id=5 from
// colliding into the same counter bucket.
function getSessionIdentity(req) {
  const token = req.cookies?.adminToken || req.cookies?.clientToken;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const kind = decoded.role === 'client' ? 'client' : 'admin';
    return `${kind}:${decoded.sub}`;
  } catch {
    return null;
  }
}

export async function shield(req, res, next) {
  const ip = getClientIp(req);

  try {
    // 1. Already blocked? Reject immediately.
    if (await isBlocked(ip)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // 2. Track request volume for brute-force / rate abuse detection.
    // Anonymous requests are counted by IP, same as always. Authenticated
    // requests are counted by account identity instead — a logged-in
    // user's own usage (a dashboard page alone fires several parallel
    // calls) no longer stacks against everyone else sharing their IP
    // (office network, VPN, mobile carrier NAT). If one specific account
    // genuinely floods the server, it still gets caught and its current
    // IP still gets blocked — only the *counting* changed, not the
    // consequence.
    const identity = getSessionIdentity(req);
    const gotBlockedForRate = await recordRequest(identity || ip, ip);
    if (gotBlockedForRate) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // 3. Scan for attack signatures — skipped for free-text endpoints.
    const isExempt = SIGNATURE_SCAN_EXEMPT_PATHS.some(
      (p) => req.path === p || req.path.startsWith(p + '/')
    );
    const detection = isExempt ? null : scanRequest(req);
    if (detection) {
      await logSecurityEvent({
        ip,
        eventType: detection.eventType,
        severity: detection.severity,
        path: req.originalUrl,
        method: req.method,
        matchedPattern: detection.matchedPattern,
        snippet: detection.snippet,
        blocked: true,
      });
      await blockIp(ip, `${detection.eventType}: ${detection.matchedPattern}`, detection.severity);
      return res.status(403).json({ error: 'Request blocked.' });
    }

    next();
  } catch (err) {
    console.error('[shield] error, allowing request through:', err.message);
    next();
  }
}
