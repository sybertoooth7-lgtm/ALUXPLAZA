// backend/src/jobs/cleanup.js
import db from '../db.js';
import { logger } from '../logger.js';
import { sweepExpiredCounters } from '../shield/bruteForceGuard.js';

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function cleanupTokenBlocklist() {
  const result = await db.query(
    `DELETE FROM token_blocklist WHERE expires_at < NOW() RETURNING jti`
  );
  if (result.rowCount > 0)
    logger.info(`[cleanup] Purged ${result.rowCount} expired token blocklist entries`);
  return result.rowCount;
}

async function cleanupClientSessions() {
  const result = await db.query(
    `DELETE FROM client_sessions WHERE expires_at < NOW() RETURNING jti`
  );
  if (result.rowCount > 0)
    logger.info(`[cleanup] Purged ${result.rowCount} expired client sessions`);
  return result.rowCount;
}

async function cleanupRateLimits() {
  const result = await db.query(`DELETE FROM rate_limits WHERE reset_time < NOW() RETURNING key`);
  if (result.rowCount > 0) logger.info(`[cleanup] Purged ${result.rowCount} stale rate-limit rows`);
  return result.rowCount;
}

async function cleanupBlockedIps() {
  const result = await db.query(
    `DELETE FROM blocked_ips WHERE expires_at < NOW() - INTERVAL '7 days' RETURNING ip_address`
  );
  if (result.rowCount > 0)
    logger.info(`[cleanup] Purged ${result.rowCount} expired IP blocks older than 7 days`);
  return result.rowCount;
}

async function cleanupLoginAttempts() {
  const result = await db.query(
    `DELETE FROM client_login_attempts WHERE created_at < NOW() - INTERVAL '90 days' RETURNING id`
  );
  if (result.rowCount > 0) logger.info(`[cleanup] Purged ${result.rowCount} old login attempts`);
  return result.rowCount;
}

// Shield's rolling-window counters. Unlike the tables above, these rows are
// only ever *read* while inside their window, so anything past the longest
// window (5 min) plus a margin is dead weight. This is the reclaim path for
// the unbounded-growth case: an attacker rotating source IPs adds a row per
// IP per minute, and without this sweep the table grows forever.
async function cleanupShieldCounters() {
  const rowCount = await sweepExpiredCounters();
  if (rowCount > 0) logger.info(`[cleanup] Purged ${rowCount} expired Shield counter buckets`);
  return rowCount;
}

export async function runCleanup() {
  logger.info('[cleanup] Starting periodic cleanup job...');
  try {
    const [tokens, sessions, rates, ips, attempts, counters] = await Promise.all([
      cleanupTokenBlocklist(),
      cleanupClientSessions(),
      cleanupRateLimits(),
      cleanupBlockedIps(),
      cleanupLoginAttempts(),
      cleanupShieldCounters(),
    ]);
    logger.info(
      `[cleanup] Complete. tokens=${tokens}, sessions=${sessions}, rateLimits=${rates}, ipBlocks=${ips}, loginAttempts=${attempts}, shieldCounters=${counters}`
    );
  } catch (err) {
    logger.error('[cleanup] Error during cleanup:', err.message);
  }
}

export function startCleanupScheduler() {
  runCleanup().catch(() => {});
  return setInterval(() => {
    runCleanup().catch(() => {});
  }, CLEANUP_INTERVAL_MS);
}
