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
        'SELECT id, email, role, created_at FROM admin_users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
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
      const before = await db.query('SELECT role FROM admin_users WHERE id = $1', [targetId]);
      if (before.rows.length === 0) return res.status(404).json({ error: 'Admin not found.' });

      if (before.rows[0].role === 'superadmin' && req.body.role !== 'superadmin') {
        const { rows: superadmins } = await db.query(
          "SELECT COUNT(*) FROM admin_users WHERE role = 'superadmin'"
        );
        if (parseInt(superadmins[0].count, 10) <= 1) {
          return res.status(409).json({ error: 'Cannot demote the last remaining superadmin.' });
        }
      }

      const result = await db.query(
        'UPDATE admin_users SET role = $1 WHERE id = $2 RETURNING id, email, role',
        [req.body.role, targetId]
      );

      await recordAuditLog({
        adminEmail: req.user.email,
        action: 'admin_user.role_change',
        targetTable: 'admin_users',
        targetId,
        oldValue: { role: before.rows[0].role },
        newValue: { role: result.rows[0].role },
      });

      res.json({ success: true, user: result.rows[0] });
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
    const target = await db.query('SELECT role FROM admin_users WHERE id = $1', [targetId]);
    if (target.rows.length === 0) return res.status(404).json({ error: 'Admin not found.' });

    if (target.rows[0].role === 'superadmin') {
      const { rows: superadmins } = await db.query(
        "SELECT COUNT(*) FROM admin_users WHERE role = 'superadmin'"
      );
      if (parseInt(superadmins[0].count, 10) <= 1) {
        return res.status(409).json({ error: 'Cannot delete the last remaining superadmin.' });
      }
    }

    const result = await db.query(
      'DELETE FROM admin_users WHERE id = $1 RETURNING id, email, role',
      [targetId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Admin not found.' });

    await recordAuditLog({
      adminEmail: req.user.email,
      action: 'admin_user.delete',
      targetTable: 'admin_users',
      targetId,
      oldValue: result.rows[0],
      newValue: null,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[adminUsers] Delete error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
