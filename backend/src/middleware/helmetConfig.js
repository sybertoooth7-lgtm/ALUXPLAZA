// backend/src/middleware/helmetConfig.js
import helmet from 'helmet';
import crypto from 'crypto';
import { config } from '../config.js';

/**
 * Attach a cryptographically secure nonce to res.locals for CSP.
 * The nonce is generated with randomBytes (CSPRNG) and base64-encoded.
 */
export function attachCspNonce(req, res, next) {
  // 16 bytes → 24 url-safe base64 chars. Sufficient entropy, no unnecessary wrapping.
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64url');
  next();
}

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
      // 'unsafe-inline' is ignored by browsers that support nonces (CSP3).
      // Kept here as a fallback for older browsers. Remove if you only target modern ones.
      styleSrc: ["'self'", "'unsafe-inline'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"], // Modern X-Frame-Options replacement
      baseUri: ["'none'"], // Prevent <base> tag injection
      formAction: ["'self'"], // Restrict form submissions
      ...(config.isProduction && { upgradeInsecureRequests: [] }),
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true, // WARNING: irreversible once preloaded
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // Matches frame-ancestors 'none' above for browsers that still read the
  // legacy header. Helmet defaults to SAMEORIGIN.
  frameguard: { action: 'deny' },
  // Sends "X-XSS-Protection: 0": the legacy auditor is gone from current
  // browsers and historically introduced XSS of its own. CSP replaces it.
  xssFilter: true,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
});

const PERMISSIONS_POLICY =
  'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()';

// Helmet has no Permissions-Policy middleware and no directive for
// X-Permitted-Cross-Domain-Policies, so those two are set here.
export function securityHeaders(_req, res, next) {
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  next();
}
