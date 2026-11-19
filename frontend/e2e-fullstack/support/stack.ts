import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Shared by playwright.fullstack.config.ts (which starts the servers) and the
// specs (which talk to them), so the two can never disagree.
export const FRONTEND_URL = 'http://127.0.0.1:4173';
export const API_URL = 'http://127.0.0.1:3001';

// The backend's stdout/stderr is redirected here. With RESEND_API_KEY unset the
// backend prints verification and password-reset links to its log instead of
// sending email, which is how the specs obtain them.
export const BACKEND_LOG = path.join(tmpdir(), 'alux-e2e-backend.log');

// Created at backend boot through ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD.
export const ADMIN = {
  email: 'e2e-admin@alux.test',
  password: 'E2e-Admin-Passw0rd-12',
} as const;

export function backendLogSize(): number {
  return existsSync(BACKEND_LOG) ? statSync(BACKEND_LOG).size : 0;
}

export type EmailKind = 'verification' | 'password reset';

// Returns the newest link of the given kind written to the backend log after
// `offset` (a value from backendLogSize() taken before the action that sends it).
export function findEmailLinkSince(kind: EmailKind, offset: number): string | null {
  if (!existsSync(BACKEND_LOG)) return null;
  const text = readFileSync(BACKEND_LOG).subarray(offset).toString('utf8');
  const pattern = new RegExp(`skipping ${kind} email\\. Link would be: (\\S+)`, 'g');
  let newest: string | null = null;
  for (const match of text.matchAll(pattern)) {
    newest = match[1];
  }
  return newest;
}

// Emails go through a background queue, so the link can appear a moment after
// the HTTP response. Poll for it.
export async function waitForEmailLink(kind: EmailKind, offset: number): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const link = findEmailLinkSince(kind, offset);
    if (link) return link;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No ${kind} link appeared in the backend log (${BACKEND_LOG}) within 15s.`);
}

// --- TOTP (RFC 6238) --------------------------------------------------------
// Deliberately re-implemented here rather than imported from the backend, so the
// tests do not share code with the thing they are checking.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  let bits = '';
  for (const char of input.replace(/[\s=]/g, '').toUpperCase()) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) throw new Error(`Invalid base32 character: ${char}`);
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// `stepOffset` shifts by whole 30-second steps. The backend accepts +/-1 step but
// refuses to accept the same step twice, so a code used to finish MFA enrolment
// cannot be reused for the next login: ask for the next step's code instead.
export function totp(secret: string, stepOffset = 0): string {
  const counter = Math.floor(Date.now() / 1000 / 30) + stepOffset;
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}
