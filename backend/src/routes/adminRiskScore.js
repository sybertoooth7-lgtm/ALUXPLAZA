// routes/adminRiskScore.js
// Admin-facing: generate/list/revoke shareable verification links for a
// client's risk score. Mount under requireAuth at
// /api/admin/clients/:id/risk-score-shares (see index.js wiring notes).
import { Router } from 'express';
import crypto from 'crypto';
import { param, body, validationResult } from 'express-validator';
import db from '../db.js';
import { recordAuditLog } from '../middleware/auditLog.js';

const router = Router({ mergeParams: true }); // mergeParams to access :id from the parent mount

/**
 * POST /api/admin/clients/:id/risk-score-shares
 * Generates a new shareable link. Optional expiresInDays (default: no expiry).
 */
router.post(
  '/',
  [
    param('id').isInt().withMessage('Invalid client id.'),
    body('expiresInDays').optional().isInt({ min: 1, max: 730 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const token = crypto.randomBytes(24).toString('base64url'); // 32 chars, URL-safe
    const expiresAt = req.body.expiresInDays
      ? new Date(Date.now() + req.body.expiresInDays * 24 * 60 * 60 * 1000)
      : null;
    const adminEmail = req.user?.email || 'unknown';

    try {
      const result = await db.query(
        `INSERT INTO risk_score_shares (client_id, token, expires_at, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, token, created_at, expires_at`,
        [req.params.id, token, expiresAt, adminEmail]
      );
      // NOTE: token intentionally excluded from newValue — it's
      // bearer-equivalent (anyone holding it gets the share), same
      // reasoning as never logging passwords in plaintext.
      await recordAuditLog({
        adminEmail,
        action: 'risk_score_share.create',
        targetTable: 'risk_score_shares',
        targetId: result.rows[0].id,
        oldValue: null,
        newValue: { client_id: req.params.id, expires_at: expiresAt },
      });
      res.status(201).json({ share: result.rows[0] });
    } catch (err) {
      console.error('[adminRiskScore] Failed to create share link:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/admin/clients/:id/risk-score-shares?page=1&limit=25
 * Lists all share links (active and revoked) for this client.
 */
router.get('/', [param('id').isInt().withMessage('Invalid client id.')], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
  const offset = (page - 1) * limit;

  try {
    const countResult = await db.query(
      'SELECT COUNT(*) FROM risk_score_shares WHERE client_id = $1',
      [req.params.id]
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await db.query(
      `SELECT id, token, created_at, expires_at, revoked_at, created_by
       FROM risk_score_shares WHERE client_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );
    res.json({
      shares: result.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[adminRiskScore] Failed to list share links:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/clients/:id/risk-score-shares/:shareId/revoke
 */
router.post(
  '/:shareId/revoke',
  [
    param('id').isInt().withMessage('Invalid client id.'),
    param('shareId').isInt().withMessage('Invalid share id.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const result = await db.query(
        `UPDATE risk_score_shares SET revoked_at = NOW()
       WHERE id = $1 AND client_id = $2 RETURNING id`,
        [req.params.shareId, req.params.id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Share link not found.' });
      }
      await recordAuditLog({
        adminEmail: req.user?.email || 'unknown',
        action: 'risk_score_share.revoke',
        targetTable: 'risk_score_shares',
        targetId: req.params.shareId,
        oldValue: { revoked: false },
        newValue: { revoked: true },
      });
      res.json({ success: true });
    } catch (err) {
      console.error('[adminRiskScore] Failed to revoke share link:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
