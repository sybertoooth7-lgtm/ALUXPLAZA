// backend/src/middleware/auditLog.js
//
// audit_logs table has existed since migration 007_add_audit_logs.sql —
// confirmed via `grep -r "audit_logs" backend/src/` that nothing in the
// codebase ever wrote to it. This is the missing write side.
//
// Call recordAuditLog() AFTER a mutation succeeds, not before — so a
// failed action never gets logged as if it happened.

import db from '../db.js';
import { captureError } from '../monitoring.js';

/**
 * @param {object} params
 * @param {string} params.adminEmail - req.user.email (set by requireAuth)
 * @param {string} params.action - short verb phrase, e.g. 'client.create',
 *   'submission.delete', 'ip.unblock'
 * @param {string} [params.targetTable]
 * @param {string|number} [params.targetId]
 * @param {object} [params.oldValue] - state before the mutation, or null for creates
 * @param {object} [params.newValue] - state after the mutation, or null for deletes
 */
export async function recordAuditLog({
  adminEmail,
  action,
  targetTable = null,
  targetId = null,
  oldValue = null,
  newValue = null,
}) {
  try {
    await db.query(
      `INSERT INTO audit_logs
       (admin_email, action, target_table, target_id, old_value, new_value)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        adminEmail,
        action,
        targetTable,
        targetId ?? null,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
      ]
    );
  } catch (err) {
    // Fail open on logging — a write failure here should never block or
    // roll back an admin action that already succeeded. It must not be
    // invisible either: surface it to error tracking so lost audit rows are
    // detectable. Never include adminEmail in the context.
    captureError(err, { area: 'auditLog', action, targetTable, targetId });
  }
}
