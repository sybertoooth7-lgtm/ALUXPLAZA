// Mandatory admin MFA (ADMIN_MFA_REQUIRED, ON by default).
//
// An admin who has not enrolled can sign in, but the session may only reach the
// enrolment endpoints. Everything else answers 403 until MFA is enabled. The
// check reads the database on every request, so it also covers sessions that
// were issued before enforcement was switched on.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import adminRoutes from '../src/routes/admin.js';
import adminMfaRoutes from '../src/routes/adminMfa.js';
import { requireAuth } from '../src/middleware/auth.js';
import { adminMfaRequired, computeTOTP, encryptSecret, generateSecret } from '../src/lib/mfa.js';
import db from '../src/db.js';

// ── app, mounted the way src/index.js mounts the routers ─────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin', adminRoutes);
  app.use('/api/admin/mfa', requireAuth, adminMfaRoutes);
  app.get('/api/admin/probe', requireAuth, (_req, res) => res.json({ ok: true }));
  return app;
}

const PASSWORD = 'correct horse battery staple';

async function insertAdmin({ enrolledSecret = null } = {}) {
  const email = `mfareq-${crypto.randomUUID().slice(0, 8)}@staff.example.com`;
  const hash = bcrypt.hashSync(PASSWORD, 4); // low rounds: speed, not security, in tests
  const { rows } = await db.query(
    `INSERT INTO admin_users (email, password_hash, role, mfa_enabled, mfa_secret)
     VALUES ($1, $2, 'admin', $3, $4) RETURNING id`,
    [email, hash, Boolean(enrolledSecret), enrolledSecret ? encryptSecret(enrolledSecret) : null]
  );
  return { id: rows[0].id, email };
}

const cookieOf = (res) =>
  res.headers['set-cookie'].find((c) => c.startsWith('adminToken=')).split(';')[0];

const login = (app, email) => request(app).post('/api/admin/login').send({ email, password: PASSWORD });

async function loginCookie(app, email) {
  const res = await login(app, email);
  expect(res.status).toBe(200);
  return cookieOf(res);
}

let previous;
beforeEach(async () => {
  previous = process.env.ADMIN_MFA_REQUIRED;
  process.env.ADMIN_MFA_REQUIRED = 'true';
  await db.query(`DELETE FROM shield_counters WHERE metric = 'failed_login'`);
});
afterEach(() => {
  if (previous === undefined) delete process.env.ADMIN_MFA_REQUIRED;
  else process.env.ADMIN_MFA_REQUIRED = previous;
});

// ── 1. the switch itself ─────────────────────────────────────────────────
describe('adminMfaRequired()', () => {
  it('is on when the variable is unset', () => {
    delete process.env.ADMIN_MFA_REQUIRED;
    expect(adminMfaRequired()).toBe(true);
  });

  it('is off only for the exact value "false" (any case, surrounding spaces ignored)', () => {
    for (const v of ['false', 'FALSE', ' false ']) {
      process.env.ADMIN_MFA_REQUIRED = v;
      expect(adminMfaRequired()).toBe(false);
    }
  });

  it('stays on for typos and other values, so a mistake never disables the control', () => {
    for (const v of ['flase', '0', 'no', 'off', '', 'true']) {
      process.env.ADMIN_MFA_REQUIRED = v;
      expect(adminMfaRequired()).toBe(true);
    }
  });
});

// ── 1b. the secret generator ─────────────────────────────────────────────
describe('generateSecret()', () => {
  it('returns 32 upper-case base32 characters (160 bits) that produce valid codes', () => {
    for (let i = 0; i < 50; i++) {
      const secret = generateSecret();
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(computeTOTP(secret)).toMatch(/^\d{6}$/);
    }
  });

  it('does not repeat', () => {
    expect(new Set(Array.from({ length: 100 }, generateSecret)).size).toBe(100);
  });
});

// ── 2. an admin who has not enrolled ─────────────────────────────────────
describe('admin without MFA while MFA is required', () => {
  it('signs in, and the response tells the front end to start enrolment', async () => {
    const app = buildApp();
    const admin = await insertAdmin();

    const res = await login(app, admin.email);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, email: admin.email, mfaEnrollmentRequired: true });
  });

  it('is refused with 403 on every other admin endpoint', async () => {
    const app = buildApp();
    const admin = await insertAdmin();
    const cookie = await loginCookie(app, admin.email);

    for (const path of ['/api/admin/probe', '/api/admin/compliance-overview']) {
      const res = await request(app).get(path).set('Cookie', [cookie]);
      expect(res.status, path).toBe(403);
      expect(res.body.mfaEnrollmentRequired, path).toBe(true);
    }
  });

  it('can still read /me (with the flag), read MFA status and sign out', async () => {
    const app = buildApp();
    const admin = await insertAdmin();
    const cookie = await loginCookie(app, admin.email);

    const me = await request(app).get('/api/admin/me').set('Cookie', [cookie]);
    expect(me.status).toBe(200);
    expect(me.body.mfaEnrollmentRequired).toBe(true);
    expect(me.body.user.email).toBe(admin.email);

    const status = await request(app).get('/api/admin/mfa/status').set('Cookie', [cookie]);
    expect(status.status).toBe(200);
    expect(status.body.mfaEnabled).toBe(false);

    const out = await request(app).post('/api/admin/logout').set('Cookie', [cookie]);
    expect(out.status).toBe(200);
  });

  it('is also blocked when the session was issued before enforcement was switched on', async () => {
    const app = buildApp();
    const admin = await insertAdmin();
    process.env.ADMIN_MFA_REQUIRED = 'false';
    const cookie = await loginCookie(app, admin.email);
    const before = await request(app).get('/api/admin/probe').set('Cookie', [cookie]);
    expect(before.status).toBe(200);

    process.env.ADMIN_MFA_REQUIRED = 'true';
    const after = await request(app).get('/api/admin/probe').set('Cookie', [cookie]);
    expect(after.status).toBe(403);
  });

  it('enrols end to end and then has normal access with the same session', async () => {
    const app = buildApp();
    const admin = await insertAdmin();
    const cookie = await loginCookie(app, admin.email);

    const enroll = await request(app).post('/api/admin/mfa/enroll').set('Cookie', [cookie]);
    expect(enroll.status).toBe(200);
    expect(enroll.body.manualEntryKey).toMatch(/^[A-Z2-7]{32}$/);
    expect(enroll.body.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(enroll.body.otpauthUrl.startsWith('otpauth://totp/')).toBe(true);

    // still gated: enrolment has been started but not verified
    const mid = await request(app).get('/api/admin/probe').set('Cookie', [cookie]);
    expect(mid.status).toBe(403);

    const wrong = await request(app)
      .post('/api/admin/mfa/verify-enrollment')
      .set('Cookie', [cookie])
      .send({ code: '000000' });
    expect(wrong.status).toBe(400);

    const good = await request(app)
      .post('/api/admin/mfa/verify-enrollment')
      .set('Cookie', [cookie])
      .send({ code: computeTOTP(enroll.body.manualEntryKey) });
    expect(good.status).toBe(200);
    expect(good.body.backupCodes).toHaveLength(10);

    const after = await request(app).get('/api/admin/probe').set('Cookie', [cookie]);
    expect(after.status).toBe(200);
    const me = await request(app).get('/api/admin/me').set('Cookie', [cookie]);
    expect(me.body.mfaEnrollmentRequired).toBe(false);
  });

  it('never needs a third-party service to draw the QR code (no secret leaves the server)', async () => {
    const app = buildApp();
    const admin = await insertAdmin();
    const cookie = await loginCookie(app, admin.email);

    const enroll = await request(app).post('/api/admin/mfa/enroll').set('Cookie', [cookie]);

    expect(enroll.body.qrDataUrl).not.toMatch(/https?:/);
  });
});

// ── 3. an admin who has enrolled ─────────────────────────────────────────
describe('admin with MFA while MFA is required', () => {
  it('still gets the normal two-step login and full access afterwards', async () => {
    const app = buildApp();
    const secret = generateSecret();
    const admin = await insertAdmin({ enrolledSecret: secret });

    const step1 = await login(app, admin.email);
    expect(step1.status).toBe(200);
    expect(step1.body.mfaRequired).toBe(true);
    expect(step1.body.mfaEnrollmentRequired).toBeUndefined();

    const step2 = await request(app)
      .post('/api/admin/mfa/verify')
      .send({ mfaToken: step1.body.mfaToken, code: computeTOTP(secret) });
    expect(step2.status).toBe(200);

    const res = await request(app).get('/api/admin/probe').set('Cookie', [cookieOf(step2)]);
    expect(res.status).toBe(200);
  });

  it('cannot start a new enrolment, so a stolen session cannot swap in its own authenticator', async () => {
    const app = buildApp();
    const secret = generateSecret();
    const admin = await insertAdmin({ enrolledSecret: secret });
    const step1 = await login(app, admin.email);
    const step2 = await request(app)
      .post('/api/admin/mfa/verify')
      .send({ mfaToken: step1.body.mfaToken, code: computeTOTP(secret) });
    const cookie = cookieOf(step2);

    const res = await request(app).post('/api/admin/mfa/enroll').set('Cookie', [cookie]);

    expect(res.status).toBe(409);
    const row = (await db.query('SELECT mfa_enabled FROM admin_users WHERE id = $1', [admin.id]))
      .rows[0];
    expect(row.mfa_enabled).toBe(true);
  });

  it('cannot turn MFA off, even with the right password and a valid code', async () => {
    const app = buildApp();
    const secret = generateSecret();
    const admin = await insertAdmin({ enrolledSecret: secret });
    const step1 = await login(app, admin.email);
    const step2 = await request(app)
      .post('/api/admin/mfa/verify')
      .send({ mfaToken: step1.body.mfaToken, code: computeTOTP(secret) });
    const cookie = cookieOf(step2);

    const res = await request(app)
      .post('/api/admin/mfa/disable')
      .set('Cookie', [cookie])
      .send({ password: PASSWORD, code: computeTOTP(secret) });

    expect(res.status).toBe(403);
    const row = (await db.query('SELECT mfa_enabled FROM admin_users WHERE id = $1', [admin.id]))
      .rows[0];
    expect(row.mfa_enabled).toBe(true);
  });
});

// ── 4. enforcement switched off (local development) ──────────────────────
describe('ADMIN_MFA_REQUIRED=false', () => {
  it('keeps the old behaviour: no enrolment prompt and no gating', async () => {
    process.env.ADMIN_MFA_REQUIRED = 'false';
    const app = buildApp();
    const admin = await insertAdmin();

    const res = await login(app, admin.email);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, email: admin.email });

    const probe = await request(app).get('/api/admin/probe').set('Cookie', [cookieOf(res)]);
    expect(probe.status).toBe(200);
  });
});
