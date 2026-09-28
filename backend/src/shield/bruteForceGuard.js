// shield/bruteForceGuard.js
// Tracks failed-login and rapid-request patterns per IP in-memory,
// escalating to an automatic block once a threshold is crossed.
//
// NOTE: in-memory counters reset on server restart and don't share state
// across multiple instances. If Alux Plaza ever runs more than one backend
// instance, move these counts into Postgres or Redis. For a single-instance
// Railway deployment this is fine to start with.

import { blockIp } from './blocklist.js';
import { logSecurityEvent } from './eventLogger.js';

const FAILED_LOGIN_THRESHOLD = 5; // failed attempts
const FAILED_LOGIN_WINDOW_MS = 5 * 60 * 1000; // within 5 minutes
const REQUEST_RATE_THRESHOLD = 100; // requests
const REQUEST_RATE_WINDOW_MS = 60 * 1000; // within 1 minute

// Both maps are keyed by an attacker-controlled string (an IP, or a
// countKey), and a key is only ever removed when that same key comes back or
// crosses its threshold. An attacker rotating source IPs therefore leaves one
// permanent entry per IP, each holding up to threshold-1 timestamps, and the
// maps grow until the process OOMs. Capping them bounds that: past the cap we
// drop keys whose counters are already stale, then oldest-first for the rest.
//
// Because every write re-inserts (delete + set below), Map iteration order is
// least-recently-seen first, so "oldest-first" eviction is a real LRU.
const MAX_TRACKED_KEYS = 10000;

const failedLogins = new Map(); // ip -> array of timestamps
const requestCounts = new Map(); // ip -> array of timestamps

function pruneOld(timestamps, windowMs) {
  const cutoff = Date.now() - windowMs;
  return timestamps.filter((t) => t > cutoff);
}

// Keeps `map` at or below MAX_TRACKED_KEYS. Only does real work when the cap
// is exceeded, so the common case is a single size comparison.
function enforceKeyCap(map, windowMs) {
  if (map.size <= MAX_TRACKED_KEYS) return;

  const cutoff = Date.now() - windowMs;
  for (const [key, timestamps] of map) {
    if (timestamps[timestamps.length - 1] <= cutoff) map.delete(key);
    if (map.size <= MAX_TRACKED_KEYS) return;
  }

  // Still over the cap: the remaining keys are all live, so evict by recency
  // rather than dropping counters someone is still building toward.
  for (const key of map.keys()) {
    if (map.size <= MAX_TRACKED_KEYS) return;
    map.delete(key);
  }
}

// delete + set rather than set: Map preserves a key's original insertion
// position on overwrite, which would leave the order unrelated to recency.
function track(map, key, timestamps, windowMs) {
  map.delete(key);
  map.set(key, timestamps);
  enforceKeyCap(map, windowMs);
}

/**
 * Sizes of the two tracking maps. Exported so the memory bound is testable
 * and observable; the maps themselves stay private.
 */
export function trackedKeyCounts() {
  return { failedLogins: failedLogins.size, requestCounts: requestCounts.size };
}

/**
 * Call this from your login route whenever authentication fails.
 */
export async function recordFailedLogin(ip) {
  const existing = pruneOld(failedLogins.get(ip) || [], FAILED_LOGIN_WINDOW_MS);
  existing.push(Date.now());
  track(failedLogins, ip, existing, FAILED_LOGIN_WINDOW_MS);

  if (existing.length >= FAILED_LOGIN_THRESHOLD) {
    await logSecurityEvent({ ip, eventType: 'brute_force', severity: 'high', blocked: true });
    await blockIp(
      ip,
      `${existing.length} failed login attempts in ${FAILED_LOGIN_WINDOW_MS / 60000}min`,
      'high'
    );
    failedLogins.delete(ip);
    return true; // signal caller that this IP is now blocked
  }
  return false;
}

/**
 * Call this from Shield middleware on every request to track abnormal
 * volume. `countKey` is what the rolling counter buckets by — an IP for
 * anonymous traffic, or a stable per-account identity (e.g. "admin:42")
 * for authenticated traffic, so that multiple different logged-in users
 * sharing one IP (office network, VPN, mobile carrier NAT) don't get
 * counted together and collectively blocked over one person's normal
 * usage. `blockTargetIp` is always a real IP — that's what actually gets
 * blocked if the threshold is crossed, since isBlocked() below always
 * checks the request's real IP regardless of who's authenticated.
 */
export async function recordRequest(countKey, blockTargetIp) {
  const existing = pruneOld(requestCounts.get(countKey) || [], REQUEST_RATE_WINDOW_MS);
  existing.push(Date.now());
  track(requestCounts, countKey, existing, REQUEST_RATE_WINDOW_MS);

  if (existing.length >= REQUEST_RATE_THRESHOLD) {
    await logSecurityEvent({
      ip: blockTargetIp,
      eventType: 'rate_abuse',
      severity: 'medium',
      blocked: true,
    });
    await blockIp(
      blockTargetIp,
      `${existing.length} requests in ${REQUEST_RATE_WINDOW_MS / 1000}s (${countKey})`,
      'medium'
    );
    requestCounts.delete(countKey);
    return true;
  }
  return false;
}
