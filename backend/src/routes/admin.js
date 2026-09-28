import { Router } from 'express';
import * as bcrypt from '../lib/bcrypt-pool.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { body, param, query, validationResult, matchedData } from 'express-validator';
import db from '../db.js';
import { config } from '../config.js';
import { requireAuth, blocklistToken, isBlocklisted } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';
import { recordFailedLogin } from '../shield/bruteForceGuard.js';
import { recordAuditLog } from '../middleware/auditLog.js';
import { parseExpiryToMs } from '../lib/parseExpiry.js';
import { computeComplianceOverview } from '../shield/riskScore.js';

const router = Router();

// A precomputed bcrypt hash of a random value, compared against on every
// login attempt regardless of whether the email exists — otherwise a
// nonexistent email skips bcrypt.compare entirely and responds noticeably
// faster than a wrong password, leaking which emails are registered.
const DUMMY_HASH = '$2b$12$c.ByGOhklqTXtY6UiWrCieVW3v1ZsI5tlBj/MfE9V92LjUYa9iuHu';

const VALID_STATUSES = ['new', 'read', 'replied', 'archived'];

// Per-account lockout, mirroring clientAuth.js's — see the comment in
// migrations/017_add_admin_lockout.sql for why this exists and why the
// numbers are deliberately much shorter than the client version.
const MAX_FAILED_ATTEMPTS = 5;
const BASE_LOCKOUT_MINUTES = 5;
const MAX_LOCKOUT_MINUTES = 30;

function computeLockoutMinutes(failedCount) {
  if (failedCount < MAX_FAILED_ATTEMPTS) return 0;
  const minutes = BASE_LOCKOUT_MINUTES * Math.pow(2, failedCount - MAX_FAILED_ATTEMPTS);
  return Math.min(minutes, MAX_LOCKOUT_MINUTES);
}

const COOKIE_MAX_AGE_MS = parseExpiryToMs(config.jwtExpiresIn, 8 * 60 * 60 * 1000);

/**
 * POST /api/admin/login
 * MFA-aware: if MFA is enabled, returns an mfaToken instead of the full session.
 * The client must POST /api/admin/mfa/verify with the mfaToken + TOTP code
 * to receive the real adminToken cookie.
 */
router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').isString().trim().notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const { email, password } = req.body;

    try {
      const result = await db.query('SELECT * FROM admin_users WHERE email = $1', [email]);
      const user = result.rows[0];

      // === TIMING-SAFE: Always run bcrypt first ===
      // This keeps response timing constant regardless of whether the email
      // exists or the account is locked, preventing user enumeration.
      const passwordMatches = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);

      // NOW check lockout (after bcrypt, so timing is constant)
      if (user?.locked_until && new Date(user.locked_until) > new Date()) {
        const remainingSec = Math.ceil((new Date(user.locked_until) - new Date()) / 1000);
        return res.status(423).json({
          error: 'Account temporarily locked due to repeated failed login attempts.',
          retryAfter: remainingSec,
        });
      }

      if (!user || !passwordMatches) {
        if (user) {
          const newCount = (user.failed_login_count || 0) + 1;
          const lockoutMinutes = computeLockoutMinutes(newCount);
          const lockedUntil =
            lockoutMinutes > 0 ? new Date(Date.now() + lockoutMinutes * 60 * 1000) : null;
          await db.query(
            'UPDATE admin_users SET failed_login_count = $1, locked_until = $2 WHERE id = $3',
            [newCount, lockedUntil, user.id]
          );
        }
        const nowBlocked = await recordFailedLogin(req.ip);
        if (nowBlocked) {
          return res.status(403).json({ error: 'Too many failed attempts. Access denied.' });
        }
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Successful password auth — reset failure counter
      await db.query(
        'UPDATE admin_users SET failed_login_count = 0, locked_until = NULL WHERE id = $1',
        [user.id]
      );

      // === MFA CHECK ===
      if (user.mfa_enabled && user.mfa_secret) {
        const { generateMfaToken } = await import('../lib/mfa.js');
        const mfaToken = generateMfaToken(user.id, user.email);
        return res.json({
          mfaRequired: true,
          mfaToken,
          message:
            'MFA required. POST /api/admin/mfa/verify with this mfaToken and your TOTP code.',
        });
      }

      // No MFA — issue full session immediately
      const jti = crypto.randomUUID();
      const token = jwt.sign(
        { sub: user.id, email: user.email, jti, role: user.role },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
      );

      res.cookie('adminToken', token, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'strict',
        maxAge: COOKIE_MAX_AGE_MS,
      });

      res.json({ success: true, email: user.email });
    } catch (err) {
      console.error('[admin] Login error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/admin/mfa/verify
 * Step 2 of MFA login: verify TOTP code (or backup code) and issue full session.
 */
router.post(
  '/mfa/verify',
  [body('mfaToken').isString().trim().notEmpty(), body('code').isString().trim().notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { verifyMfaToken, decryptSecret, verifyTOTP, verifyBackupCode } =
        await import('../lib/mfa.js');
      const mfaPayload = verifyMfaToken(req.body.mfaToken);
      if (!mfaPayload) {
        return res
          .status(401)
          .json({ error: 'Invalid or expired MFA token. Please log in again.' });
      }

      // Reject replay of an already-completed (or already-attempted) MFA
      // challenge. Without this, anyone who captures a successful verify
      // request (network capture, browser history, a compromised proxy)
      // could resend the exact same mfaToken + code to open a second
      // session, any time within the token's 5-minute window.
      if (mfaPayload.jti && (await isBlocklisted(mfaPayload.jti))) {
        return res
          .status(401)
          .json({ error: 'This MFA challenge has already been used. Please log in again.' });
      }

      const { rows } = await db.query(
        'SELECT id, email, role, mfa_secret, mfa_enabled, mfa_backup_codes FROM admin_users WHERE id = $1',
        [mfaPayload.sub]
      );
      const user = rows[0];
      if (!user?.mfa_enabled) {
        return res.status(400).json({ error: 'MFA is not enabled for this account.' });
      }

      const secret = decryptSecret(user.mfa_secret);
      let codeValid = verifyTOTP(secret, req.body.code);
      let usedBackup = false;

      // Try backup code if TOTP didn't match
      if (!codeValid && user.mfa_backup_codes) {
        const hashedCodes = JSON.parse(user.mfa_backup_codes);
        const matchedIndex = await verifyBackupCode(req.body.code, hashedCodes);
        if (matchedIndex >= 0) {
          codeValid = true;
          usedBackup = true;
          // Remove used backup code
          hashedCodes.splice(matchedIndex, 1);
          await db.query('UPDATE admin_users SET mfa_backup_codes = $1 WHERE id = $2', [
            JSON.stringify(hashedCodes),
            user.id,
          ]);
        }
      }

      if (!codeValid) {
        // Log failed MFA attempt
        await recordFailedLogin(req.ip);
        return res.status(401).json({ error: 'Invalid MFA code.' });
      }

      // Mark this MFA challenge as consumed so it can never be used again —
      // turns a 5-minute-reusable token into a genuinely single-use one.
      // Only marked on success: a mistyped code should still let the user
      // try again within the same challenge window.
      if (mfaPayload.jti) {
        const expiresAt = mfaPayload.exp
          ? new Date(mfaPayload.exp * 1000)
          : new Date(Date.now() + 5 * 60 * 1000);
        await blocklistToken(mfaPayload.jti, expiresAt);
      }

      // Issue full session
      const jti = crypto.randomUUID();
      const token = jwt.sign(
        { sub: user.id, email: user.email, jti, role: user.role },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
      );

      res.cookie('adminToken', token, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'strict',
        maxAge: COOKIE_MAX_AGE_MS,
      });

      res.json({
        success: true,
        email: user.email,
        usedBackupCode: usedBackup,
        warning: usedBackup
          ? 'You used a backup code. Consider regenerating them from your settings.'
          : undefined,
      });
    } catch (err) {
      console.error('[admin] MFA verify error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/admin/logout
 */
router.post('/logout', requireAuth, async (req, res) => {
  if (req.user?.jti) {
    const expiresAt = req.user.exp
      ? new Date(req.user.exp * 1000)
      : new Date(Date.now() + COOKIE_MAX_AGE_MS);
    await blocklistToken(req.user.jti, expiresAt);
  }
  res.clearCookie('adminToken');
  res.json({ success: true });
});

/**
 * GET /api/admin/me
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, role, created_at FROM admin_users WHERE id = $1',
      [req.user.sub]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (err) {
    console.error('[admin] /me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/compliance-overview
 * Platform-wide summary for the admin dashboard: total clients, average
 * score, and a count of clients per score band. Aggregate-only — never
 * returns per-client rows, so this stays cheap regardless of client count.
 */
router.get('/compliance-overview', requireAuth, async (_req, res) => {
  try {
    const overview = await computeComplianceOverview();
    res.json(overview);
  } catch (err) {
    console.error('[admin] /compliance-overview error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/submissions
 */
router.get(
  '/submissions',
  requireAuth,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(VALID_STATUSES),
    query('search').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const data = matchedData(req);
    const page = data.page || 1;
    const limit = data.limit || 20;
    const offset = (page - 1) * limit;
    const status = data.status;
    const search = data.search;

    try {
      let whereClause = 'WHERE 1=1';
      const params = [];
      let pIdx = 1;

      if (status) {
        whereClause += ` AND status = $${pIdx++}`;
        params.push(status);
      }
      if (search) {
        whereClause += ` AND (name ILIKE $${pIdx} OR email ILIKE $${pIdx} OR company ILIKE $${pIdx} OR message ILIKE $${pIdx})`;
        params.push(`%${search}%`);
        pIdx++;
      }

      const countResult = await db.query(`SELECT COUNT(*) FROM contacts ${whereClause}`, params);
      const total = parseInt(countResult.rows[0].count, 10);

      const dataResult = await db.query(
        `SELECT * FROM contacts ${whereClause} ORDER BY created_at DESC LIMIT $${pIdx++} OFFSET $${pIdx++}`,
        [...params, limit, offset]
      );

      res.json({
        data: dataResult.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (err) {
      console.error('[admin] Submissions error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * PATCH /api/admin/submissions/:id/status
 * Admin-only mutation
 */
router.patch(
  '/submissions/:id/status',
  requireAuth,
  requireAdmin,
  [
    param('id').isInt().withMessage('Invalid submission id.'),
    body('status').isIn(VALID_STATUSES).withMessage('Invalid status value.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const before = await db.query('SELECT status FROM contacts WHERE id = $1', [req.params.id]);
      const result = await db.query(
        'UPDATE contacts SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [req.body.status, req.params.id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Submission not found' });
      }
      await recordAuditLog({
        adminEmail: req.user.email,
        action: 'submission.status_update',
        targetTable: 'contacts',
        targetId: req.params.id,
        oldValue: before.rows[0] ? { status: before.rows[0].status } : null,
        newValue: { status: req.body.status },
      });
      res.json({ success: true, submission: result.rows[0] });
    } catch (err) {
      console.error('[admin] Update status error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/admin/submissions/:id
 * Admin-only mutation
 */
router.delete(
  '/submissions/:id',
  requireAuth,
  requireAdmin,
  [param('id').isInt().withMessage('Invalid submission id.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const result = await db.query('DELETE FROM contacts WHERE id = $1 RETURNING *', [
        req.params.id,
      ]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Submission not found' });
      }
      await recordAuditLog({
        adminEmail: req.user.email,
        action: 'submission.delete',
        targetTable: 'contacts',
        targetId: req.params.id,
        oldValue: result.rows[0],
        newValue: null,
      });
      res.json({ success: true });
    } catch (err) {
      console.error('[admin] Delete submission error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
