// shield/bruteForceGuard.js
// Tracks failed-login and request-volume patterns per identity, escalating to
// an automatic IP block once a threshold is crossed.
//
// Counters live in Postgres (migration 024), not in process memory. The
// previous in-memory Maps had two failure modes worth naming, because both
// were exploitable rather than merely inefficient:
//
//   1. They reset on deploy and restart. An attacker who can time a restart —
//      or who simply keeps one in their back pocket for later — gets a fresh
//      5-strike budget every time, forever, with no way to accumulate toward
//      a block.
//   2. They were invisible to every other instance. Against N instances the
//      effective limit was 5xN (or 100xN), reached by spreading one attempt
//      per instance.
//
// Postgres was already required for auth, the blocklist, and the other rate
// limiters in this app, so the counters join it rather than adding a Redis
// deployment to the project.
//
// The counting key is NOT always an IP. Authenticated requests bucket by
// account identity (see shieldMiddleware.js) so that a dashboard page firing
// several parallel calls doesn't stack against everyone behind the same
// office NAT, VPN, or carrier CGNAT. The IP that actually gets blocked is
// always a real IP, and isBlocked() always checks the request's real IP.

import db from '../db.js';
import { blockIp } from './blocklist.js';
import { logSecurityEvent } from './eventLogger.js';

const FAILED_LOGIN_THRESHOLD = 5; // failed attempts
const FAILED_LOGIN_WINDOW_MS = 5 * 60 * 1000; // within 5 minutes
const REQUEST_RATE_THRESHOLD = 100; // requests
const REQUEST_RATE_WINDOW_MS = 60 * 1000; // within 1 minute

// Metric names, stored in shield_counters.metric so the two counter classes
// can't share a total.
const METRIC_FAILED_LOGIN = 'failed_login';
const METRIC_REQUEST = 'request_volume';

// Bucket width. See migration 024 for why this is a fixed 60s rather than
// tracking each metric's own window.
const BUCKET_SECONDS = 60;

// The longest window any caller asks for is 5 minutes, so a bucket can never
// be older than the newest window it still contributes to. Sweeping older
// buckets is therefore always safe: nothing queries them again.
const SWEEP_MAX_AGE_MS = 10 * 60 * 1000;

// The counter key is attacker-controlled (an IP, or an identity built from a
// JWT sub). Truncated to fit the column and to keep a single pathological
// value from dominating the table. Truncation is a collision risk in
// principle; at 255 chars it needs an attacker to send a ~255-char IP or
// identity, which neither Express nor the JWT issuer produces.
const MAX_KEY_LENGTH = 255;

function clampKey(key) {
  const s = String(key);
  return s.length > MAX_KEY_LENGTH ? s.slice(0, MAX_KEY_LENGTH) : s;
}

/**
 * Increments the rolling-window counter for (metric, key) and returns the
 * total across all buckets still inside `windowMs`.
 *
 * The current bucket's post-increment count is taken from the CTE's
 * RETURNING, and only the OLDER buckets are summed from the table. That split
 * is not a style choice — it is forced by how PostgreSQL evaluates a
 * data-modifying CTE: `bumped` and the main query share a single snapshot, so
 * the main query cannot see the row `bumped` just inserted or updated.
 * Reading the whole window from the table therefore returns the count as it
 * stood *before* this request, and the threshold trips one hit late (the 5th
 * failed login returning 4, the 100th request returning 99). RETURNING is the
 * only channel that reports the CTE's own effect.
 *
 * The increment itself is still safe under concurrency: ON CONFLICT DO UPDATE
 * with `count = shield_counters.count + 1` is atomic per row, so no two
 * concurrent requests can lose an increment. The read is a snapshot, so two
 * requests landing simultaneously on the threshold can both decide not to
 * block — bounded by one missed trip, not a systematically-off counter.
 */
async function incrementAndCount(metric, key, windowMs) {
  const result = await db.query(
    `     WITH b AS (
       -- The cast to double precision is load-bearing, not decoration:
       -- extract() returns numeric on PostgreSQL 14+ and double precision
       -- before it, and to_timestamp() only accepts double precision, so
       -- without the explicit cast this query works on PG13 and fails on
       -- PG14. Pin the type instead of inheriting it from the server version.
       SELECT to_timestamp(
         (floor(extract(epoch from now()) / $3) * $3)::double precision
       ) AS bucket_start
     ),
     bumped AS (
       INSERT INTO shield_counters (counter_key, metric, bucket_start, count)
       SELECT $1, $2, b.bucket_start, 1 FROM b
       ON CONFLICT (metric, counter_key, bucket_start)
       DO UPDATE SET count = shield_counters.count + 1, updated_at = now()
       RETURNING count
     )
     SELECT (
       (SELECT count FROM bumped)
       + COALESCE((
           SELECT SUM(sc.count)
           FROM shield_counters sc, b
           WHERE sc.metric = $2
             AND sc.counter_key = $1
             AND sc.bucket_start > now() - ($4 || ' milliseconds')::interval
             AND sc.bucket_start <> b.bucket_start
         ), 0)
     )::int AS total`,
    [clampKey(key), metric, BUCKET_SECONDS, String(windowMs)]
  );
  return result.rows[0].total;
}

/**
 * Drops all buckets for a (metric, key) pair. Called after a block so the
 * next request starts from zero rather than from the count that tripped the
 * threshold — the block itself is the punishment, and re-tripping it every
 * request would keep alerting.
 */
async function clearCounters(metric, key) {
  await db.query('DELETE FROM shield_counters WHERE metric = $1 AND counter_key = $2', [
    metric,
    clampKey(key),
  ]);
}

/**
 * Counts of currently-tracked counter keys, per metric. Exported for tests
 * and for observability — notably, the count of *distinct keys*, which is
 * the thing that used to grow without bound when an attacker rotated source
 * IPs and left one permanent Map entry per IP.
 */
export async function trackedKeyCounts() {
  const result = await db.query(
    'SELECT metric, COUNT(DISTINCT counter_key)::int AS keys FROM shield_counters GROUP BY metric'
  );
  const counts = { failedLogin: 0, requestVolume: 0 };
  for (const row of result.rows) {
    if (row.metric === METRIC_FAILED_LOGIN) counts.failedLogin = row.keys;
    if (row.metric === METRIC_REQUEST) counts.requestVolume = row.keys;
  }
  return counts;
}

/**
 * Call this from your login route whenever authentication fails.
 *
 * Fails open on a database error: an unavailable counter store must not lock
 * every user out of the login page. The per-account lockout in the login
 * routes themselves (clients.failed_login_count / admin_users.failed_login_count,
 * migrations 015 and 017) is the durable backstop for exactly this case, and
 * it lives in the same database — so if the DB is down, login is down anyway
 * and this returns false rather than adding a second failure mode.
 */
export async function recordFailedLogin(ip) {
  try {
    const total = await incrementAndCount(METRIC_FAILED_LOGIN, ip, FAILED_LOGIN_WINDOW_MS);

    if (total >= FAILED_LOGIN_THRESHOLD) {
      await logSecurityEvent({ ip, eventType: 'brute_force', severity: 'high', blocked: true });
      await blockIp(
        ip,
        `${total} failed login attempts in ${FAILED_LOGIN_WINDOW_MS / 60000}min`,
        'high',
        // Explicit key: `total` is interpolated into the human-readable reason
        // and changes every trip, so without this the same attack would
        // register as a new signature each time and its false-positive history
        // could never accumulate.
        'brute_force'
      );
      await clearCounters(METRIC_FAILED_LOGIN, ip);
      return true; // signal caller that this IP is now blocked
    }
    return false;
  } catch (err) {
    console.error(
      '[bruteForceGuard] recordFailedLogin counter unavailable, failing open:',
      err.message
    );
    return false;
  }
}

/**
 * Call this from Shield middleware on every request to track abnormal
 * volume. `countKey` is what the rolling counter buckets by — an IP for
 * anonymous traffic, or a stable per-account identity (e.g. "admin:42")
 * for authenticated traffic. `blockTargetIp` is always a real IP — that's
 * what actually gets blocked if the threshold is crossed, since isBlocked()
 * always checks the request's real IP regardless of who's authenticated.
 *
 * Also fails open, for a sharper reason than the login path: this runs on
 * EVERY request for EVERY user, so throwing here would turn a transient
 * database hiccup into a total outage. A missed block is recoverable; a
 * downed app is not.
 */
export async function recordRequest(countKey, blockTargetIp) {
  try {
    const total = await incrementAndCount(METRIC_REQUEST, countKey, REQUEST_RATE_WINDOW_MS);

    if (total >= REQUEST_RATE_THRESHOLD) {
      await logSecurityEvent({
        ip: blockTargetIp,
        eventType: 'rate_abuse',
        severity: 'medium',
        blocked: true,
      });
      await blockIp(
        blockTargetIp,
        `${total} requests in ${REQUEST_RATE_WINDOW_MS / 1000}s (${countKey})`,
        'medium',
        // Explicit key, and deliberately NOT keyed by countKey. countKey is the
        // identity being counted ("admin:42", "ip:1.2.3.4"), so including it
        // would give every user their own signature and a bad threshold would
        // show up as a scattering of 100%-false-positive keys rather than one
        // row saying "rate_abuse is misfiring".
        'rate_abuse'
      );
      await clearCounters(METRIC_REQUEST, countKey);
      return true;
    }
    return false;
  } catch (err) {
    console.error(
      '[bruteForceGuard] recordRequest counter unavailable, failing open:',
      err.message
    );
    return false;
  }
}

/**
 * Deletes buckets that no window can still reach, and rows whose whole
 * history is expired. Called by the daily cleanup job.
 *
 * The per-bucket DELETE is the part that matters for unbounded growth: an
 * attacker rotating source IPs creates one row per IP per minute, and
 * without this those rows are never reclaimed. Ordering is oldest-first via
 * the index, so a large table drains fastest on the oldest pages.
 */
export async function sweepExpiredCounters() {
  const result = await db.query(
    `DELETE FROM shield_counters
     WHERE bucket_start < now() - ($1 || ' milliseconds')::interval`,
    [String(SWEEP_MAX_AGE_MS)]
  );
  return result.rowCount;
}
