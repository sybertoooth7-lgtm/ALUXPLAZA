// routes/adminClients.js
// Admin-facing: create/list clients, view any client's compliance status,
// and update individual checklist items after an assessment.
// Mount under requireAuth (your existing admin auth).
import { Router } from 'express';
import * as bcrypt from '../lib/bcrypt-pool.js';
import crypto from 'crypto';
import { body, param, query, validationResult, matchedData } from 'express-validator';
import db from '../db.js';
import { recordAuditLog } from '../middleware/auditLog.js';
import { computeRiskScoreBulk } from '../shield/riskScore.js';

const router = Router();

const VALID_STATUSES = ['pending', 'in_progress', 'passing', 'failing', 'not_applicable'];

/**
 * POST /api/admin/clients
 * Creates a new client account. Generates a random temporary password
 * and returns it once in the response — admin relays it to the client
 * out-of-band (email/call). It is never stored or logged in plaintext.
 */
router.post(
  '/',
  [body('companyName').isString().trim().notEmpty(), body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { companyName, email } = req.body;
    const tempPassword = crypto.randomBytes(9).toString('base64url'); // ~12 chars, URL-safe

    try {
      const passwordHash = await bcrypt.hash(tempPassword, 12);
      // email_verified=TRUE: an admin is vouching for this client directly,
      // so there's no verification-email step for them to complete — they
      // must be able to log in with the temp password the admin hands them.
      const result = await db.query(
        `INSERT INTO clients (company_name, email, password_hash, email_verified)
       VALUES ($1, $2, $3, TRUE)
       RETURNING id, company_name, email, created_at`,
        [companyName, email, passwordHash]
      );

      // NOTE: intentionally not logging tempPassword or passwordHash here —
      // the existing comment above already treats the plaintext temp
      // password as never-logged; keep that guarantee in the audit trail too.
      await recordAuditLog({
        adminEmail: req.user?.email || 'unknown',
        action: 'client.create',
        targetTable: 'clients',
        targetId: result.rows[0].id,
        oldValue: null,
        newValue: { company_name: result.rows[0].company_name, email: result.rows[0].email },
      });

      res.status(201).json({
        client: result.rows[0],
        temporaryPassword: tempPassword, // shown once — relay to client securely, do not log this response
      });
    } catch (err) {
      if (err.code === '23505') {
        // unique_violation
        return res.status(409).json({ error: 'A client with that email already exists.' });
      }
      console.error('[adminClients] Failed to create client:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/admin/clients?page=1&limit=25&includeScore=true
 */
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('includeScore').optional().isBoolean().toBoolean(),
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
      const countResult = await db.query('SELECT COUNT(*) FROM clients');
      const total = parseInt(countResult.rows[0].count, 10);

      const result = await db.query(
        `SELECT id, company_name, email, created_at FROM clients
       ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      let clients = result.rows;
      if (data.includeScore) {
        const scores = await computeRiskScoreBulk(clients.map((c) => c.id));
        clients = clients.map((c) => ({ ...c, ...scores.get(c.id) }));
      }

      res.json({
        clients,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (err) {
      console.error('[adminClients] Failed to list clients:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/admin/clients/:id/sessions/revoke-all
 * Admin-only: force-logout all sessions for a given client.
 */
router.post(
  '/:id/sessions/revoke-all',
  [param('id').isInt().withMessage('Invalid client id.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const clientId = req.params.id;
    const adminEmail = req.user?.email || 'unknown';

    try {
      const { rows } = await db.query(
        `SELECT jti, expires_at FROM client_sessions WHERE client_id = $1 AND expires_at > NOW()`,
        [clientId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'No active sessions found for this client.' });
      }

      await db.query('DELETE FROM client_sessions WHERE client_id = $1', [clientId]);

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      for (const row of rows) {
        await db.query(
          `INSERT INTO token_blocklist (jti, expires_at) VALUES ($1, $2)
         ON CONFLICT (jti) DO NOTHING`,
          [row.jti, expiresAt]
        );
      }

      await recordAuditLog({
        adminEmail,
        action: 'client.sessions.revoke_all',
        targetTable: 'client_sessions',
        targetId: clientId,
        oldValue: { active_sessions: rows.length },
        newValue: { active_sessions: 0 },
      });

      res.json({ success: true, revokedCount: rows.length });
    } catch (err) {
      console.error('[adminClients] Admin revoke-all failed:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/admin/clients/:id/compliance
 * Full checklist + this client's current status on each item.
 */
router.get(
  '/:id/compliance',
  [param('id').isInt().withMessage('Invalid client id.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const result = await db.query(
        `SELECT
         ci.id, ci.framework, ci.item_key, ci.title, ci.description, ci.sort_order,
         COALESCE(ccs.status, 'pending') AS status,
         ccs.notes,
         ccs.updated_by,
         ccs.updated_at
       FROM compliance_items ci
       LEFT JOIN client_compliance_status ccs
         ON ccs.item_id = ci.id AND ccs.client_id = $1
       ORDER BY ci.framework, ci.sort_order`,
        [req.params.id]
      );
      res.json({ items: result.rows });
    } catch (err) {
      console.error('[adminClients] Failed to fetch compliance status:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * PATCH /api/admin/clients/:id/compliance/:itemId
 * Updates (or creates) a client's status on a single checklist item.
 */
router.patch(
  '/:id/compliance/:itemId',
  [
    param('id').isInt().withMessage('Invalid client id.'),
    param('itemId').isInt().withMessage('Invalid item id.'),
    body('status').isIn(VALID_STATUSES),
    body('notes').optional().isString().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { status } = req.body;
    const adminEmail = req.user?.email || 'unknown';
    const notes = req.body.notes ? req.body.notes.trim() : null;

    try {
      const before = await db.query(
        'SELECT status, notes FROM client_compliance_status WHERE client_id = $1 AND item_id = $2',
        [req.params.id, req.params.itemId]
      );
      const result = await db.query(
        `INSERT INTO client_compliance_status (client_id, item_id, status, notes, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (client_id, item_id)
       DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes,
                      updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING client_id, item_id, status, notes, updated_by, updated_at`,
        [req.params.id, req.params.itemId, status, notes, adminEmail]
      );
      await recordAuditLog({
        adminEmail,
        action: 'compliance.status_update',
        targetTable: 'client_compliance_status',
        targetId: `${req.params.id}:${req.params.itemId}`,
        oldValue: before.rows[0] || null,
        newValue: { status, notes },
      });
      res.json({ success: true, status: result.rows[0] });
    } catch (err) {
      console.error('[adminClients] Failed to update compliance status:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
