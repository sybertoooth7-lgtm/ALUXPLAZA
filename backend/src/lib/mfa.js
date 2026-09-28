// backend/src/lib/mfa.js
// TOTP MFA using only Node.js built-in crypto.

import crypto from 'crypto';
import jwt from 'jsonwebtoken'; // FIX C5: ESM import, not require()
import { config } from '../config.js';

const SECRET_LENGTH = 20;
const CODE_DIGITS = 6;
const TIME_STEP = 30;
const VALID_WINDOW = 1;
const BACKUP_CODE_COUNT = 10;

// BREAKING CHANGE (intentional): this used to be
// sha256(config.jwtSecret) — the same signing secret, reused directly as
// an encryption key with zero key stretching. That means a leaked
// JWT_SECRET also decrypted every stored MFA secret, and the encryption
// key was only as strong as whatever JWT_SECRET happened to be.
// This derives via HKDF-SHA256 instead (real key stretching, and a fixed
// "info" label that domain-separates this key from any other use of the
// same input material), and prefers a dedicated MFA_ENCRYPTION_KEY over
// JWT_SECRET entirely when one is set (see config.js).
// Because the derivation itself changed, any admin_users.mfa_secret value
// encrypted under the old scheme can no longer be decrypted — affected
// admins need to disable and re-enroll MFA after this deploys.
function getEncryptionKey() {
  const keyMaterial = config.mfaEncryptionKey || config.jwtSecret;
  if (!keyMaterial) {
    throw new Error(
      'Neither MFA_ENCRYPTION_KEY nor JWT_SECRET is set — cannot encrypt/decrypt MFA secrets.'
    );
  }
  return Buffer.from(
    crypto.hkdfSync('sha256', keyMaterial, '', 'alux-plaza-mfa-encryption-v1', 32)
  );
}

export function encryptSecret(plainSecret) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainSecret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

export function decryptSecret(stored) {
  const [ivHex, cipherHex, tagHex] = stored.split(':');
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function generateSecret() {
  const bytes = crypto.randomBytes(SECRET_LENGTH);
  return bytes
    .toString('base64')
    .replace(/[^A-Za-z2-7]/g, '')
    .slice(0, 32);
}

export function getOtpauthUrl(email, secret, issuer = 'Alux Plaza') {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(CODE_DIGITS),
    period: String(TIME_STEP),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const map = new Map(alphabet.split('').map((c, i) => [c, i]));
  let bits = 0,
    value = 0;
  const bytes = [];
  for (const char of str.toUpperCase()) {
    const idx = map.get(char);
    if (idx === undefined) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function computeTOTP(secret, timeOffsetSteps = 0) {
  const decoded = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / TIME_STEP) + timeOffsetSteps;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter), 0);
  const hmac = crypto.createHmac('sha1', decoded).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    10 ** CODE_DIGITS;
  return String(code).padStart(CODE_DIGITS, '0');
}

export function verifyTOTP(secret, code) {
  for (let offset = -VALID_WINDOW; offset <= VALID_WINDOW; offset++) {
    if (computeTOTP(secret, offset) === code) return true;
  }
  return false;
}

export async function generateBackupCodes() {
  const bcrypt = await import('./bcrypt-pool.js');
  const plaintextCodes = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = crypto.randomBytes(6).toString('base64url').slice(0, 12).toUpperCase();
    plaintextCodes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`);
  }
  // Hash in parallel: a serial loop makes enabling MFA cost BACKUP_CODE_COUNT
  // x the CPU time of a single hash.
  const hashedCodes = await Promise.all(plaintextCodes.map((c) => bcrypt.hash(c, 12)));
  return { plaintextCodes, hashedCodes };
}

export async function verifyBackupCode(code, hashedCodes) {
  const bcrypt = await import('./bcrypt-pool.js');
  // Compare against all codes concurrently rather than serially. Sequentially
  // this is up to BACKUP_CODE_COUNT (10) cost-12 hashes back to back, which is
  // multiple seconds of pure CPU. The pool keeps that off the event loop, and
  // running them together also avoids leaking which position matched via
  // timing.
  const matches = await Promise.all(hashedCodes.map((h) => bcrypt.compare(code, h)));
  return matches.indexOf(true);
}

export function generateMfaToken(userId, email) {
  return jwt.sign({ sub: userId, email, type: 'mfa_challenge' }, config.jwtSecret, {
    expiresIn: '5m',
    jwtid: crypto.randomUUID(),
  });
}

export function verifyMfaToken(token) {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (decoded.type !== 'mfa_challenge') return null;
    return decoded;
  } catch {
    return null;
  }
}
