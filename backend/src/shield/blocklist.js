// shield/blocklist.js
import db from '../db.js';
import { sendAlert } from '../monitoring.js';

const DEFAULT_BLOCK_DURATIONS = {
  low: 15 * 60 * 1000, // 15 min
  medium: 60 * 60 * 1000, // 1 hour
  high: 6 * 60 * 60 * 1000, // 6 hours
  critical: 24 * 60 * 60 * 1000, // 24 hours
};

// Only alert for severities at or above this level, so routine low/medium
// noise (a single odd request, a mild rate blip) doesn't spam the channel.
const ALERT_SEVERITIES = new Set(['high', 'critical']);

/**
 * Checks if an IP is currently blocked (and not expired).
 */
export async function isBlocked(ip) {
  const result = await db.query(
    `SELECT id FROM blocked_ips
     WHERE ip_address = $1
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [ip]
  );
  return result.rows.length > 0;
}

/**
 * Derives a stable aggregation key from a block's free-text reason.
 *
 * The `reason` string is for humans and is not aggregatable: the rate-limit
 * call sites build it with live counts interpolated in ("5 failed login
 * attempts in 5min", "100 requests in 60s (admin:42)"), so two trips of the
 * identical attack produce two different strings and would never roll up into
 * a shared false-positive rate. Call sites that know their own identity pass
 * an explicit signatureKey instead; this is the fallback for the ones that
 * don't, and it is deliberately lossy rather than clever — grouping two
 * related rate-limit reasons together is a far smaller cost than splitting
 * one reason's history across N keys.
 */
export function signatureKey(reason) {
  if (!reason) return 'unknown';
  // Strip leading counts and the parenthesised identity suffix, which are the
  // parts that vary between trips of the same underlying detection.
  return reason
    .replace(/^\d+\s+/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLowerCase();
}

/**
 * Blocks an IP automatically. blocked_ips has a plain UNIQUE(ip_address)
 * constraint (see migration 011) — one row per IP ever, not one row per
 * active block. So this always "upserts" onto that single row: a
 * previously-expired block on this IP gets its expiry pushed forward
 * again rather than a new row being created. hit_count accumulates
 * across the IP's entire history, which is useful signal (a repeat
 * offender vs. a first-time trip).
 */
export async function blockIp(ip, reason, severity = 'medium', signature = null) {
  const durationMs = DEFAULT_BLOCK_DURATIONS[severity] ?? DEFAULT_BLOCK_DURATIONS.medium;
  const expiresAt = new Date(Date.now() + durationMs);
  const key = (signature ?? signatureKey(reason)).slice(0, 255);

  await db.query(
    `INSERT INTO blocked_ips (ip_address, reason, severity, expires_at, auto_blocked, hit_count, signature_key)
     VALUES ($1, $2, $3, $4, TRUE, 1, $5)
     ON CONFLICT (ip_address)
     DO UPDATE SET
       expires_at = EXCLUDED.expires_at,
       hit_count = blocked_ips.hit_count + 1,
       reason = EXCLUDED.reason,
       severity = EXCLUDED.severity,
       signature_key = EXCLUDED.signature_key`,
    [ip, reason, severity, expiresAt, key]
  );

  // Denominator for the false-positive rate. Best-effort: if this insert
  // fails the block has already been applied, and losing a tuning counter is
  // not a reason to fail a security control. Never let it throw.
  try {
    await db.query(
      `INSERT INTO shield_signature_stats (signature_key, block_count)
       VALUES ($1, 1)
       ON CONFLICT (signature_key)
       DO UPDATE SET block_count = shield_signature_stats.block_count + 1,
                     updated_at = NOW()`,
      [key]
    );
  } catch (err) {
    console.error('[blocklist] failed to record block count for signature:', err.message);
  }

  if (ALERT_SEVERITIES.has(severity)) {
    await sendAlert(
      `🛡️ Shield auto-blocked ${ip} (${severity}): ${reason}`,
      `shield-block-${ip}-${severity}`
    );
  }
}

/**
 * Manually unblock an IP, recording the reversal as false-positive feedback.
 *
 * An admin unblocking is the only trustworthy ground truth this system gets
 * about whether a detection was wrong, and it used to be discarded: the block
 * row is overwritten on the next re-block, so a signature that misfired fifty
 * times left the same trace as one that misfired once. Recording it here is
 * what makes "which signature is actually wrong" answerable.
 *
 * The metadata is optional so existing callers keep working, but the admin
 * route should always pass it — an unblock with no admin recorded is a data
 * point nobody is accountable for, and those get ignored during tuning, which
 * defeats the purpose of collecting them.
 *
 * Never throws. An unblock is a safety action and must not fail because the
 * feedback bookkeeping did; losing a tuning counter is strictly better than
 * leaving a customer locked out of their own account.
 */
export async function unblockIp(ip, { adminEmail = null, note = null } = {}) {
  // Capture what caused the block BEFORE clearing it. blockIp() overwrites
  // this row on the next trip, so reading it afterwards would attribute the
  // feedback to whatever fired most recently.
  let prior = null;
  try {
    const found = await db.query(
      `SELECT reason, severity, auto_blocked, signature_key FROM blocked_ips WHERE ip_address = $1`,
      [ip]
    );
    prior = found.rows[0] ?? null;
  } catch (err) {
    console.error('[blocklist] failed to read block before unblock:', err.message);
  }

  // The unblock itself is the part that must succeed.
  await db.query(`UPDATE blocked_ips SET expires_at = NOW() WHERE ip_address = $1`, [ip]);

  try {
    // Prefer the key the block was WRITTEN WITH. Re-deriving it from `reason`
    // produces a different value: blockIp takes an explicit stable key
    // precisely because the reason text embeds live counts and the matched
    // pattern, so the derived form ('sqli: or 1=1--') never matches the stats
    // row the block was counted under ('sqli'). The false positive would land
    // on a key with a block_count of zero and no rate would ever roll up.
    // Fall back to the reason only for blocks predating the column.
    const key = prior ? (prior.signature_key ?? signatureKey(prior.reason)) : null;
    await db.query(
      `INSERT INTO shield_unblock_feedback
         (ip_address, signature_key, severity, auto_blocked, admin_email, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [ip, key, prior?.severity ?? null, prior?.auto_blocked ?? null, adminEmail || 'unknown', note]
    );

    if (key) {
      await db.query(
        `UPDATE shield_signature_stats
         SET false_positive_count = false_positive_count + 1, updated_at = NOW()
         WHERE signature_key = $1`,
        [key]
      );
    }
  } catch (err) {
    console.error('[blocklist] failed to record unblock feedback:', err.message);
  }
}

/**
 * Per-signature false-positive report, worst offender first.
 *
 * Reads a numerator AND a denominator on purpose. A raw unblock count is not
 * interpretable: 3 false positives is alarming for a signature that fires
 * twice a month and irrelevant for one that fires ten thousand times. The
 * rate is the signal, and the block_count is there so a human can judge
 * whether a high rate is worth acting on.
 *
 * `minBlocks` suppresses low-traffic keys, where a single false positive would
 * otherwise show as a 100% rate and crowd out the real findings. Excluded keys
 * are still counted in the response, so the report can say how much traffic it
 * is looking at in total.
 */
export async function getFalsePositiveReport({ minBlocks = 5, limit = 50 } = {}) {
  const result = await db.query(
    `SELECT s.signature_key,
            s.block_count,
            s.false_positive_count,
            ROUND(100.0 * s.false_positive_count / NULLIF(s.block_count, 0), 1) AS false_positive_pct,
            s.first_seen_at,
            s.updated_at,
            (SELECT MAX(f.admin_email) FROM shield_unblock_feedback f
              WHERE f.signature_key = s.signature_key) AS last_reviewed_by,
            (SELECT MAX(f.note) FROM shield_unblock_feedback f
              WHERE f.signature_key = s.signature_key
                AND f.created_at > NOW() - interval '7 days') AS recent_note
     FROM shield_signature_stats s
     WHERE s.block_count >= $1
     ORDER BY false_positive_pct DESC NULLS LAST, s.block_count DESC
     LIMIT $2`,
    [minBlocks, limit]
  );
  return result.rows;
}

/**
 * Addresses that have been unblocked repeatedly, with the signatures involved.
 *
 * This is the "stop and look at this" report rather than a tuning input. One
 * address unblocked three times is usually a misfiring detection or an
 * over-tight threshold, not three independent attacks, and it should be
 * examined before it is blocked a fourth time. It is deliberately a report
 * and not an automatic allowlist entry: a permanent exemption granted for
 * three unblocks is a permanent exemption an attacker could farm by tripping
 * a detection and hoping a human clicks through it.
 */
export async function getRepeatOffenders({ minUnblocks = 2, limit = 50 } = {}) {
  const result = await db.query(
    `SELECT ip_address,
            COUNT(*) AS unblock_count,
            MAX(created_at) AS last_unblocked_at,
            ARRAY_AGG(DISTINCT signature_key) FILTER (WHERE signature_key IS NOT NULL) AS signatures,
            ARRAY_AGG(DISTINCT note) FILTER (WHERE note IS NOT NULL) AS notes
     FROM shield_unblock_feedback
     GROUP BY ip_address
     HAVING COUNT(*) >= $1
     ORDER BY unblock_count DESC, last_unblocked_at DESC
     LIMIT $2`,
    [minUnblocks, limit]
  );
  return result.rows;
}

/**
 * Returns currently active blocks, most recent first — useful for an admin endpoint.
 */
export async function listActiveBlocks(limit = 100, offset = 0) {
  const result = await db.query(
    `SELECT ip_address, reason, severity, blocked_at, expires_at, hit_count
     FROM blocked_ips
     WHERE expires_at IS NULL OR expires_at > NOW()
     ORDER BY blocked_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
}

/**
 * Total count of currently active blocks — pairs with listActiveBlocks()
 * for page-based pagination (limit/offset alone can't tell the caller
 * how many pages exist).
 */
export async function countActiveBlocks() {
  const result = await db.query(
    `SELECT COUNT(*) FROM blocked_ips WHERE expires_at IS NULL OR expires_at > NOW()`
  );
  return parseInt(result.rows[0].count, 10);
}
