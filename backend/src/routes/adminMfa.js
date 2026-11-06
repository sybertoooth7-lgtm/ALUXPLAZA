// backend/src/routes/adminMfa.js

import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { recordAuditLog } from '../middleware/auditLog.js';
import {
  generateSecret,
  encryptSecret,
  decryptSecret,
  getOtpauthUrl,
  matchTOTPStep,
  generateBackupCodes,
  verifyBackupCode,
  adminMfaRequired,
  generateQrDataUrl,
} from '../lib/mfa.js';
import { consumeTOTPStep } from '../lib/totpReplay.js';

const router = Router();

router.post('/enroll', requireAuth, async (req, res) => {
  try {
    // Starting a new enrolment replaces the stored secret. For an account that
    // already has MFA that would let anyone holding the session (but not the
    // authenticator) swap in their own device, so it is refused.
    const current = await db.query('SELECT mfa_enabled FROM admin_users WHERE id = $1', [
      req.user.sub,
    ]);
    if (current.rows[0]?.mfa_enabled) {
      return res.status(409).json({ error: 'Two-factor authentication is already set up.' });
    }

    const secret = generateSecret();
    const encrypted = encryptSecret(secret);
    await db.query(
      `UPDATE admin_users SET mfa_secret = $1, mfa_enabled = FALSE, mfa_backup_codes = NULL, mfa_enrolled_at = NULL, mfa_last_used_step = NULL WHERE id = $2`,
      [encrypted, req.user.sub]
    );
    const otpauthUrl = getOtpauthUrl(req.user.email, secret);
    res.json({
      success: true,
      otpauthUrl,
      qrDataUrl: await generateQrDataUrl(otpauthUrl),
      manualEntryKey: secret,
    });
  } catch (err) {
    console.error('[adminMfa] Enroll error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/verify-enrollment',
  requireAuth,
  [
    body('code')
      .isString()
      .trim()
      .isLength({ min: 6, max: 6 })
      .matches(/^\d{6}$/),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { rows } = await db.query('SELECT mfa_secret FROM admin_users WHERE id = $1', [
        req.user.sub,
      ]);
      if (!rows[0]?.mfa_secret)
        return res.status(400).json({ error: 'No enrollment in progress.' });

      const secret = decryptSecret(rows[0].mfa_secret);
      if (matchTOTPStep(secret, req.body.code) === null) {
        return res.status(400).json({ error: 'Invalid code.' });
      }

      const { plaintextCodes, hashedCodes } = await generateBackupCodes();
      await db.query(
        `UPDATE admin_users SET mfa_enabled = TRUE, mfa_backup_codes = $1, mfa_enrolled_at = NOW() WHERE id = $2`,
        [JSON.stringify(hashedCodes), req.user.sub]
      );

      await recordAuditLog({
        adminEmail: req.user.email,
        action: 'mfa.enroll',
        targetTable: 'admin_users',
        targetId: req.user.sub,
        oldValue: { mfa_enabled: false },
        newValue: { mfa_enabled: true },
      });

      res.json({ success: true, backupCodes: plaintextCodes });
    } catch (err) {
      console.error('[adminMfa] Verify enrollment error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/disable',
  requireAuth,
  [body('password').isString().trim().notEmpty(), body('code').isString().trim().notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    if (adminMfaRequired()) {
      return res.status(403).json({
        error: 'Two-factor authentication is required for admin accounts and cannot be turned off.',
      });
    }

    try {
      const { rows } = await db.query(
        'SELECT password_hash, mfa_secret, mfa_enabled, mfa_backup_codes FROM admin_users WHERE id = $1',
        [req.user.sub]
      );
      const user = rows[0];
      if (!user?.mfa_enabled) return res.status(400).json({ error: 'MFA is not enabled.' });

      const bcrypt = await import('../lib/bcrypt-pool.js');
      if (!(await bcrypt.compare(req.body.password, user.password_hash))) {
        return res.status(401).json({ error: 'Invalid password.' });
      }

      const secret = decryptSecret(user.mfa_secret);
      const totpStep = matchTOTPStep(secret, req.body.code);
      let codeValid = totpStep !== null;
      let usedBackup = false;

      if (!codeValid && user.mfa_backup_codes) {
        const hashedCodes = JSON.parse(user.mfa_backup_codes);
        const idx = await verifyBackupCode(req.body.code, hashedCodes);
        if (idx >= 0) {
          codeValid = true;
          usedBackup = true;
          hashedCodes.splice(idx, 1);
          await db.query('UPDATE admin_users SET mfa_backup_codes = $1 WHERE id = $2', [
            JSON.stringify(hashedCodes),
            req.user.sub,
          ]);
        }
      }

      if (!codeValid) return res.status(401).json({ error: 'Invalid MFA code.' });
      if (totpStep !== null && !(await consumeTOTPStep(req.user.sub, totpStep))) {
        return res
          .status(401)
          .json({ error: 'This code has already been used. Wait for the next code.' });
      }

      await db.query(
        `UPDATE admin_users SET mfa_enabled = FALSE, mfa_secret = NULL, mfa_backup_codes = NULL, mfa_enrolled_at = NULL, mfa_last_used_step = NULL WHERE id = $1`,
        [req.user.sub]
      );

      await recordAuditLog({
        adminEmail: req.user.email,
        action: 'mfa.disable',
        targetTable: 'admin_users',
        targetId: req.user.sub,
        oldValue: { mfa_enabled: true },
        newValue: { mfa_enabled: false },
      });

      res.json({
        success: true,
        message: usedBackup ? 'MFA disabled (backup code used).' : 'MFA disabled.',
      });
    } catch (err) {
      console.error('[adminMfa] Disable error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/regenerate-backup-codes',
  requireAuth,
  [
    body('code')
      .isString()
      .trim()
      .isLength({ min: 6, max: 6 })
      .matches(/^\d{6}$/),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { rows } = await db.query(
        'SELECT mfa_secret, mfa_enabled FROM admin_users WHERE id = $1',
        [req.user.sub]
      );
      if (!rows[0]?.mfa_enabled) return res.status(400).json({ error: 'MFA is not enabled.' });

      const secret = decryptSecret(rows[0].mfa_secret);
      if (matchTOTPStep(secret, req.body.code) === null) {
        return res.status(401).json({ error: 'Invalid MFA code.' });
      }

      const { plaintextCodes, hashedCodes } = await generateBackupCodes();
      await db.query('UPDATE admin_users SET mfa_backup_codes = $1 WHERE id = $2', [
        JSON.stringify(hashedCodes),
        req.user.sub,
      ]);

      await recordAuditLog({
        adminEmail: req.user.email,
        action: 'mfa.regenerate_backup_codes',
        targetTable: 'admin_users',
        targetId: req.user.sub,
        oldValue: null,
        newValue: { backup_codes_regenerated: true },
      });

      res.json({ success: true, backupCodes: plaintextCodes });
    } catch (err) {
      console.error('[adminMfa] Regenerate error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get('/status', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT mfa_enabled, mfa_enrolled_at FROM admin_users WHERE id = $1',
      [req.user.sub]
    );
    res.json({
      mfaEnabled: rows[0]?.mfa_enabled || false,
      enrolledAt: rows[0]?.mfa_enrolled_at || null,
    });
  } catch (err) {
    console.error('[adminMfa] Status error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
