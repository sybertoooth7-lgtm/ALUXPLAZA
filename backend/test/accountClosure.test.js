import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import clientAuthRoutes from '../src/routes/clientAuth.js';
import adminClientsRoutes from '../src/routes/adminClients.js';
import adminDataSubjectsRoutes from '../src/routes/adminDataSubjects.js';
import { requireAuth } from '../src/middleware/auth.js';
import { requireClientAuth } from '../src/middleware/clientAuth.js';
import { requireAdmin, requireSuperAdmin } from '../src/middleware/rbac.js';
import { RETENTION, runRetention } from '../src/jobs/retention.js';
import db from '../src/db.js';

// ── app, mounted the way src/index.js mounts these routers ────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  // Each request declares its own IP so the in-memory brute-force guard never
  // makes one test depend on another.
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'ip', {
      value: req.headers['x-test-ip'] || '127.0.0.1',
      configurable: true,
    });
    next();
  });
  app.use('/api/client', clientAuthRoutes);
  app.use('/api/admin/clients', requireAuth, requireAdmin, adminClientsRoutes);
  app.use('/api/admin/data-subjects', requireAuth, requireSuperAdmin, adminDataSubjectsRoutes);
  app.get('/protected/client', requireClientAuth, (_req, res) => res.json({ ok: true }));
  app.get('/protected/admin', requireAuth, (_req, res) => res.json({ ok: true }));
  return app;
}

let ipCounter = 0;
const testIp = () => `10.8.0.${(ipCounter += 1)}`;
const uniqueEmail = (label = 'c') => `${label}-${crypto.randomUUID().slice(0, 10)}@example.com`;
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const PASSWORD = 'SuperSecret123!';

// ── seed helpers ──────────────────────────────────────────────────────────
async function insertClient({ verified = true, disabledSql = null, email = uniqueEmail() } = {}) {
  const hash = await bcrypt.hash(PASSWORD, 4); // low rounds: speed, not security, in tests
  const { rows } = await db.query(
    `INSERT INTO clients (company_name, email, password_hash, email_verified, disabled_at)
     VALUES ('Closure Co', $1, $2, $3, ${disabledSql ?? 'NULL'}) RETURNING id`,
    [email, hash, verified]
  );
  return { id: rows[0].id, email };
}

function clientToken(clientId, { issuedSecondsAgo = 0, jti = crypto.randomUUID() } = {}) {
  const iat = Math.floor(Date.now() / 1000) - issuedSecondsAgo;
  return jwt.sign(
    { sub: clientId, email: 'x@example.com', role: 'client', jti, iat },
    process.env.JWT_SECRET,
    {
      expiresIn: '2h',
    }
  );
}

async function insertAdmin(role) {
  const email = `closure-${role}-${crypto.randomUUID().slice(0, 8)}@staff.example.com`;
  const hash = bcrypt.hashSync('irrelevant', 4);
  const { rows } = await db.query(
    'INSERT INTO admin_users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, hash, role]
  );
  return { id: rows[0].id, email, role };
}

function adminToken(admin, { issuedSecondsAgo = 0 } = {}) {
  const iat = Math.floor(Date.now() / 1000) - issuedSecondsAgo;
  return jwt.sign(
    { sub: admin.id, email: admin.email, role: admin.role, jti: crypto.randomUUID(), iat },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );
}

const getAs = (app, path, cookieName, token) =>
  request(app)
    .get(path)
    .set('Cookie', [`${cookieName}=${token}`]);

const login = (app, email, password = PASSWORD, ip = testIp()) =>
  request(app).post('/api/client/login').set('x-test-ip', ip).send({ email, password });

// ── 1. the middleware ─────────────────────────────────────────────────────
describe('a disabled account can never use a token', () => {
  it('client: a token issued an hour BEFORE the account was disabled is rejected', async () => {
    const app = buildApp();
    const { id } = await insertClient();
    const token = clientToken(id, { issuedSecondsAgo: 3600 });

    expect((await getAs(app, '/protected/client', 'clientToken', token)).status).toBe(200);

    await db.query('UPDATE clients SET disabled_at = NOW() WHERE id = $1', [id]);

    // The regression: this used to return 200 until the token expired.
    const res = await getAs(app, '/protected/client', 'clientToken', token);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/disabled/i);
  });

  it('client: a token issued AFTER the account was disabled is rejected too', async () => {
    const app = buildApp();
    const { id } = await insertClient({ disabledSql: `NOW() - interval '1 hour'` });
    const res = await getAs(app, '/protected/client', 'clientToken', clientToken(id));
    expect(res.status).toBe(401);
  });

  it('client: clearing disabled_at lets a valid token work again', async () => {
    const app = buildApp();
    const { id } = await insertClient({ disabledSql: 'NOW()' });
    const token = clientToken(id, { issuedSecondsAgo: 60 });
    expect((await getAs(app, '/protected/client', 'clientToken', token)).status).toBe(401);
    await db.query('UPDATE clients SET disabled_at = NULL WHERE id = $1', [id]);
    expect((await getAs(app, '/protected/client', 'clientToken', token)).status).toBe(200);
  });

  it('admin: a token issued an hour BEFORE the account was disabled is rejected', async () => {
    const app = buildApp();
    const admin = await insertAdmin('admin');
    const token = adminToken(admin, { issuedSecondsAgo: 3600 });

    expect((await getAs(app, '/protected/admin', 'adminToken', token)).status).toBe(200);

    await db.query('UPDATE admin_users SET disabled_at = NOW() WHERE id = $1', [admin.id]);

    const res = await getAs(app, '/protected/admin', 'adminToken', token);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/disabled/i);
  });

  it('admin: a token issued AFTER the account was disabled is rejected too', async () => {
    const app = buildApp();
    const admin = await insertAdmin('admin');
    await db.query(`UPDATE admin_users SET disabled_at = NOW() - interval '1 hour' WHERE id = $1`, [
      admin.id,
    ]);
    expect((await getAs(app, '/protected/admin', 'adminToken', adminToken(admin))).status).toBe(
      401
    );
  });
});

// ── 2. client routes must treat a closed account like one that doesn't exist
describe('login refuses a closed account without revealing that it is closed', () => {
  it('an open account still logs in and gets a session cookie (control)', async () => {
    const app = buildApp();
    const { email } = await insertClient();
    const res = await login(app, email);
    expect(res.status).toBe(200);
    expect((res.headers['set-cookie'] || []).join(';')).toMatch(/clientToken=/);
  });

  it('a closed account with the CORRECT password gets 401, no cookie, and the same body as a wrong password or an unknown email', async () => {
    const app = buildApp();
    const closed = await insertClient({ disabledSql: 'NOW()' });
    const open = await insertClient();

    const closedRes = await login(app, closed.email);
    const wrongPasswordRes = await login(app, open.email, 'definitely-the-wrong-password');
    const unknownRes = await login(app, uniqueEmail('nobody'));

    expect(closedRes.status).toBe(401);
    expect((closedRes.headers['set-cookie'] || []).join(';')).not.toMatch(/clientToken=/);
    expect(wrongPasswordRes.status).toBe(401);
    expect(unknownRes.status).toBe(401);
    // Indistinguishable: an attacker holding a password learns nothing about closure.
    expect(closedRes.body).toEqual(wrongPasswordRes.body);
    expect(closedRes.body).toEqual(unknownRes.body);
  });

  it('a closed AND locked account with the correct password still gets 401, not the 423 lockout message', async () => {
    const app = buildApp();
    const { email } = await insertClient({ disabledSql: 'NOW()' });
    await db.query(`UPDATE clients SET locked_until = NOW() + interval '1 hour' WHERE email = $1`, [
      email,
    ]);
    const res = await login(app, email);
    expect(res.status).toBe(401);
    expect(res.body.code).toBeUndefined();
  });

  it('the refused attempt is logged as a failed login for that account', async () => {
    const app = buildApp();
    const { id, email } = await insertClient({ disabledSql: 'NOW()' });
    await login(app, email);
    const { rows } = await db.query(
      'SELECT success FROM client_login_attempts WHERE client_id = $1',
      [id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].success).toBe(false);
  });
});

describe('password reset, email verification and resend refuse a closed account', () => {
  async function seedResetToken(clientId) {
    const raw = crypto.randomBytes(32).toString('hex');
    await db.query(
      `INSERT INTO client_password_resets (client_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + interval '1 hour')`,
      [clientId, sha256(raw)]
    );
    return raw;
  }
  async function seedVerifyToken(clientId) {
    const raw = crypto.randomBytes(32).toString('hex');
    await db.query(
      `INSERT INTO client_email_verifications (client_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + interval '1 hour')`,
      [clientId, sha256(raw)]
    );
    return raw;
  }
  const count = async (table, clientId) =>
    Number(
      (await db.query(`SELECT COUNT(*) AS n FROM ${table} WHERE client_id = $1`, [clientId]))
        .rows[0].n
    );

  it('password-reset/confirm: a link issued before closure cannot change the password (control: works for an open account)', async () => {
    const app = buildApp();
    const open = await insertClient();
    const closed = await insertClient({ disabledSql: 'NOW()' });
    const openToken = await seedResetToken(open.id);
    const closedToken = await seedResetToken(closed.id);
    const before = (await db.query('SELECT password_hash FROM clients WHERE id = $1', [closed.id]))
      .rows[0].password_hash;

    const okRes = await request(app)
      .post('/api/client/password-reset/confirm')
      .set('x-test-ip', testIp())
      .send({ token: openToken, password: 'BrandNewSecret456!' });
    expect(okRes.status).toBe(200);

    const res = await request(app)
      .post('/api/client/password-reset/confirm')
      .set('x-test-ip', testIp())
      .send({ token: closedToken, password: 'BrandNewSecret456!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid or expired reset link.');

    const after = (await db.query('SELECT password_hash FROM clients WHERE id = $1', [closed.id]))
      .rows[0].password_hash;
    expect(after).toBe(before);
  });

  it('password-reset/request: same generic reply, but no reset link is created for a closed account (control: one is for an open account)', async () => {
    const app = buildApp();
    const open = await insertClient();
    const closed = await insertClient({ disabledSql: 'NOW()' });

    const openRes = await request(app)
      .post('/api/client/password-reset/request')
      .set('x-test-ip', testIp())
      .send({ email: open.email });
    const closedRes = await request(app)
      .post('/api/client/password-reset/request')
      .set('x-test-ip', testIp())
      .send({ email: closed.email });

    expect(openRes.status).toBe(200);
    expect(closedRes.status).toBe(200);
    expect(closedRes.body).toEqual(openRes.body);
    expect(await count('client_password_resets', open.id)).toBe(1);
    expect(await count('client_password_resets', closed.id)).toBe(0);
  });

  it('verify-email: a link issued before closure does not verify a closed account (control: verifies an open one)', async () => {
    const app = buildApp();
    const open = await insertClient({ verified: false });
    const closed = await insertClient({ verified: false, disabledSql: 'NOW()' });
    const openToken = await seedVerifyToken(open.id);
    const closedToken = await seedVerifyToken(closed.id);

    const okRes = await request(app)
      .post('/api/client/verify-email')
      .set('x-test-ip', testIp())
      .send({ token: openToken });
    expect(okRes.status).toBe(200);

    const res = await request(app)
      .post('/api/client/verify-email')
      .set('x-test-ip', testIp())
      .send({ token: closedToken });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid or expired verification link.');
    const { rows } = await db.query('SELECT email_verified FROM clients WHERE id = $1', [
      closed.id,
    ]);
    expect(rows[0].email_verified).toBe(false);
  });

  it('resend-verification: same generic reply, but no new link for a closed account (control: one for an open unverified account)', async () => {
    const app = buildApp();
    const open = await insertClient({ verified: false });
    const closed = await insertClient({ verified: false, disabledSql: 'NOW()' });

    const openRes = await request(app)
      .post('/api/client/resend-verification')
      .set('x-test-ip', testIp())
      .send({ email: open.email });
    const closedRes = await request(app)
      .post('/api/client/resend-verification')
      .set('x-test-ip', testIp())
      .send({ email: closed.email });

    expect(closedRes.status).toBe(200);
    expect(closedRes.body).toEqual(openRes.body);
    expect(await count('client_email_verifications', open.id)).toBe(1);
    expect(await count('client_email_verifications', closed.id)).toBe(0);
  });
});

// ── 3. the admin "close account" action ───────────────────────────────────
describe('POST /api/admin/clients/:id/close', () => {
  const close = (app, id, token) =>
    request(app)
      .post(`/api/admin/clients/${id}/close`)
      .set('Cookie', [`adminToken=${token}`]);

  it('rejects an unauthenticated request with 401 and a read-only admin with 403, closing nothing', async () => {
    const app = buildApp();
    const { id } = await insertClient();
    const readonly = await insertAdmin('readonly');

    expect((await request(app).post(`/api/admin/clients/${id}/close`)).status).toBe(401);
    expect((await close(app, id, adminToken(readonly))).status).toBe(403);

    const { rows } = await db.query('SELECT disabled_at FROM clients WHERE id = $1', [id]);
    expect(rows[0].disabled_at).toBeNull();
  });

  it('returns 400 for a non-numeric id and 404 for one that does not exist', async () => {
    const app = buildApp();
    const admin = await insertAdmin('admin');
    expect((await close(app, 'abc', adminToken(admin))).status).toBe(400);
    const missing = await close(app, 99999999, adminToken(admin));
    expect(missing.status).toBe(404);
    expect(
      (
        await db.query(
          `SELECT 1 FROM audit_logs WHERE action = 'client.close' AND target_id = '99999999'`
        )
      ).rowCount
    ).toBe(0);
  });

  it('closes the account: disabled, sessions revoked and blocklisted, links deleted, counts-only audit entry', async () => {
    const app = buildApp();
    const admin = await insertAdmin('admin');
    const { id, email } = await insertClient();

    const jti = crypto.randomUUID();
    await db.query(
      `INSERT INTO client_sessions (client_id, jti, expires_at) VALUES ($1, $2, NOW() + interval '1 hour')`,
      [id, jti]
    );
    await db.query(
      `INSERT INTO client_email_verifications (client_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + interval '1 hour')`,
      [id, `v-${crypto.randomUUID()}`]
    );
    await db.query(
      `INSERT INTO client_password_resets (client_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + interval '1 hour')`,
      [id, `r-${crypto.randomUUID()}`]
    );

    const res = await close(app, id, adminToken(admin));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.alreadyClosed).toBe(false);
    expect(new Date(res.body.closedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    // deletesAfter is the closure date plus the policy's closed-account period.
    const months =
      (new Date(res.body.deletesAfter).getUTCFullYear() -
        new Date(res.body.closedAt).getUTCFullYear()) *
        12 +
      (new Date(res.body.deletesAfter).getUTCMonth() - new Date(res.body.closedAt).getUTCMonth());
    expect(months).toBe(RETENTION.closedClientMonths);

    const client = (await db.query('SELECT disabled_at FROM clients WHERE id = $1', [id])).rows[0];
    expect(client.disabled_at).toBeTruthy();
    expect(
      (await db.query('SELECT 1 FROM client_sessions WHERE client_id = $1', [id])).rowCount
    ).toBe(0);
    expect((await db.query('SELECT 1 FROM token_blocklist WHERE jti = $1', [jti])).rowCount).toBe(
      1
    );
    expect(
      (await db.query('SELECT 1 FROM client_email_verifications WHERE client_id = $1', [id]))
        .rowCount
    ).toBe(0);
    expect(
      (await db.query('SELECT 1 FROM client_password_resets WHERE client_id = $1', [id])).rowCount
    ).toBe(0);

    const audit = await db.query(
      `SELECT * FROM audit_logs WHERE action = 'client.close' AND target_id = $1`,
      [String(id)]
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].admin_email).toBe(admin.email);
    const text = JSON.stringify(audit.rows[0]);
    expect(text).not.toContain(email);
    expect(text).not.toContain('Closure Co');
  });

  it('is idempotent: closing again changes nothing, so the retention clock keeps running from the first closure', async () => {
    const app = buildApp();
    const admin = await insertAdmin('admin');
    const { id } = await insertClient();

    const first = await close(app, id, adminToken(admin));
    const stored = (await db.query('SELECT disabled_at FROM clients WHERE id = $1', [id])).rows[0]
      .disabled_at;
    await new Promise((r) => setTimeout(r, 25));
    const second = await close(app, id, adminToken(admin));

    expect(second.status).toBe(200);
    expect(second.body.alreadyClosed).toBe(true);
    expect(new Date(second.body.closedAt).getTime()).toBe(new Date(first.body.closedAt).getTime());
    const after = (await db.query('SELECT disabled_at FROM clients WHERE id = $1', [id])).rows[0]
      .disabled_at;
    expect(after.getTime()).toBe(stored.getTime());
    expect(
      (
        await db.query(
          `SELECT 1 FROM audit_logs WHERE action = 'client.close' AND target_id = $1`,
          [String(id)]
        )
      ).rowCount
    ).toBe(1);
  });

  it('after closing: an existing token stops working, the person cannot log in, and a reset link cannot be requested', async () => {
    const app = buildApp();
    const admin = await insertAdmin('admin');
    const { id, email } = await insertClient();
    const token = clientToken(id, { issuedSecondsAgo: 600 });
    expect((await getAs(app, '/protected/client', 'clientToken', token)).status).toBe(200);

    await close(app, id, adminToken(admin));

    expect((await getAs(app, '/protected/client', 'clientToken', token)).status).toBe(401);
    expect((await login(app, email)).status).toBe(401);
    await request(app)
      .post('/api/client/password-reset/request')
      .set('x-test-ip', testIp())
      .send({ email });
    expect(
      (await db.query('SELECT 1 FROM client_password_resets WHERE client_id = $1', [id])).rowCount
    ).toBe(0);
  });

  it('works with the retention job: kept now, deleted by retention once the closed-account period has passed', async () => {
    const app = buildApp();
    const admin = await insertAdmin('admin');
    const { id } = await insertClient();
    await close(app, id, adminToken(admin));

    await runRetention({ mode: 'enforce' });
    expect((await db.query('SELECT 1 FROM clients WHERE id = $1', [id])).rowCount).toBe(1);

    await db.query(
      `UPDATE clients SET disabled_at = NOW() - make_interval(months => $2::int) WHERE id = $1`,
      [id, RETENTION.closedClientMonths + 1]
    );
    await runRetention({ mode: 'enforce' });
    expect((await db.query('SELECT 1 FROM clients WHERE id = $1', [id])).rowCount).toBe(0);
  });
});

// ── 4. the data-subject erase tool relied on this behaviour ───────────────
describe('erasing a person ends their existing sessions immediately', () => {
  it('a token issued before the erasure is rejected afterwards', async () => {
    const app = buildApp();
    const superadmin = await insertAdmin('superadmin');
    const { id, email } = await insertClient();
    const token = clientToken(id, { issuedSecondsAgo: 600 });
    expect((await getAs(app, '/protected/client', 'clientToken', token)).status).toBe(200);

    const res = await request(app)
      .post('/api/admin/data-subjects/erase')
      .set('Cookie', [`adminToken=${adminToken(superadmin)}`])
      .send({ email, confirm: true });
    expect(res.status).toBe(200);

    const after = await getAs(app, '/protected/client', 'clientToken', token);
    expect(after.status).toBe(401);
  });
});
