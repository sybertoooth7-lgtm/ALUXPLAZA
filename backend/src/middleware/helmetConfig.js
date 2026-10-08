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
});
