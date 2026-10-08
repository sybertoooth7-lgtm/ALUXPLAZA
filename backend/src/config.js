// backend/src/config.js
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const isProduction = process.env.NODE_ENV === 'production';
const warnings = [];
const fatalErrors = [];

// JWT Secret validation
// No dev fallback secret: a hardcoded 'dev-secret-change-me' is a real risk
// if NODE_ENV is ever accidentally unset on a deployed container, since the
// app would boot silently with a publicly-known secret. Always require a
// real value, in every environment.
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  fatalErrors.push('JWT_SECRET is not set. Admin and client login will fail on every request.');
}
if (jwtSecret && jwtSecret.length < 32) {
  warnings.push('JWT_SECRET is too short. It should be at least 32 characters for security.');
}
if (jwtSecret === 'your-64-char-random-secret-here-change-me' || jwtSecret === 'secret') {
  warnings.push('JWT_SECRET appears to be a default value. Please change it to a random string.');
}

// Cookie Secret validation
const cookieSecret = process.env.COOKIE_SECRET || jwtSecret || '';
if (cookieSecret && cookieSecret.length < 32) {
  warnings.push('COOKIE_SECRET is too short. It should be at least 32 characters for security.');
}

// MFA encryption key — deliberately separate from JWT_SECRET. A signing
// key and an encryption key should never be the same secret (if one ever
// leaks, the other stays safe). Falls back to deriving from JWT_SECRET via
// HKDF (not the old raw-SHA256 scheme) if not set, so MFA still works
// without a second secret configured, but a dedicated key is strongly
// recommended — see the warning below.
const mfaEncryptionKey = process.env.MFA_ENCRYPTION_KEY || '';
if (!mfaEncryptionKey) {
  warnings.push(
    'MFA_ENCRYPTION_KEY is not set. Falling back to a key derived from JWT_SECRET — set a dedicated MFA_ENCRYPTION_KEY (32+ random bytes) so a leaked JWT_SECRET cannot also decrypt stored MFA secrets.'
  );
} else if (mfaEncryptionKey.length < 32) {
  warnings.push(
    'MFA_ENCRYPTION_KEY is too short. It should be at least 32 characters for security.'
  );
}

// CORS validation
// CORS_ORIGIN is required in production — without it, the browser silently
// blocks every request from the real frontend, which is a confusing,
// hard-to-diagnose way for the whole site to go down. Fail loudly at boot
// instead. A trailing slash is stripped rather than left as a value that
// can never match a real Origin header (browsers never send one).
const rawCorsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

if (isProduction) {
  if (rawCorsOrigins.length === 0) {
    fatalErrors.push(
      "CORS_ORIGIN is not set in production. Set it to your frontend's origin(s), comma-separated."
    );
  } else {
    const missingScheme = rawCorsOrigins.filter((o) => !/^https?:\/\//.test(o));
    if (missingScheme.length > 0) {
      fatalErrors.push(
        `CORS_ORIGIN entry is missing scheme (http:// or https://): ${missingScheme.join(', ')}`
      );
    }
    const nonHttps = rawCorsOrigins.filter((o) => o.startsWith('http://'));
    if (nonHttps.length > 0) {
      warnings.push(`CORS_ORIGIN contains non-HTTPS origins in production: ${nonHttps.join(', ')}`);
    }
  }
}

const corsOrigins = rawCorsOrigins;

if (isProduction && process.env.DB_SSL === 'false') {
  warnings.push('DB_SSL is set to false in production. Database traffic will be unencrypted.');
}

// Used to build the links inside verification/password-reset emails
// (see buildLink() in clientAuth.js) and to pin those links' hostname in
// lib/email.js's isSafeLink() check. Not fatal if unset — those emails
// already no-op without RESEND_API_KEY/FROM_EMAIL — but a loud warning is
// worth it since a missing value means every such email silently contains
// no working link, or gets silently refused by isSafeLink.
const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
if (isProduction && !frontendUrl) {
  warnings.push(
    'FRONTEND_URL is not set. Verification and password-reset emails cannot include a working link.'
  );
}

if (warnings.length > 0) {
  console.warn('[config] Security warnings:');
  warnings.forEach((w) => console.warn(`  - ${w}`));
}

if (fatalErrors.length > 0) {
  console.error('[config] Refusing to start:\n');
  fatalErrors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  isProduction,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  cookieSecret,
  mfaEncryptionKey,
  corsOrigins,
  frontendUrl,
  adminBootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL,
  adminBootstrapPassword: process.env.ADMIN_BOOTSTRAP_PASSWORD,
  dbSsl: isProduction && process.env.DB_SSL !== 'false',
};
