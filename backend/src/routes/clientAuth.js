// backend/src/routes/clientAuth.js
import { Router } from 'express';
import * as bcrypt from '../lib/bcrypt-pool.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import db from '../db.js';
import { config } from '../config.js';
import { recordFailedLogin } from '../shield/bruteForceGuard.js';
import {
  logLoginAttempt,
  isNewIp,
  alertNewDevice,
  detectDistributedFailure,
  DUMMY_HASH,
} from '../middleware/loginAudit.js';
import { parseExpiryToMs } from '../lib/parseExpiry.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/email.js';
import { enqueueEmail } from '../lib/email-queue.js';
import { requireClientAuth } from '../middleware/clientAuth.js';

const router = Router();

// ── Constants ─────────────────────────────────────────────────────────────
const MS_PER_HOUR = 60 * 60 * 1000;
const COOKIE_MAX_AGE_MS = parseExpiryToMs(config.jwtExpiresIn, 2 * MS_PER_HOUR);
const VERIFICATION_TTL_MS = 24 * MS_PER_HOUR;
const RESET_TTL_MS = 1 * MS_PER_HOUR;
const BCRYPT_ROUNDS = 12;
const MAX_COMPANY_NAME_LENGTH = 100;

// ── Custom Error ──────────────────────────────────────────────────────────
class AuthError extends Error {
  constructor(message, statusCode = 400, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

// ── Validation ────────────────────────────────────────────────────────────
const V = {
  email: body('email').isEmail().normalizeEmail().isLength({ max: 254 }),
  password: body('password')
    .isString()
    .trim()
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8–128 characters.'),
  token: body('token').isString().trim().notEmpty().isLength({ max: 64 }),
  companyName: body('companyName')
    .isString()
    .trim()
    .notEmpty()
    .isLength({ max: MAX_COMPANY_NAME_LENGTH })
    .matches(/^[\p{L}\p{N}\s&'’\-.,]+$/u)
    .withMessage('Company name contains invalid characters.'),
};

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Invalid input.',
      details: errors.array({ onlyFirstError: true }),
    });
  }
  next();
};

const honeypot = (req, res, next) => {
  if (req.body?.website_url?.trim?.()) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  next();
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ── Transaction Helper ────────────────────────────────────────────────────
// db is this app's query wrapper (see db.js) — it has .query()/.exec()/
// .transaction()/.end(), not a raw pg.Pool, so it has no .connect(). It
// already implements exactly this BEGIN/COMMIT/ROLLBACK-with-dedicated-
// client pattern via db.transaction(); delegate to that instead of
// reimplementing it against an API this db module doesn't expose.
async function withTransaction(callback) {
  return db.transaction(callback);
}

// ── Helpers ───────────────────────────────────────────────────────────────
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function buildLink(path, token) {
  const base = (config.frontendUrl || '').replace(/\/$/, '');
  return `${base}${path}/${encodeURIComponent(token)}`;
}

function computeLockoutMinutes(count) {
  if (count <= 3) return 0;
  if (count <= 5) return 15;
  if (count <= 7) return 30;
  if (count <= 9) return 60;
  return 360; // 6 hours
}

function setAuthCookie(res, token) {
  res.cookie('clientToken', token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

function clearAuthCookie(res) {
  res.clearCookie('clientToken', {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
  });
}

const ENUM_MSG = Object.freeze({
  signup: 'If this email is not already registered, a verification link has been sent.',
  resend: 'If this account exists and is unverified, a new link has been sent.',
  resetReq: 'If this account exists, a password reset link has been sent.',
});

// ── DB Operations (extracted for testability) ─────────────────────────────
async function findClientByEmail(conn, email) {
  const result = await conn.query(
    `SELECT id, company_name, email, password_hash, email_verified,
            failed_login_count, locked_until
     FROM clients WHERE email = $1`,
    [email]
  );
  return result.rows[0] ?? null;
}

async function createClient(conn, { companyName, email, passwordHash }) {
  const result = await conn.query(
    `INSERT INTO clients (company_name, email, password_hash, email_verified)
     VALUES ($1, $2, $3, FALSE) RETURNING id`,
    [companyName, email, passwordHash]
  );
  return result.rows[0].id;
}

async function createVerificationToken(conn, clientId, tokenHash, expiresAt) {
  await conn.query(
    `INSERT INTO client_email_verifications (client_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [clientId, tokenHash, expiresAt]
  );
}

async function invalidateVerificationTokens(conn, clientId) {
  await conn.query(
    `UPDATE client_email_verifications SET used_at = NOW()
     WHERE client_id = $1 AND used_at IS NULL`,
    [clientId]
  );
}

async function fetchVerificationToken(conn, tokenHash) {
  const result = await conn.query(
    `SELECT id, client_id, expires_at, used_at
     FROM client_email_verifications WHERE token_hash = $1 FOR UPDATE`,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

async function markEmailVerified(conn, clientId) {
  await conn.query(`UPDATE clients SET email_verified = TRUE WHERE id = $1`, [clientId]);
}

async function fetchPasswordResetToken(conn, tokenHash) {
  const result = await conn.query(
    `SELECT id, client_id, expires_at, used_at
     FROM client_password_resets WHERE token_hash = $1 FOR UPDATE`,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

async function createPasswordResetToken(conn, clientId, tokenHash, expiresAt) {
  await conn.query(
    `INSERT INTO client_password_resets (client_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [clientId, tokenHash, expiresAt]
  );
}

async function invalidatePasswordResetTokens(conn, clientId) {
  await conn.query(
    `UPDATE client_password_resets SET used_at = NOW()
     WHERE client_id = $1 AND used_at IS NULL`,
    [clientId]
  );
}

async function updatePassword(conn, clientId, passwordHash) {
  await conn.query(
    `UPDATE clients
     SET password_hash = $1, failed_login_count = 0, locked_until = NULL
     WHERE id = $2`,
    [passwordHash, clientId]
  );
}

async function revokeAllSessions(conn, clientId) {
  const sessions = await conn.query(
    `SELECT jti, expires_at FROM client_sessions
     WHERE client_id = $1 AND expires_at > NOW()`,
    [clientId]
  );
  if (sessions.rows.length === 0) return;

  const jtis = sessions.rows.map((s) => s.jti);
  const expiryMap = new Map(sessions.rows.map((s) => [s.jti, s.expires_at]));

  await Promise.all([
    conn.query(
      `INSERT INTO token_blocklist (jti, expires_at)
       SELECT * FROM UNNEST($1::uuid[], $2::timestamptz[])
       ON CONFLICT (jti) DO NOTHING`,
      [jtis, jtis.map((jti) => expiryMap.get(jti))]
    ),
    conn.query(`DELETE FROM client_sessions WHERE client_id = $1`, [clientId]),
  ]);
}

async function createSession(conn, { clientId, jti, ip, userAgent, expiresAt }) {
  await conn.query(
    `INSERT INTO client_sessions (client_id, jti, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (jti) DO NOTHING`,
    [clientId, jti, ip, userAgent || null, expiresAt]
  );
}

async function blocklistToken(conn, jti, expiresAt) {
  await conn.query(
    `INSERT INTO token_blocklist (jti, expires_at) VALUES ($1, $2)
     ON CONFLICT (jti) DO NOTHING`,
    [jti, expiresAt]
  );
}

async function deleteSession(conn, jti) {
  await conn.query(`DELETE FROM client_sessions WHERE jti = $1`, [jti]);
}

// ── Routes ────────────────────────────────────────────────────────────────

router.post(
  '/signup',
  honeypot,
  [V.companyName, V.email, V.password],
  validate,
  asyncHandler(async (req, res) => {
    const { companyName, email, password } = req.body;
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    try {
      await withTransaction(async (client) => {
        const clientId = await createClient(client, { companyName, email, passwordHash });

        const rawToken = generateToken();
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

        await createVerificationToken(client, clientId, tokenHash, expiresAt);

        enqueueEmail(
          'verification',
          { email, link: buildLink('/client/verify-email', rawToken) },
          {
            fallback: () =>
              sendVerificationEmail({ email, link: buildLink('/client/verify-email', rawToken) }),
          }
        ).catch((err) => console.error('[clientAuth] Verification enqueue failed:', err.message));
      });

      res.status(200).json({ message: ENUM_MSG.signup });
    } catch (err) {
      if (err.code === '23505') {
        // Duplicate email — enumeration resistant
        return res.status(200).json({ message: ENUM_MSG.signup });
      }
      throw err;
    }
  })
);

router.post(
  '/verify-email',
  [V.token],
  validate,
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    const tokenHash = hashToken(token);

    await withTransaction(async (client) => {
      const row = await fetchVerificationToken(client, tokenHash);

      if (!row) throw new AuthError('Invalid or expired verification link.', 400);
      if (row.used_at) throw new AuthError('This verification link has already been used.', 400);
      if (new Date(row.expires_at) < new Date())
        throw new AuthError('Verification link has expired.', 400);

      // Single-use: burn every outstanding token for this client
      await client.query(
        `UPDATE client_email_verifications SET used_at = NOW() WHERE client_id = $1`,
        [row.client_id]
      );
      await markEmailVerified(client, row.client_id);
    });

    res.json({ success: true, message: 'Email verified successfully. You can now log in.' });
  })
);

router.post(
  '/resend-verification',
  [V.email],
  validate,
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    await withTransaction(async (client) => {
      const result = await client.query(
        `SELECT id, email_verified FROM clients WHERE email = $1 FOR UPDATE`,
        [email]
      );
      if (result.rows.length === 0 || result.rows[0].email_verified) return;

      const clientId = result.rows[0].id;
      await invalidateVerificationTokens(client, clientId);

      const rawToken = generateToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

      await createVerificationToken(client, clientId, tokenHash, expiresAt);

      enqueueEmail(
        'verification',
        { email, link: buildLink('/client/verify-email', rawToken) },
        {
          fallback: () =>
            sendVerificationEmail({ email, link: buildLink('/client/verify-email', rawToken) }),
        }
      ).catch((err) =>
        console.error('[clientAuth] Resend verification enqueue failed:', err.message)
      );
    });

    res.status(200).json({ message: ENUM_MSG.resend });
  })
);

router.post(
  '/password-reset/request',
  [V.email],
  validate,
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    await withTransaction(async (client) => {
      const result = await client.query(`SELECT id FROM clients WHERE email = $1 FOR UPDATE`, [
        email,
      ]);
      if (result.rows.length === 0) return;

      const clientId = result.rows[0].id;
      await invalidatePasswordResetTokens(client, clientId);

      const rawToken = generateToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TTL_MS);

      await createPasswordResetToken(client, clientId, tokenHash, expiresAt);

      enqueueEmail(
        'password-reset',
        { email, link: buildLink('/client/reset-password', rawToken) },
        {
          fallback: () =>
            sendPasswordResetEmail({ email, link: buildLink('/client/reset-password', rawToken) }),
        }
      ).catch((err) => console.error('[clientAuth] Password-reset enqueue failed:', err.message));
    });

    res.status(200).json({ message: ENUM_MSG.resetReq });
  })
);

router.post(
  '/password-reset/confirm',
  [V.token, V.password],
  validate,
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;
    const tokenHash = hashToken(token);

    await withTransaction(async (client) => {
      const row = await fetchPasswordResetToken(client, tokenHash);

      if (!row) throw new AuthError('Invalid or expired reset link.', 400);
      if (row.used_at) throw new AuthError('This reset link has already been used.', 400);
      if (new Date(row.expires_at) < new Date())
        throw new AuthError('Reset link has expired.', 400);

      const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      await revokeAllSessions(client, row.client_id);
      await client.query(`UPDATE client_password_resets SET used_at = NOW() WHERE id = $1`, [
        row.id,
      ]);
      await updatePassword(client, row.client_id, newHash);
    });

    res.json({
      success: true,
      message: 'Password updated successfully. Please log in with your new password.',
    });
  })
);

router.post(
  '/login',
  honeypot,
  [V.email, body('password').isString().trim().notEmpty().withMessage('Password is required.')],
  validate,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const client = await findClientByEmail(db, email);

    // 1. Lockout check first (saves bcrypt work + timing leak)
    // 1. Password check FIRST, and unconditionally.
    //
    // This used to check the lockout before bcrypt, on the theory that it
    // saved the hash work. That was a user-enumeration oracle in two
    // independent ways: a locked account got a 423 where a nonexistent email
    // got a 401 (status code alone enumerates valid accounts), AND a locked
    // account skipped bcrypt entirely while a nonexistent email paid the full
    // DUMMY_HASH cost (response time enumerated them too). Running bcrypt
    // first makes both paths pay the same price.
    const passwordMatches = await bcrypt.compare(password, client?.password_hash || DUMMY_HASH);

    // 2. Lockout is only disclosed once the password is proven correct.
    //
    // The legitimate user who typed the right password learns their account
    // is locked and how long is left; an attacker guessing passwords never
    // gets past this line and so cannot distinguish a locked real account
    // from one that does not exist. This is the only ordering that keeps
    // both properties, and it is the reason the check sits after bcrypt
    // rather than merely being wrapped in it.
    if (client?.locked_until && new Date(client.locked_until) > new Date() && passwordMatches) {
      const remainingSec = Math.ceil((new Date(client.locked_until) - new Date()) / 1000);
      const minutes = Math.ceil(remainingSec / 60);
      const wait =
        remainingSec < 60
          ? `${remainingSec} second${remainingSec === 1 ? '' : 's'}`
          : `${minutes} minute${minutes === 1 ? '' : 's'}`;
      throw new AuthError(
        `Account temporarily locked due to repeated failed login attempts. Try again in ${wait}.`,
        423,
        'ACCOUNT_LOCKED'
      );
    }

    if (!client || !passwordMatches) {
      await logLoginAttempt({
        clientId: client?.id ?? null,
        email,
        ip: req.ip,
        success: false,
        userAgent: req.headers['user-agent'],
      });
      await recordFailedLogin(req.ip);

      // Distributed-attack detection. Runs after the attempt is logged so it
      // can see the attempt, and is observe-only — it must not itself cause a
      // block, because on a heuristic that means locking out real customers.
      await detectDistributedFailure(client?.id ?? null, email, req.ip);

      if (client) {
        const newCount = (client.failed_login_count || 0) + 1;
        const lockoutMinutes = computeLockoutMinutes(newCount);
        const lockedUntil =
          lockoutMinutes > 0 ? new Date(Date.now() + lockoutMinutes * 60 * 1000) : null;
        await db.query(
          `UPDATE clients SET failed_login_count = $1, locked_until = $2 WHERE id = $3`,
          [newCount, lockedUntil, client.id]
        );
      }

      throw new AuthError('Invalid credentials', 401);
    }

    // 3. Email verification gate
    if (!client.email_verified) {
      throw new AuthError(
        'Please verify your email before logging in. Check your inbox for a verification link, or request a new one.',
        403,
        'EMAIL_NOT_VERIFIED'
      );
    }

    // 4. Success
    await db.query(`UPDATE clients SET failed_login_count = 0, locked_until = NULL WHERE id = $1`, [
      client.id,
    ]);

    const newDevice = await isNewIp(client.id, req.ip);
    await logLoginAttempt({
      clientId: client.id,
      email,
      ip: req.ip,
      success: true,
      userAgent: req.headers['user-agent'],
    });

    if (newDevice) {
      await alertNewDevice({
        clientId: client.id,
        email: client.email,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { sub: client.id, email: client.email, role: 'client', jti },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    await createSession(db, {
      clientId: client.id,
      jti,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      expiresAt: new Date(Date.now() + COOKIE_MAX_AGE_MS),
    });

    setAuthCookie(res, token);

    res.json({
      success: true,
      email: client.email,
      companyName: client.company_name,
      newDeviceAlert: newDevice,
    });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.clientToken;
    if (!token) return res.json({ success: true });

    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      if (decoded.jti) {
        const expiresAt = decoded.exp
          ? new Date(decoded.exp * 1000)
          : new Date(Date.now() + COOKIE_MAX_AGE_MS);
        await blocklistToken(db, decoded.jti, expiresAt);
        await deleteSession(db, decoded.jti);
      }
    } catch {
      // ignore invalid/expired token on logout
    }

    clearAuthCookie(res);
    res.json({ success: true });
  })
);

/**
 * GET /api/client/me
 * The client's own basic account info — used by ClientDashboard.tsx on
 * every mount to both confirm the session is valid and populate the
 * header. This was missing entirely; the frontend has always called it.
 */
router.get(
  '/me',
  requireClientAuth,
  asyncHandler(async (req, res) => {
    const result = await db.query('SELECT id, company_name, email FROM clients WHERE id = $1', [
      req.client.sub,
    ]);
    const client = result.rows[0];
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json({ client });
  })
);

// ── Router-level Error Handler ────────────────────────────────────────────
// If you already have a global error handler in app.js, you can remove this
// and let AuthError bubble up to it instead.
// _next must stay in the signature: Express identifies error-handling
// middleware by arity (fn.length === 4), so dropping the parameter would
// silently reclassify this as ordinary middleware and stop it ever running.
router.use((err, req, res, _next) => {
  if (err instanceof AuthError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.code && { code: err.code }),
    });
  }
  console.error('[clientAuth] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default router;
