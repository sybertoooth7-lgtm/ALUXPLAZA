// backend/src/jobs/retention.js
//
// Enforces the retention periods the privacy policy publishes
// (frontend/src/pages/PrivacyPolicy.tsx, "How long we keep it").
//
// Deleting data is irreversible, so this job is deliberately cautious:
//
//   * RETENTION_MODE controls it. The default is "dry-run": it counts what
//     WOULD be deleted and logs that, but deletes nothing. Read those log
//     lines for a few days, then set RETENTION_MODE=enforce to start deleting.
//     "off" skips the job entirely.
//   * Each rule deletes at most `maxRows` rows per run (default 500), oldest
//     first, so a mistake in a period or in the data cannot wipe a table in one
//     pass. A backlog simply drains over the following daily runs.
//   * Logs contain counts only, never names, emails or message text.
//
// The periods below MUST match the policy page. test/retention.test.js reads
// the policy source and fails if they drift apart.

import db from '../db.js';
import { logger } from '../logger.js';
import { recordAuditLog } from '../middleware/auditLog.js';

export const RETENTION = Object.freeze({
  // Contact-form messages: months since the enquiry was last updated.
  contactMonths: 12,
  // Client accounts and everything tied to them: months since the account was
  // closed (clients.disabled_at). Accounts that are not closed are never deleted.
  closedClientMonths: 24,
  // Records of actions taken by staff (audit_logs): months since written.
  auditLogMonths: 24,
});

export const DEFAULT_MAX_ROWS_PER_RUN = 500;

const MODES = ['off', 'dry-run', 'enforce'];

/**
 * Reads RETENTION_MODE. Anything unset, empty or unrecognised falls back to
 * "dry-run": a typo must never turn into deletion.
 */
export function retentionMode(raw = process.env.RETENTION_MODE) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return 'dry-run';
  const value = String(raw).trim().toLowerCase();
  if (MODES.includes(value)) return value;
  logger.warn(
    `[retention] Unrecognised RETENTION_MODE "${String(raw).slice(0, 20)}"; using dry-run. Valid: ${MODES.join(', ')}`
  );
  return 'dry-run';
}

// Table, column and clause text below is constant: nothing user-supplied is
// ever interpolated into SQL. $1 is always the period in months.
const RULES = [
  {
    key: 'contacts',
    table: 'contacts',
    months: RETENTION.contactMonths,
    // contacts.updated_at is NOT NULL and moves whenever an admin touches the row.
    where: `updated_at < NOW() - make_interval(months => $1::int)`,
    order: 'updated_at, id',
  },
  {
    key: 'closedClients',
    table: 'clients',
    months: RETENTION.closedClientMonths,
    // Deleting a client cascades to its compliance records, share links, login
    // attempts, sessions and verification/reset links (all ON DELETE CASCADE).
    where: `disabled_at IS NOT NULL AND disabled_at < NOW() - make_interval(months => $1::int)`,
    order: 'disabled_at, id',
  },
  {
    key: 'auditLogs',
    table: 'audit_logs',
    months: RETENTION.auditLogMonths,
    where: `created_at < NOW() - make_interval(months => $1::int)`,
    order: 'created_at, id',
  },
];

async function applyRule(rule, { mode, maxRows }) {
  const { rows } = await db.query(`SELECT COUNT(*) AS n FROM ${rule.table} WHERE ${rule.where}`, [
    rule.months,
  ]);
  const eligible = Number(rows[0].n);

  if (mode !== 'enforce' || eligible === 0) {
    return { eligible, deleted: 0, capped: false };
  }

  const result = await db.query(
    `DELETE FROM ${rule.table}
     WHERE id IN (
       SELECT id FROM ${rule.table} WHERE ${rule.where} ORDER BY ${rule.order} LIMIT $2
     )`,
    [rule.months, maxRows]
  );
  return { eligible, deleted: result.rowCount, capped: eligible > result.rowCount };
}

/**
 * Applies every retention rule once.
 *
 * @param {object} [options]
 * @param {'off'|'dry-run'|'enforce'} [options.mode] - defaults to RETENTION_MODE
 * @param {number} [options.maxRows] - per-rule cap for this run
 * @returns {Promise<{mode: string, results: object}>}
 */
export async function runRetention({
  mode = retentionMode(),
  maxRows = DEFAULT_MAX_ROWS_PER_RUN,
} = {}) {
  if (mode === 'off') {
    logger.info('[retention] RETENTION_MODE=off, skipping.');
    return { mode, results: {} };
  }

  const results = {};
  for (const rule of RULES) {
    results[rule.key] = await applyRule(rule, { mode, maxRows });
  }

  const summary = RULES.map((r) => {
    const x = results[r.key];
    return mode === 'enforce'
      ? `${r.key}: deleted ${x.deleted} of ${x.eligible} eligible${x.capped ? ' (capped, more next run)' : ''}`
      : `${r.key}: ${x.eligible} would be deleted`;
  }).join('; ');

  if (mode === 'dry-run') {
    logger.info(
      `[retention] DRY RUN, nothing deleted. ${summary}. Set RETENTION_MODE=enforce to start deleting.`
    );
  } else {
    logger.info(`[retention] ${summary}`);
    const anyDeleted = RULES.some((r) => results[r.key].deleted > 0);
    if (anyDeleted) {
      // A counts-only record that automatic deletion happened.
      await recordAuditLog({
        adminEmail: 'system:retention',
        action: 'retention.purge',
        newValue: {
          contacts: results.contacts.deleted,
          closed_clients: results.closedClients.deleted,
          audit_logs: results.auditLogs.deleted,
          max_rows_per_rule: maxRows,
        },
      });
    }
  }

  return { mode, results };
}
