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
import { adminMfaRequired } from '../lib/mfa.js';
import { consumeTOTPStep } from '../lib/totpReplay.js';
import { authCookieOptions, authCookieClearOptions } from '../lib/auth-cookie.js';
import { computeComplianceOverview } from '../shield/riskScore.js';
import { getQueueStats, isEmailQueueDisabled } from '../lib/email-queue.js';

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

      // bcrypt first, unconditionally, and the lockout check only after the
      // password is proven correct. Returning 423 for a locked account while
      // returning 401 for a nonexistent one enumerates valid admin accounts:
      // the attacker sends four wrong passwords and reads the status code.
      // Disclosing the lockout only on a correct password keeps the useful
      // message for whoever actually knows the password, and gives an
      // attacker nothing to distinguish.
      const passwordMatches = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);

      // A disabled account is treated exactly like a wrong password or an
      // unknown email: same status, same message, same work done, and it
      // never reaches the lockout disclosure below. Saying "this account is
      // disabled" would tell anyone holding the password which emails belong
      // to admin accounts.
      const accountUsable = Boolean(user) && !user.disabled_at;

      if (
        accountUsable &&
        user.locked_until &&
        new Date(user.locked_until) > new Date() &&
        passwordMatches
      ) {
        const remainingSec = Math.ceil((new Date(user.locked_until) - new Date()) / 1000);
        return res.status(423).json({
          error: 'Account temporarily locked due to repeated failed login attempts.',
          retryAfter: remainingSec,
        });
      }

      if (!accountUsable || !passwordMatches) {
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

      res.cookie('adminToken', token, authCookieOptions(COOKIE_MAX_AGE_MS));

      // MFA is mandatory and this admin has not enrolled: the session above can
      // only reach the enrolment endpoints (see middleware/auth.js). Tell the
      // front end to send them to the setup screen.
      res.json({
        success: true,
        email: user.email,
        ...(adminMfaRequired() ? { mfaEnrollmentRequired: true } : {}),
      });
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
  [body('mfaToken').isString().trim().notEmpty(), body('code').isString().trim().isLength({ max: 64 }).notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { verifyMfaToken, decryptSecret, matchTOTPStep, verifyBackupCode } =
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
        `SELECT id, email, role, mfa_secret, mfa_enabled, mfa_backup_codes,
                failed_login_count, locked_until, disabled_at
           FROM admin_users WHERE id = $1`,
        [mfaPayload.sub]
      );
      const user = rows[0];
      if (!user?.mfa_enabled) {
        return res.status(400).json({ error: 'MFA is not enabled for this account.' });
      }

      // A disabled account must not be able to finish a challenge issued
      // before it was disabled. Without this the mfaToken alone (which the
      // holder obtained with the password) would mint a fresh session cookie;
      // middleware/auth.js would then reject every request made with it.
      if (user.disabled_at) {
        return res.status(401).json({ error: 'Invalid or expired MFA token. Please log in again.' });
      }

      // Guessing the 6-digit code was previously bounded only by the per-IP
      // limiter, so a distributed attacker with the password could keep
      // trying. Count failures on the account with the same escalating
      // lockout as password login. This is safe to disclose because the
      // mfaToken proves the password was already correct.
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const retryAfter = Math.ceil((new Date(user.locked_until) - new Date()) / 1000);
        return res.status(423).json({
          error: 'Account temporarily locked due to repeated failed login attempts.',
          retryAfter,
        });
      }

      const secret = decryptSecret(user.mfa_secret);
      const totpStep = matchTOTPStep(secret, req.body.code);
      let codeValid = totpStep !== null;
      let usedBackup = false;

      // Try backup code if TOTP didn't match
      if (!codeValid && user.mfa_backup_codes) {
        const stored = user.mfa_backup_codes;
        const hashedCodes = JSON.parse(stored);
        const matchedIndex = await verifyBackupCode(req.body.code, hashedCodes);
        if (matchedIndex >= 0) {
          // Remove the used code with a compare-and-swap on the stored value.
          // A read-then-write let two concurrent requests redeem the same
          // backup code, each writing back its own reduced list. If another
          // request already changed the list, this one fails closed.
          const remaining = hashedCodes
            .slice(0, matchedIndex)
            .concat(hashedCodes.slice(matchedIndex + 1));
          const removal = await db.query(
            `UPDATE admin_users SET mfa_backup_codes = $1
              WHERE id = $2 AND mfa_backup_codes = $3`,
            [JSON.stringify(remaining), user.id, stored]
          );
          codeValid = removal.rowCount > 0;
          usedBackup = codeValid;
        }
      }

      if (!codeValid) {
        // Same escalation as a wrong password. A challenge that keeps being
        // guessed is indistinguishable from an attacker holding the password.
        const newCount = (user.failed_login_count || 0) + 1;
        const lockoutMinutes = computeLockoutMinutes(newCount);
        const lockedUntil =
          lockoutMinutes > 0 ? new Date(Date.now() + lockoutMinutes * 60 * 1000) : null;
        await db.query(
          'UPDATE admin_users SET failed_login_count = $1, locked_until = $2 WHERE id = $3',
          [newCount, lockedUntil, user.id]
        );

        // Log failed MFA attempt
        await recordFailedLogin(req.ip);

        if (lockedUntil) {
          return res.status(423).json({
            error: 'Account temporarily locked due to repeated failed login attempts.',
            retryAfter: Math.ceil((lockedUntil - new Date()) / 1000),
          });
        }
        return res.status(401).json({ error: 'Invalid MFA code.' });
      }

      // A TOTP code stays valid for the +/-1-step window. Burn the matched
      // step atomically so the same code cannot open a second session, even
      // if two verify requests race each other.
      if (totpStep !== null && !(await consumeTOTPStep(user.id, totpStep))) {
        return res
          .status(401)
          .json({ error: 'This code has already been used. Wait for the next code.' });
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

      // Clear any failures recorded while this challenge was being solved.
      await db.query(
        'UPDATE admin_users SET failed_login_count = 0, locked_until = NULL WHERE id = $1',
        [user.id]
      );

      // Issue full session
      const jti = crypto.randomUUID();
      const token = jwt.sign(
        { sub: user.id, email: user.email, jti, role: user.role },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
      );

      res.cookie('adminToken', token, authCookieOptions(COOKIE_MAX_AGE_MS));

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
  res.clearCookie('adminToken', authCookieClearOptions());
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
    res.json({ user, mfaEnrollmentRequired: Boolean(req.user.mfaEnrollmentRequired) });
  } catch (err) {
    console.error('[admin] /me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/me/change-password
 *
 * Admin accounts start with a temporary password chosen by whoever created
 * them, which that person therefore knows. This is the way to replace it.
 * Requires the current password, so a stolen session cookie alone is not
 * enough, and ends every existing session (middleware/auth.js compares the
 * JWT's iat with password_changed_at) before clearing this one's cookie.
 */
router.post(
  '/me/change-password',
  requireAuth,
  [
    body('currentPassword').isString().notEmpty().isLength({ max: 128 }),
    body('newPassword').isString().trim().isLength({ min: 12, max: 128 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'New password must be 12–128 characters.' });
    }

    const { currentPassword, newPassword } = req.body;
    if (currentPassword === newPassword) {
      return res
        .status(400)
        .json({ error: 'New password must be different from the current one.' });
    }

    try {
      const { rows } = await db.query('SELECT password_hash FROM admin_users WHERE id = $1', [
        req.user.sub,
      ]);
      const user = rows[0];
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
        await recordFailedLogin(req.ip);
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await db.query(
        `UPDATE admin_users
            SET password_hash = $1, password_changed_at = NOW(),
                failed_login_count = 0, locked_until = NULL
          WHERE id = $2`,
        [passwordHash, req.user.sub]
      );

      if (req.user.jti) {
        const expiresAt = req.user.exp
          ? new Date(req.user.exp * 1000)
          : new Date(Date.now() + COOKIE_MAX_AGE_MS);
        await blocklistToken(req.user.jti, expiresAt);
      }

      await recordAuditLog({
        adminEmail: req.user.email,
        action: 'admin.password_change',
        targetTable: 'admin_users',
        targetId: req.user.sub,
        oldValue: null,
        newValue: { password_changed: true },
      });

      res.clearCookie('adminToken', authCookieClearOptions());
      res.json({ success: true, message: 'Password changed. Please sign in again.' });
    } catch (err) {
      console.error('[admin] Change password error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

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
 * Contact submissions contain names, emails, companies and free-text
 * messages, so this is PII and requires the admin role. The readonly role
 * still gets the aggregate dashboard, but must not be able to read (or use
 * the search filter as an oracle over) contact records.
 */
router.get(
  '/submissions',
  requireAuth,
  requireAdmin,
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
      // Return only non-identifying columns: the deleted submission's name,
      // email and message must not be copied into audit_logs, which would
      // keep the personal data after the delete.
      const result = await db.query(
        `DELETE FROM contacts WHERE id = $1
         RETURNING id, status, created_at, (company IS NOT NULL AND company <> '') AS had_company`,
        [req.params.id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Submission not found' });
      }
      await recordAuditLog({
        adminEmail: req.user.email,
        action: 'submission.delete',
        targetTable: 'contacts',
        targetId: req.params.id,
        oldValue: {
          status: result.rows[0].status,
          had_company: result.rows[0].had_company,
          created_at: result.rows[0].created_at,
        },
        newValue: null,
      });
      res.json({ success: true });
    } catch (err) {
      console.error('[admin] Delete submission error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);
/**
 * GET /api/admin/queue-stats
 * Email-queue health for the admin dashboard. When the queue is disabled
 * (no DATABASE_URL / pg-boss unavailable) it reports { disabled: true }
 * rather than failing, so the dashboard can show a "queue off" state.
 */
router.get('/queue-stats', requireAuth, async (req, res) => {
  try {
    if (isEmailQueueDisabled()) {
      return res.json({ disabled: true });
    }
    const stats = await getQueueStats();
    const s = Array.isArray(stats) ? stats[0] : stats;
    return res.json({
      disabled: false,
      queuedCount: s?.queuedCount ?? 0,
      activeCount: s?.activeCount ?? 0,
      failedCount: s?.failedCount ?? 0,
      totalCount: s?.totalCount ?? 0,
    });
  } catch (err) {
    req.log?.error({ err }, 'queue-stats failed');
    return res.status(500).json({ error: 'Failed to load queue stats' });
  }
});

export default router;
