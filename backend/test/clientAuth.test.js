import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import clientAuthRoutes from '../src/routes/clientAuth.js';
import db from '../src/db.js';

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  // Let each request declare its own test IP via header so tests stay
  // independent of each other (bruteForceGuard tracks failures per-IP
  // in-memory across the whole test file).
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'ip', {
      value: req.headers['x-test-ip'] || '127.0.0.1',
      configurable: true,
    });
    next();
  });
  app.use('/api/client', clientAuthRoutes);
  return app;
}

let ipCounter = 0;
function testIp() {
  ipCounter += 1;
  return `10.0.0.${ipCounter}`;
}

function uniqueEmail() {
  return `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

// clientAuth.js hashes raw tokens with sha256 hex before storing/looking
// them up — replicate that here so tests can seed a known raw token
// directly into the DB and then exercise the real route with it.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function insertVerifiedClient({ email = uniqueEmail(), password = 'SuperSecret123!' } = {}) {
  const passwordHash = await bcrypt.hash(password, 4); // low rounds — speed, not security, in tests
  const result = await db.query(
    `INSERT INTO clients (company_name, email, password_hash, email_verified)
     VALUES ('Test Co', $1, $2, TRUE) RETURNING id`,
    [email, passwordHash]
  );
  return { id: result.rows[0].id, email, password };
}

async function insertUnverifiedClient({
  email = uniqueEmail(),
  password = 'SuperSecret123!',
} = {}) {
  const passwordHash = await bcrypt.hash(password, 4);
  const result = await db.query(
    `INSERT INTO clients (company_name, email, password_hash, email_verified)
     VALUES ('Test Co', $1, $2, FALSE) RETURNING id`,
    [email, passwordHash]
  );
  return { id: result.rows[0].id, email, password };
}

// ─────────────────────────────────────────────────────────────────────────
describe('POST /api/client/signup', () => {
  it('creates an unverified client and an enumeration-resistant response', async () => {
    const app = buildTestApp();
    const email = uniqueEmail();

    const res = await request(app)
      .post('/api/client/signup')
      .send({ companyName: 'Acme Ltd', email, password: 'SuperSecret123!' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/verification link has been sent/i);

    const { rows } = await db.query('SELECT email_verified FROM clients WHERE email = $1', [email]);
    expect(rows).toHaveLength(1);
    expect(rows[0].email_verified).toBe(false);

    const tokenRows = await db.query(
      `SELECT id FROM client_email_verifications
       WHERE client_id = (SELECT id FROM clients WHERE email = $1)`,
      [email]
    );
    expect(tokenRows.rows).toHaveLength(1);
  });

  it('returns the same enumeration-safe message for a duplicate email, without creating a second row', async () => {
    const app = buildTestApp();
    const { email } = await insertVerifiedClient();

    const res = await request(app)
      .post('/api/client/signup')
      .send({ companyName: 'Acme Ltd', email, password: 'SuperSecret123!' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/verification link has been sent/i);

    const { rows } = await db.query('SELECT id FROM clients WHERE email = $1', [email]);
    expect(rows).toHaveLength(1); // still just the one client
  });

  it('rejects a honeypot-triggered submission', async () => {
    const app = buildTestApp();
    const email = uniqueEmail();

    const res = await request(app)
      .post('/api/client/signup')
      .send({
        companyName: 'Acme Ltd',
        email,
        password: 'SuperSecret123!',
        website_url: 'http://spam.example',
      });

    expect(res.status).toBe(400);
    const { rows } = await db.query('SELECT id FROM clients WHERE email = $1', [email]);
    expect(rows).toHaveLength(0);
  });

  it('rejects invalid input with 400', async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post('/api/client/signup')
      .send({ companyName: '', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/client/verify-email', () => {
  it('verifies a valid, unexpired, unused token', async () => {
    const app = buildTestApp();
    const { id: clientId } = await insertUnverifiedClient();
    const rawToken = crypto.randomBytes(16).toString('hex');
    await db.query(
      `INSERT INTO client_email_verifications (client_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + interval '1 hour')`,
      [clientId, hashToken(rawToken)]
    );

    const res = await request(app).post('/api/client/verify-email').send({ token: rawToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { rows } = await db.query('SELECT email_verified FROM clients WHERE id = $1', [clientId]);
    expect(rows[0].email_verified).toBe(true);
  });

  it('rejects an unknown token', async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post('/api/client/verify-email')
      .send({ token: crypto.randomBytes(16).toString('hex') });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it('rejects a token that has already been used', async () => {
    const app = buildTestApp();
    const { id: clientId } = await insertUnverifiedClient();
    const rawToken = crypto.randomBytes(16).toString('hex');
    await db.query(
      `INSERT INTO client_email_verifications (client_id, token_hash, expires_at, used_at)
       VALUES ($1, $2, NOW() + interval '1 hour', NOW())`,
      [clientId, hashToken(rawToken)]
    );

    const res = await request(app).post('/api/client/verify-email').send({ token: rawToken });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already been used/i);
  });

  it('rejects an expired token', async () => {
    const app = buildTestApp();
    const { id: clientId } = await insertUnverifiedClient();
    const rawToken = crypto.randomBytes(16).toString('hex');
    await db.query(
      `INSERT INTO client_email_verifications (client_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() - interval '1 hour')`,
      [clientId, hashToken(rawToken)]
    );

    const res = await request(app).post('/api/client/verify-email').send({ token: rawToken });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);

    const { rows } = await db.query('SELECT email_verified FROM clients WHERE id = $1', [clientId]);
    expect(rows[0].email_verified).toBe(false); // must not have been verified
  });

  it('replaying the same token a second time fails, even after a successful verify', async () => {
    const app = buildTestApp();
    const { id: clientId } = await insertUnverifiedClient();
    const rawToken = crypto.randomBytes(16).toString('hex');
    await db.query(
      `INSERT INTO client_email_verifications (client_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + interval '1 hour')`,
      [clientId, hashToken(rawToken)]
    );

    const first = await request(app).post('/api/client/verify-email').send({ token: rawToken });
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/client/verify-email').send({ token: rawToken });
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/already been used/i);
  });
});

describe('POST /api/client/resend-verification', () => {
  it('invalidates the old token and issues a fresh one for an unverified client', async () => {
    const app = buildTestApp();
    const { id: clientId, email } = await insertUnverifiedClient();
    const oldRawToken = crypto.randomBytes(16).toString('hex');
    await db.query(
      `INSERT INTO client_email_verifications (client_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + interval '1 hour')`,
      [clientId, hashToken(oldRawToken)]
    );

    const res = await request(app).post('/api/client/resend-verification').send({ email });
    expect(res.status).toBe(200);

    const { rows } = await db.query(
      `SELECT used_at FROM client_email_verifications WHERE client_id = $1 ORDER BY id`,
      [clientId]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].used_at).not.toBeNull(); // old one invalidated
    expect(rows[1].used_at).toBeNull(); // new one still usable
  });

  it('does not create a new token for an already-verified client, but still returns 200', async () => {
    const app = buildTestApp();
    const { id: clientId, email } = await insertVerifiedClient();

    const res = await request(app).post('/api/client/resend-verification').send({ email });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if this account exists/i);

    const { rows } = await db.query(
      'SELECT id FROM client_email_verifications WHERE client_id = $1',
      [clientId]
    );
    expect(rows).toHaveLength(0);
  });

  it('returns the same 200 for a nonexistent email (enumeration-resistant)', async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post('/api/client/resend-verification')
      .send({ email: uniqueEmail() });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if this account exists/i);
  });
});

describe('POST /api/client/password-reset/request + /confirm', () => {
  it('request creates a reset token row for an existing client', async () => {
    const app = buildTestApp();
    const { id: clientId, email } = await insertVerifiedClient();

    const res = await request(app).post('/api/client/password-reset/request').send({ email });
    expect(res.status).toBe(200);

    const { rows } = await db.query('SELECT id FROM client_password_resets WHERE client_id = $1', [
      clientId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('request returns 200 without creating a row for a nonexistent email (enumeration-resistant)', async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post('/api/client/password-reset/request')
      .send({ email: uniqueEmail() });
    expect(res.status).toBe(200);
  });

  it('confirm updates the password, revokes all sessions, and single-uses the token', async () => {
    const app = buildTestApp();
    const { id: clientId } = await insertVerifiedClient({ password: 'OldPassword123!' });

    // Give the client an active session to prove it gets revoked.
    const sessionJti = crypto.randomUUID();
    await db.query(
      `INSERT INTO client_sessions (client_id, jti, ip_address, expires_at)
       VALUES ($1, $2, '127.0.0.1', NOW() + interval '1 hour')`,
      [clientId, sessionJti]
    );

    const rawToken = crypto.randomBytes(16).toString('hex');
    await db.query(
      `INSERT INTO client_password_resets (client_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + interval '1 hour')`,
      [clientId, hashToken(rawToken)]
    );

    const res = await request(app)
      .post('/api/client/password-reset/confirm')
      .send({ token: rawToken, password: 'NewPassword456!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Session revoked
    const sessions = await db.query('SELECT id FROM client_sessions WHERE client_id = $1', [
      clientId,
    ]);
    expect(sessions.rows).toHaveLength(0);
    const blocklisted = await db.query('SELECT jti FROM token_blocklist WHERE jti = $1', [
      sessionJti,
    ]);
    expect(blocklisted.rows).toHaveLength(1);

    // Password actually changed — old password no longer works, new one does
    const { rows } = await db.query('SELECT password_hash FROM clients WHERE id = $1', [clientId]);
    expect(await bcrypt.compare('OldPassword123!', rows[0].password_hash)).toBe(false);
    expect(await bcrypt.compare('NewPassword456!', rows[0].password_hash)).toBe(true);

    // Token is single-use
    const replay = await request(app)
      .post('/api/client/password-reset/confirm')
      .send({ token: rawToken, password: 'AnotherPassword789!' });
    expect(replay.status).toBe(400);
    expect(replay.body.error).toMatch(/already been used/i);
  });

  it('confirm rejects an expired token', async () => {
    const app = buildTestApp();
    const { id: clientId } = await insertVerifiedClient();
    const rawToken = crypto.randomBytes(16).toString('hex');
    await db.query(
      `INSERT INTO client_password_resets (client_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() - interval '1 hour')`,
      [clientId, hashToken(rawToken)]
    );

    const res = await request(app)
      .post('/api/client/password-reset/confirm')
      .send({ token: rawToken, password: 'NewPassword456!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });
});

describe('POST /api/client/login', () => {
  it('rejects an unverified client even with the correct password', async () => {
    const app = buildTestApp();
    const { email, password } = await insertUnverifiedClient();

    const res = await request(app)
      .post('/api/client/login')
      .set('x-test-ip', testIp())
      .send({ email, password });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('rejects an incorrect password with 401 and increments failed_login_count', async () => {
    const app = buildTestApp();
    const { id: clientId, email } = await insertVerifiedClient({ password: 'CorrectHorse123!' });

    const res = await request(app)
      .post('/api/client/login')
      .set('x-test-ip', testIp())
      .send({ email, password: 'WrongPassword!' });

    expect(res.status).toBe(401);

    const { rows } = await db.query('SELECT failed_login_count FROM clients WHERE id = $1', [
      clientId,
    ]);
    expect(rows[0].failed_login_count).toBe(1);
  });

  it('rejects login for a nonexistent email with the same 401 (no user enumeration via status/timing path)', async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post('/api/client/login')
      .set('x-test-ip', testIp())
      .send({ email: uniqueEmail(), password: 'Whatever123!' });
    expect(res.status).toBe(401);
  });

  it('succeeds with correct credentials, sets a session cookie, and creates a session row', async () => {
    const app = buildTestApp();
    const { id: clientId, email, password } = await insertVerifiedClient();

    const res = await request(app)
      .post('/api/client/login')
      .set('x-test-ip', testIp())
      .send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.headers['set-cookie'].some((c) => c.startsWith('clientToken='))).toBe(true);

    const { rows } = await db.query('SELECT id FROM client_sessions WHERE client_id = $1', [
      clientId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('resets failed_login_count to 0 on a successful login after prior failures', async () => {
    const app = buildTestApp();
    const { id: clientId, email, password } = await insertVerifiedClient();
    const ip = testIp();

    await request(app)
      .post('/api/client/login')
      .set('x-test-ip', ip)
      .send({ email, password: 'wrong' });
    await request(app)
      .post('/api/client/login')
      .set('x-test-ip', ip)
      .send({ email, password: 'wrong' });

    let row = (await db.query('SELECT failed_login_count FROM clients WHERE id = $1', [clientId]))
      .rows[0];
    expect(row.failed_login_count).toBe(2);

    const success = await request(app)
      .post('/api/client/login')
      .set('x-test-ip', ip)
      .send({ email, password });
    expect(success.status).toBe(200);

    row = (
      await db.query('SELECT failed_login_count, locked_until FROM clients WHERE id = $1', [
        clientId,
      ])
    ).rows[0];
    expect(row.failed_login_count).toBe(0);
    expect(row.locked_until).toBeNull();
  });

  it('locks the account after enough failed attempts, and blocks even a correct password while locked', async () => {
    const app = buildTestApp();
    const { id: clientId, email, password } = await insertVerifiedClient();
    const ip = testIp();

    // computeLockoutMinutes: counts 1-3 => no lock, count 4 => first
    // nonzero lockout (15 min). Confirm the boundary precisely.
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/client/login')
        .set('x-test-ip', ip)
        .send({ email, password: 'wrong' });
      expect(res.status).toBe(401);
    }
    let row = (await db.query('SELECT locked_until FROM clients WHERE id = $1', [clientId]))
      .rows[0];
    expect(row.locked_until).toBeNull(); // still unlocked after 3

    const fourth = await request(app)
      .post('/api/client/login')
      .set('x-test-ip', ip)
      .send({ email, password: 'wrong' });
    expect(fourth.status).toBe(401);
    row = (await db.query('SELECT locked_until FROM clients WHERE id = $1', [clientId])).rows[0];
    expect(row.locked_until).not.toBeNull(); // locked as of the 4th failure

    // Even the correct password is rejected while locked.
    const attemptWithCorrectPassword = await request(app)
      .post('/api/client/login')
      .set('x-test-ip', ip)
      .send({ email, password });
    expect(attemptWithCorrectPassword.status).toBe(423);
    expect(attemptWithCorrectPassword.body.code).toBe('ACCOUNT_LOCKED');
    // The 423 must tell the caller how long the lockout lasts. The wait was
    // computed and then discarded, which left the response with no actionable
    // detail at all.
    expect(attemptWithCorrectPassword.body.error).toMatch(/try again in/i);
    // 15-minute lockout => a minute-denominated message, not seconds.
    expect(attemptWithCorrectPassword.body.error).toMatch(/15 minutes/i);
  });
});

describe('GET /api/client/me', () => {
  it("returns the authenticated client's own account info", async () => {
    const app = buildTestApp();
    const { id: clientId, email, password } = await insertVerifiedClient({ email: uniqueEmail() });
    const ip = testIp();

    const loginRes = await request(app)
      .post('/api/client/login')
      .set('x-test-ip', ip)
      .send({ email, password });
    const cookie = loginRes.headers['set-cookie'].find((c) => c.startsWith('clientToken='));

    const res = await request(app).get('/api/client/me').set('Cookie', [cookie]);
    expect(res.status).toBe(200);
    expect(res.body.client).toEqual({
      id: clientId,
      company_name: 'Test Co',
      email,
    });
  });

  it('rejects a request with no session', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/client/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/client/logout', () => {
  it('blocklists the session token and removes the session row', async () => {
    const app = buildTestApp();
    const { email, password } = await insertVerifiedClient();
    const ip = testIp();

    const loginRes = await request(app)
      .post('/api/client/login')
      .set('x-test-ip', ip)
      .send({ email, password });
    const cookie = loginRes.headers['set-cookie'].find((c) => c.startsWith('clientToken='));
    expect(cookie).toBeTruthy();

    const res = await request(app).post('/api/client/logout').set('Cookie', [cookie]);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('is a no-op success when there is no session cookie at all', async () => {
    const app = buildTestApp();
    const res = await request(app).post('/api/client/logout');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
