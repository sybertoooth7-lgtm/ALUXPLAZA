// backend/src/middleware/clientAuth.js
// Client authentication with hardened token validation separate from admin auth.
// Mirrors admin auth (backend/src/middleware/auth.js) but issues a separate cookie
// and requires `role: 'client'` claim, so a stolen client token can't be replayed
// against admin routes (and vice versa) even though both are signed with the same JWT_SECRET.

import jwt from 'jsonwebtoken';
import db from '../db.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const MAX_TOKEN_AGE_SECONDS = 24 * 60 * 60; // 24 hours

export async function blocklistClientToken(jti, expiresAt) {
  if (!jti) return;
  try {
    await db.query(
      `INSERT INTO token_blocklist (jti, expires_at) VALUES ($1, $2)
       ON CONFLICT (jti) DO NOTHING`,
      [jti, expiresAt]
    );
  } catch (err) {
    logger.error({ error: err.message, jti }, '[clientAuth] Failed to blocklist token');
  }
}

async function isBlocklisted(jti) {
  if (!jti) return false;
  try {
    // Check both blocklist membership AND expiry. Stale entries will be cleaned up
    // by a scheduled job and won't stay blocked indefinitely.
    const result = await db.query(
      'SELECT 1 FROM token_blocklist WHERE jti = $1 AND expires_at > NOW()',
      [jti]
    );
    return result.rows.length > 0;
  } catch (err) {
    logger.error({ error: err.message, jti }, '[clientAuth] Blocklist check failed');
    // Fail open: blocking a user is worse than a momentary race on revocation
    return false;
  }
}

export async function requireClientAuth(req, res, next) {
  const token = req.cookies?.clientToken || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    logger.warn({ ip: req.ip, path: req.path }, '[clientAuth] No token provided');
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch (err) {
    logger.warn({ ip: req.ip, error: err.message }, '[clientAuth] Token verification failed');
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  // Verify the token claims are well-formed
  if (!decoded.sub || !decoded.role) {
    logger.warn(
      { ip: req.ip, sub: decoded.sub, role: decoded.role },
      '[clientAuth] Token claims incomplete'
    );
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  // Check token age against policy maximum
  const now = Math.floor(Date.now() / 1000);
  const issuedAt = decoded.iat || decoded.exp - 60 * 60;
  if (now - issuedAt > MAX_TOKEN_AGE_SECONDS) {
    logger.warn(
      { ip: req.ip, sub: decoded.sub, age: now - issuedAt },
      '[clientAuth] Token exceeds max age policy'
    );
    return res.status(401).json({ error: 'Unauthorized: Token too old' });
  }

  // Wrong token type: admin token on client route
  if (decoded.role !== 'client') {
    logger.warn(
      { ip: req.ip, sub: decoded.sub, role: decoded.role },
      '[clientAuth] Wrong token type used'
    );
    return res.status(401).json({ error: 'Unauthorized: Wrong token type' });
  }

  // Token was explicitly revoked
  if (decoded.jti && (await isBlocklisted(decoded.jti))) {
    logger.warn(
      { ip: req.ip, sub: decoded.sub, jti: decoded.jti },
      '[clientAuth] Revoked token used'
    );
    return res.status(401).json({ error: 'Unauthorized: Token has been revoked' });
  }

  // Verify the client account still exists
  try {
    const { rows } = await db.query('SELECT email, disabled_at FROM clients WHERE id = $1', [
      decoded.sub,
    ]);
    if (rows.length === 0) {
      logger.warn({ ip: req.ip, sub: decoded.sub }, '[clientAuth] Client account no longer exists');
      return res.status(401).json({ error: 'Unauthorized: Account no longer exists' });
    }
    const client = rows[0];
    // Check if account was disabled since token was issued
    if (client.disabled_at && new Date(client.disabled_at) < new Date(decoded.iat * 1000)) {
      logger.warn(
        { ip: req.ip, sub: decoded.sub, disabledAt: client.disabled_at },
        '[clientAuth] Disabled account used'
      );
      return res.status(401).json({ error: 'Unauthorized: Account has been disabled' });
    }
  } catch (err) {
    logger.error({ error: err.message, sub: decoded.sub }, '[clientAuth] Failed to verify account');
    return res.status(500).json({ error: 'Internal server error' });
  }

  req.token = token;
  req.client = decoded;
  next();
}
