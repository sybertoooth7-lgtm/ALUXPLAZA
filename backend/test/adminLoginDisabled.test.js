// Sign-in from a disabled staff account: POST /api/admin/login.
//
// This is the other half of the 4.8 work that staffDisable.test.js covers.
// middleware/auth.js already refuses every request from a disabled account,
// and adminUsers.js can now set admin_users.disabled_at — but the login
// route itself never looked, so a disabled account that still knew its
// password was handed a session cookie that was then refused everywhere it
// was sent. The route now treats a disabled account exactly like a wrong
// password: same 401, same body, no cookie, and the attempt is counted.
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import adminRoutes from '../src/routes/admin.js';
import db from '../src/db.js';

// ── app, mounted the way src/index.js mounts the router ──────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin', adminRoutes);
  return app;
}

// ── seed helpers ──────────────────────────────────────────────────────────
const PASSWORD = 'correct horse battery staple';

async function insertAdmin({ disabled = false, mfa = false, locked = false } = {}) {
  const email = `login-${crypto.randomUUID().slice(0, 8)}@staff.example.com`;
  const hash = bcrypt.hashSync(PASSWORD, 4); // low rounds: speed, not security, in tests
  const { rows } = await db.query(
    `INSERT INTO admin_users
       (email, password_hash, role, disabled_at, mfa_enabled, mfa_secret, locked_until)
     VALUES ($1, $2, 'admin', $3, $4, $5, $6)
     RETURNING id`,
    [
      email,
      hash,
      disabled ? new Date() : null,
      mfa,
      mfa ? 'not-a-real-secret-unused-here' : null,
      locked ? new Date(Date.now() + 10 * 60 * 1000) : null,
    ]
  );
  return { id: rows[0].id, email };
}

const login = (app, email, password = PASSWORD) =>
  request(app).post('/api/admin/login').send({ email, password });

// The brute-force guard counts failed logins per IP in Postgres, and every
// request in this file comes from the same test IP. Four failures answer
// 401; the fifth answers 403 and blocks the IP — correct production
// behaviour, but it would make these assertions depend on how many earlier
// tests happened to fail. Clearing the counter between tests keeps each one
// measuring the login route alone.
beforeEach(async () => {
  await db.query(`DELETE FROM shield_counters WHERE metric = 'failed_login'`);
});

// ── 1. what the fix must not change ───────────────────────────────────────
describe('POST /api/admin/login — sign-in as it must keep working', () => {
  it('an active account with the right password still gets 200 and the adminToken cookie', async () => {
    const app = buildApp();
    const admin = await insertAdmin();

    const res = await login(app, admin.email);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, email: admin.email });
    expect(res.headers['set-cookie']?.some((c) => c.startsWith('adminToken='))).toBe(true);
  });

  it('an active locked account that proves the password still gets the 423 lockout message', async () => {
    const app = buildApp();
    const admin = await insertAdmin({ locked: true });

    const res = await login(app, admin.email);

    expect(res.status).toBe(423);
    expect(res.body.retryAfter).toBeGreaterThan(0);
  });
});

// ── 2. the refusal itself ─────────────────────────────────────────────────
describe('POST /api/admin/login — a disabled account is refused like a wrong password', () => {
  it('the right password on a disabled account gets 401 and no cookie', async () => {
    const app = buildApp();
    const admin = await insertAdmin({ disabled: true });

    const res = await login(app, admin.email);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('is indistinguishable from a wrong password and from an unknown email', async () => {
    const app = buildApp();
    const disabled = await insertAdmin({ disabled: true });
    const active = await insertAdmin();

    const responses = [
      await login(app, disabled.email),
      await login(app, active.email, 'not the password'),
      await login(app, `nobody-${crypto.randomUUID().slice(0, 8)}@staff.example.com`),
    ];

    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid credentials' });
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('does not hand out an MFA challenge token either', async () => {
    const app = buildApp();
    const admin = await insertAdmin({ disabled: true, mfa: true });

    const res = await login(app, admin.email);

    expect(res.status).toBe(401);
    expect(res.body.mfaToken).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('stays 401, not the 423 lockout page, even when the account is also locked', async () => {
    const app = buildApp();
    const admin = await insertAdmin({ disabled: true, locked: true });

    const res = await login(app, admin.email);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });
});

// ── 3. the refusal is counted like any other failed attempt ───────────────
describe('POST /api/admin/login — a refused disabled sign-in is a failed login', () => {
  it('increments failed_login_count on the account', async () => {
    const app = buildApp();
    const admin = await insertAdmin({ disabled: true });

    await login(app, admin.email);

    const { rows } = await db.query('SELECT failed_login_count FROM admin_users WHERE id = $1', [
      admin.id,
    ]);
    expect(rows[0].failed_login_count).toBe(1);
  });
});
