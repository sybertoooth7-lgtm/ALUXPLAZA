// backend/src/routes/adminUsers.js

import { Router } from 'express';
import * as bcrypt from '../lib/bcrypt-pool.js';
import crypto from 'crypto';
import { body, param, query, validationResult, matchedData } from 'express-validator';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/rbac.js';
import { recordAuditLog } from '../middleware/auditLog.js';

const router = Router();

// Cluster-wide advisory lock serialising the mutations that must not race on
// the "last usable superadmin" invariant (demote, delete, disable). Those
// checks count rows and then change one; without a lock two requests can each
// observe two active superadmins and between them remove both, leaving an
// account nobody can administer. The value is arbitrary but must be shared.
const ADMIN_ROLE_LOCK = 0x414c5558; // 'ALUX'

router.get(
  '/',
  requireAuth,
  requireSuperAdmin,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const data = matchedData(req);
    const page = data.page || 1;
    const limit = data.limit || 25;
    const offset = (page - 1) * limit;

    try {
      const countResult = await db.query('SELECT COUNT(*) FROM admin_users');
      const total = parseInt(countResult.rows[0].count, 10);

      const { rows } = await db.query(
        'SELECT id, email, role, disabled_at, created_at FROM admin_users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );
      res.json({ users: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
      console.error('[adminUsers] List error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/',
  requireAuth,
  requireSuperAdmin,
  [
    body('email').isEmail().normalizeEmail(),
    body('role').isIn(['readonly', 'admin', 'superadmin']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, role } = req.body;
    const tempPassword = crypto.randomBytes(9).toString('base64url');

    try {
      const passwordHash = await bcrypt.hash(tempPassword, 12);
      const result = await db.query(
        `INSERT INTO admin_users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role, created_at`,
        [email, passwordHash, role]
      );

      await recordAuditLog({
        adminEmail: req.user.email,
        action: 'admin_user.create',
        targetTable: 'admin_users',
        targetId: result.rows[0].id,
        oldValue: null,
        newValue: { email: result.rows[0].email, role: result.rows[0].role },
      });

      res.status(201).json({ user: result.rows[0], temporaryPassword: tempPassword });
    } catch (err) {
      if (err.code === '23505')
        return res.status(409).json({ error: 'Admin with that email already exists.' });
      console.error('[adminUsers] Create error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.patch(
  '/:id/role',
  requireAuth,
  requireSuperAdmin,
  [param('id').isInt(), body('role').isIn(['readonly', 'admin', 'superadmin'])],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const targetId = parseInt(req.params.id, 10);
    if (targetId === req.user.sub)
      return res.status(403).json({ error: 'You cannot change your own role.' });

    try {
      const outcome = await db.transaction(async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock($1::bigint)', [ADMIN_ROLE_LOCK]);

        const before = await tx.query('SELECT role FROM admin_users WHERE id = $1', [targetId]);
        if (before.rows.length === 0) return { notFound: true };

        const previousRole = before.rows[0].role;
        // Only *active* superadmins count: a disabled one cannot sign in, and
        // re-enabling requires an active superadmin, so demoting the last
        // active one while a disabled one exists would leave nobody able to
        // administer the instance. Matches the invariant in /disable below.
        if (previousRole === 'superadmin' && req.body.role !== 'superadmin') {
          const { rows: superadmins } = await tx.query(
            "SELECT COUNT(*) FROM admin_users WHERE role = 'superadmin' AND disabled_at IS NULL AND id <> $1",
            [targetId]
          );
          if (parseInt(superadmins[0].count, 10) === 0) {
            return { lastSuperadmin: true };
          }
        }

        const result = await tx.query(
          'UPDATE admin_users SET role = $1 WHERE id = $2 RETURNING id, email, role',
          [req.body.role, targetId]
        );
        return { previousRole, user: result.rows[0] };
      });

      if (outcome.notFound) return res.status(404).json({ error: 'Admin not found.' });
      if (outcome.lastSuperadmin) {
        return res.status(409).json({ error: 'Cannot demote the last remaining superadmin.' });
      }

      await recordAuditLog({
        adminEmail: req.user.email,
        action: 'admin_user.role_change',
        targetTable: 'admin_users',
        targetId,
        oldValue: { role: outcome.previousRole },
        newValue: { role: outcome.user.role },
      });

      res.json({ success: true, user: outcome.user });
    } catch (err) {
      console.error('[adminUsers] Role change error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete('/:id', requireAuth, requireSuperAdmin, [param('id').isInt()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const targetId = parseInt(req.params.id, 10);
  if (targetId === req.user.sub)
    return res.status(403).json({ error: 'You cannot delete your own account.' });

  try {
    const outcome = await db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1::bigint)', [ADMIN_ROLE_LOCK]);

      const target = await tx.query('SELECT role, disabled_at FROM admin_users WHERE id = $1', [
        targetId,
      ]);
      if (target.rows.length === 0) return { notFound: true };

      // Active only, and excluding the row about to be deleted. Deleting the
      // last *active* superadmin leaves the instance unadministerable even if
      // a disabled one still exists, because only a superadmin can re-enable.
      if (target.rows[0].role === 'superadmin') {
        const { rows: superadmins } = await tx.query(
          "SELECT COUNT(*) FROM admin_users WHERE role = 'superadmin' AND disabled_at IS NULL AND id <> $1",
          [targetId]
        );
        if (parseInt(superadmins[0].count, 10) === 0) return { lastSuperadmin: true };
      }

      const result = await tx.query(
        'DELETE FROM admin_users WHERE id = $1 RETURNING id, email, role',
        [targetId]
      );
      return { deleted: result.rows[0] };
    });

    if (outcome.notFound) return res.status(404).json({ error: 'Admin not found.' });
    if (outcome.lastSuperadmin) {
      return res.status(409).json({ error: 'Cannot delete the last remaining superadmin.' });
    }

    await recordAuditLog({
      adminEmail: req.user.email,
      action: 'admin_user.delete',
      targetTable: 'admin_users',
      targetId,
      oldValue: outcome.deleted,
      newValue: null,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[adminUsers] Delete error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/users/:id/disable
 * Disables a staff account: it can no longer be used, but nothing is deleted.
 * middleware/auth.js already rejects every request from a disabled account,
 * whatever the token's age, so setting the flag is all that is needed.
 *
 * Idempotent: disabling an already-disabled account changes nothing, so
 * disabled_at keeps its first value. The audit entry records the target's
 * email and role.
 */
router.post(
  '/:id/disable',
  requireAuth,
  requireSuperAdmin,
  [param('id').isInt()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const targetId = parseInt(req.params.id, 10);
    if (targetId === req.user.sub)
      return res.status(403).json({ error: 'You cannot disable your own account.' });

    try {
      const outcome = await db.transaction(async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock($1::bigint)', [ADMIN_ROLE_LOCK]);

        const found = await tx.query(
          'SELECT id, email, role, disabled_at FROM admin_users WHERE id = $1 FOR UPDATE',
          [targetId]
        );
        if (found.rows.length === 0) return { notFound: true };

        const target = found.rows[0];
        if (target.disabled_at) return { alreadyDisabled: true, disabledAt: target.disabled_at };

        if (target.role === 'superadmin') {
          // Only count superadmins that are still active, because disabling is
          // how one stops being usable without being deleted.
          const { rows: activeSuperadmins } = await tx.query(
            "SELECT COUNT(*) FROM admin_users WHERE role = 'superadmin' AND disabled_at IS NULL"
          );
          if (parseInt(activeSuperadmins[0].count, 10) <= 1) {
            return { lastSuperadmin: true };
          }
        }

        const disabled = await tx.query(
          'UPDATE admin_users SET disabled_at = NOW() WHERE id = $1 RETURNING disabled_at',
          [targetId]
        );
        return { alreadyDisabled: false, disabledAt: disabled.rows[0].disabled_at, target };
      });

      if (outcome.notFound) return res.status(404).json({ error: 'Admin not found.' });
      if (outcome.lastSuperadmin) {
        return res.status(409).json({ error: 'Cannot disable the last remaining superadmin.' });
      }

      if (!outcome.alreadyDisabled) {
        await recordAuditLog({
          adminEmail: req.user.email,
          action: 'admin_user.disable',
          targetTable: 'admin_users',
          targetId,
          oldValue: { email: outcome.target.email, role: outcome.target.role },
          newValue: { email: outcome.target.email, role: outcome.target.role, disabled: true },
        });
      }

      res.json({
        success: true,
        alreadyDisabled: outcome.alreadyDisabled,
        disabledAt: outcome.disabledAt,
      });
    } catch (err) {
      console.error('[adminUsers] Disable error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/admin/users/:id/enable
 * Re-enables a staff account that was disabled. The other half of
 * POST /:id/disable: without it the only way back from a disabled account
 * was editing the database.
 *
 * Idempotent: enabling an account that is not disabled changes nothing and
 * writes no audit entry. It also clears the failed-login counter and any
 * lockout, because a refused sign-in on a disabled account counts as a failed
 * login (see routes/admin.js), so a disabled account that was tried a few times
 * would otherwise come back already locked out.
 */
router.post(
  '/:id/enable',
  requireAuth,
  requireSuperAdmin,
  [param('id').isInt()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const targetId = parseInt(req.params.id, 10);

    try {
      const outcome = await db.transaction(async (tx) => {
        const found = await tx.query(
          'SELECT id, email, role, disabled_at FROM admin_users WHERE id = $1 FOR UPDATE',
          [targetId]
        );
        if (found.rows.length === 0) return { notFound: true };

        const target = found.rows[0];
        if (!target.disabled_at) return { alreadyEnabled: true };

        await tx.query(
          'UPDATE admin_users SET disabled_at = NULL, failed_login_count = 0, locked_until = NULL WHERE id = $1',
          [targetId]
        );
        return { alreadyEnabled: false, target };
      });

      if (outcome.notFound) return res.status(404).json({ error: 'Admin not found.' });

      if (!outcome.alreadyEnabled) {
        await recordAuditLog({
          adminEmail: req.user.email,
          action: 'admin_user.enable',
          targetTable: 'admin_users',
          targetId,
          oldValue: { email: outcome.target.email, role: outcome.target.role, disabled: true },
          newValue: { email: outcome.target.email, role: outcome.target.role, disabled: false },
        });
      }

      res.json({ success: true, alreadyEnabled: outcome.alreadyEnabled });
    } catch (err) {
      console.error('[adminUsers] Enable error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
