// backend/src/middleware/csrf.js
// Double-submit cookie CSRF protection with strict origin validation.
// Safe methods (GET/HEAD/OPTIONS) receive the token cookie.
// State-changing methods must echo it back in the x-csrf-token header.
import { randomBytes, timingSafeEqual } from 'crypto';
import { logger } from '../logger.js';
import { config } from '../config.js';

const CSRF_COOKIE = 'csrfToken';
const CSRF_HEADER = 'x-csrf-token';

// Token generation with cryptographic strength
function generateToken() {
  return randomBytes(32).toString('base64url');
}

// Extract origin from request, handling proxies and subdomains
function getOrigin(req) {
  // X-Forwarded-Proto and X-Forwarded-Host are set by reverse proxies
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.hostname || req.get('host');
  return `${protocol}://${host}`;
}

// Allowed origins for CSRF validation (configurable, defaults to frontend domain)
function getAllowedOrigins() {
  if (!config.allowedOrigins) {
    return [config.frontendUrl].filter(Boolean);
  }
  return Array.isArray(config.allowedOrigins) ? config.allowedOrigins : [config.allowedOrigins];
}

// Validate origin header against whitelist to prevent CSRF at the transport layer
function validateOrigin(req) {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) {
    // POST/PUT/DELETE without origin header is already suspicious but may be
    // legitimate from legacy clients. Log and allow, but track it.
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      logger.warn(
        { method: req.method, ip: req.ip },
        'State-changing request without origin header'
      );
    }
    return true;
  }

  const allowed = getAllowedOrigins();
  const originUrl = typeof origin === 'string' ? new URL(origin).origin : origin;
  const isAllowed = allowed.some((a) => originUrl === new URL(a).origin);

  if (!isAllowed) {
    logger.warn(
      { origin: originUrl, allowed, ip: req.ip, path: req.path },
      'CSRF origin validation failed'
    );
    return false;
  }
  return true;
}

export function setCsrfCookie(req, res, next) {
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token || token.length < 32) {
    token = generateToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false, // must be readable by frontend JS
      // SameSite=None is required when frontend and backend are deployed on different
      // domains (Vercel + Render) — this is a genuinely cross-site relationship.
      // SameSite=Strict silently stops the browser from sending this cookie back,
      // and no amount of frontend fixing can work around it. SameSite=None requires
      // Secure, so `secure` is hardcoded true rather than tied to NODE_ENV.
      secure: true,
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
  req.csrfToken = token;
  next();
}

export function verifyCsrfToken(req, res, next) {
  // Safe methods never require CSRF protection
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Origin validation is a first line of defense
  if (!validateOrigin(req)) {
    return res.status(403).json({ error: 'CSRF validation failed: invalid origin' });
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken) {
    logger.warn(
      { hasCookie: !!cookieToken, hasHeader: !!headerToken, ip: req.ip, path: req.path },
      'CSRF token missing'
    );
    return res.status(403).json({ error: 'CSRF token missing' });
  }

  try {
    // Use timing-safe comparison to prevent timing attacks
    const cookieBuf = Buffer.from(cookieToken, 'base64url');
    const headerBuf = Buffer.from(headerToken, 'base64url');
    if (cookieBuf.length !== headerBuf.length || !timingSafeEqual(cookieBuf, headerBuf)) {
      logger.warn(
        { ip: req.ip, path: req.path, mismatch: 'token_mismatch' },
        'CSRF token validation failed'
      );
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
  } catch (err) {
    logger.warn({ ip: req.ip, path: req.path, error: err.message }, 'CSRF token parsing error');
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
}

// Refresh CSRF token on sensitive operations (login, password reset) to invalidate
// any tokens leaked before the operation completed
export function refreshCsrfToken(req, res, next) {
  const token = generateToken();
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: true,
    sameSite: 'none',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
  req.csrfToken = token;
  next();
}
