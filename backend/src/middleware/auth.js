// backend/src/middleware/auth.js
// Admin authentication with hardened token validation and audit logging.
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

// Maximum token age (in seconds) — additional to JWT exp claim
// This catches tokens that were issued legitimately but are considered
// stale by security policy, separate from the JWT expiry itself.
const MAX_TOKEN_AGE_SECONDS = 24 * 60 * 60; // 24 hours

export async function blocklistToken(jti, expiresAt) {
  if (!jti) return;
  try {
    await db.query(
      `INSERT INTO token_blocklist (jti, expires_at) VALUES ($1, $2) ON CONFLICT (jti) DO NOTHING`,
      [jti, expiresAt]
    );
  } catch (err) {
    logger.error({ error: err.message, jti }, '[auth] Failed to blocklist token');
  }
}

export async function isBlocklisted(jti) {
  if (!jti) return false;
  try {
    // Check both that the token is in the blocklist AND that it hasn't expired yet.
    // Without the expiry check, a revoked token would stay blocked forever, wasting
    // space in the table. With it, the cleanup job can safely delete expired rows
    // without worrying about unintentionally un-blocking tokens.
    const result = await db.query(
      'SELECT 1 FROM token_blocklist WHERE jti = $1 AND expires_at > NOW()',
      [jti]
    );
    return result.rows.length > 0;
  } catch (err) {
    logger.error({ error: err.message, jti }, '[auth] Blocklist check failed');
    // Fail open on error, but log it. Blocking the user is worse than momentarily
    // allowing a revoked token in a race condition.
    return false;
  }
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.adminToken || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    logger.warn({ ip: req.ip, path: req.path }, '[auth] No token provided');
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch (err) {
    logger.warn({ ip: req.ip, error: err.message }, '[auth] Token verification failed');
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  // Verify the token claims are well-formed
  if (!decoded.sub || !decoded.role) {
    logger.warn(
      { ip: req.ip, sub: decoded.sub, role: decoded.role },
      '[auth] Token claims incomplete'
    );
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  // Check token age against policy maximum, separate from JWT expiry
  const now = Math.floor(Date.now() / 1000);
  const issuedAt = decoded.iat || decoded.exp - 60 * 60; // assume 1hr lifetime if iat missing
  if (now - issuedAt > MAX_TOKEN_AGE_SECONDS) {
    logger.warn(
      { ip: req.ip, sub: decoded.sub, age: now - issuedAt },
      '[auth] Token exceeds max age policy'
    );
    return res.status(401).json({ error: 'Unauthorized: Token too old' });
  }

  // Wrong token type: client token on admin route
  if (decoded.role === 'client') {
    logger.warn({ ip: req.ip, sub: decoded.sub }, '[auth] Client token used on admin route');
    return res.status(401).json({ error: 'Unauthorized: Wrong token type' });
  }

  // Token was explicitly revoked
  if (decoded.jti && (await isBlocklisted(decoded.jti))) {
    logger.warn({ ip: req.ip, sub: decoded.sub, jti: decoded.jti }, '[auth] Revoked token used');
    return res.status(401).json({ error: 'Unauthorized: Token has been revoked' });
  }

  // Verify the user still exists and fetch current role from DB
  try {
    const { rows } = await db.query('SELECT role, disabled_at FROM admin_users WHERE id = $1', [
      decoded.sub,
    ]);
    if (rows.length === 0) {
      logger.warn({ ip: req.ip, sub: decoded.sub }, '[auth] User account no longer exists');
      return res.status(401).json({ error: 'Unauthorized: Account no longer exists' });
    }
    const user = rows[0];
    // Check if account was disabled since token was issued
    if (user.disabled_at && new Date(user.disabled_at) < new Date(decoded.iat * 1000)) {
      logger.warn(
        { ip: req.ip, sub: decoded.sub, disabledAt: user.disabled_at },
        '[auth] Disabled account used'
      );
      return res.status(401).json({ error: 'Unauthorized: Account has been disabled' });
    }
    // Use DB role, not token role (in case permissions were revoked)
    decoded.role = user.role;
  } catch (err) {
    logger.error({ error: err.message, sub: decoded.sub }, '[auth] Failed to fetch user role');
    return res.status(500).json({ error: 'Internal server error' });
  }

  req.token = token;
  req.user = decoded;
  next();
}
