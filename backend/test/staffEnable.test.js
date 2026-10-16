// Re-enabling a staff account: POST /api/admin/users/:id/enable, and the list
// endpoint exposing disabled_at so the admin UI can show who is disabled.
// The other half of test/staffDisable.test.js.
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import adminUsersRoutes from '../src/routes/adminUsers.js';
import { requireAuth } from '../src/middleware/auth.js';
import { requireSuperAdmin } from '../src/middleware/rbac.js';
import db from '../src/db.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin/users', requireAuth, requireSuperAdmin, adminUsersRoutes);
  app.get('/protected/admin', requireAuth, (_req, res) => res.json({ ok: true }));
  return app;
}

async function insertAdmin(role, { disabled = false } = {}) {
  const email = `enable-${role}-${crypto.randomUUID().slice(0, 8)}@staff.example.com`;
  const hash = bcrypt.hashSync('irrelevant', 4);
  const { rows } = await db.query(
    `INSERT INTO admin_users (email, password_hash, role, disabled_at)
     VALUES ($1, $2, $3, ${disabled ? 'NOW()' : 'NULL'}) RETURNING id`,
    [email, hash, role]
  );
  return { id: rows[0].id, email, role };
}

const tokenFor = (admin) =>
  jwt.sign(
    { sub: admin.id, email: admin.email, role: admin.role, jti: crypto.randomUUID() },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );

const as = (token) => ({ Cookie: [`adminToken=${token}`] });
const enable = (app, id, token) =>
  request(app).post(`/api/admin/users/${id}/enable`).set(as(token));
const disable = (app, id, token) =>
  request(app).post(`/api/admin/users/${id}/disable`).set(as(token));
const stateOf = async (id) =>
  (
    await db.query(
      'SELECT disabled_at, failed_login_count, locked_until FROM admin_users WHERE id = $1',
      [id]
    )
  ).rows[0];
const auditRows = async (action, id) =>
  (
    await db.query(
      'SELECT admin_email, old_value, new_value FROM audit_logs WHERE action = $1 AND target_id = $2',
      [action, String(id)]
    )
  ).rows;

describe('POST /api/admin/users/:id/enable — authorisation', () => {
  it('rejects an unauthenticated request with 401 and enables nobody', async () => {
    const app = buildApp();
    const target = await insertAdmin('admin', { disabled: true });
    const res = await request(app).post(`/api/admin/users/${target.id}/enable`);
    expect(res.status).toBe(401);
    expect((await stateOf(target.id)).disabled_at).not.toBeNull();
  });

  it('rejects a non-superadmin with 403 and enables nobody', async () => {
    const app = buildApp();
    const plain = await insertAdmin('admin');
    const target = await insertAdmin('admin', { disabled: true });
    const res = await enable(app, target.id, tokenFor(plain));
    expect(res.status).toBe(403);
    expect((await stateOf(target.id)).disabled_at).not.toBeNull();
    expect(await auditRows('admin_user.enable', target.id)).toHaveLength(0);
  });

  it('returns 400 for a non-numeric id and 404 for one that does not exist', async () => {
    const app = buildApp();
    const boss = await insertAdmin('superadmin');
    expect((await enable(app, 'abc', tokenFor(boss))).status).toBe(400);
    expect((await enable(app, 999999, tokenFor(boss))).status).toBe(404);
  });
});

describe('POST /api/admin/users/:id/enable', () => {
  it('re-enables the account and writes one audit entry naming the actor, target and role', async () => {
    const app = buildApp();
    const boss = await insertAdmin('superadmin');
    const target = await insertAdmin('admin', { disabled: true });

    const res = await enable(app, target.id, tokenFor(boss));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, alreadyEnabled: false });
    expect((await stateOf(target.id)).disabled_at).toBeNull();

    const rows = await auditRows('admin_user.enable', target.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].admin_email).toBe(boss.email);
    expect(rows[0].old_value).toEqual({ email: target.email, role: 'admin', disabled: true });
    expect(rows[0].new_value).toEqual({ email: target.email, role: 'admin', disabled: false });
  });

  it('a token issued BEFORE the disable works again after the round trip', async () => {
    const app = buildApp();
    const boss = await insertAdmin('superadmin');
    const staff = await insertAdmin('admin');
    const staffToken = tokenFor(staff);
    const bossToken = tokenFor(boss);

    expect((await request(app).get('/protected/admin').set(as(staffToken))).status).toBe(200);
    expect((await disable(app, staff.id, bossToken)).status).toBe(200);
    expect((await request(app).get('/protected/admin').set(as(staffToken))).status).toBe(401);
    expect((await enable(app, staff.id, bossToken)).status).toBe(200);
    expect((await request(app).get('/protected/admin').set(as(staffToken))).status).toBe(200);
  });

  it('clears the failed-login counter and any lockout, so the account does not come back locked', async () => {
    const app = buildApp();
    const boss = await insertAdmin('superadmin');
    const target = await insertAdmin('admin', { disabled: true });
    // Refused sign-ins on a disabled account count as failed logins, so a
    // disabled account that was tried a few times is already locked out.
    await db.query(
      "UPDATE admin_users SET failed_login_count = 7, locked_until = NOW() + interval '1 hour' WHERE id = $1",
      [target.id]
    );

    expect((await enable(app, target.id, tokenFor(boss))).status).toBe(200);
    const state = await stateOf(target.id);
    expect(state.failed_login_count).toBe(0);
    expect(state.locked_until).toBeNull();
  });

  it('is idempotent: enabling an enabled account changes nothing and writes no audit entry', async () => {
    const app = buildApp();
    const boss = await insertAdmin('superadmin');
    const target = await insertAdmin('admin');
    await db.query('UPDATE admin_users SET failed_login_count = 2 WHERE id = $1', [target.id]);

    const res = await enable(app, target.id, tokenFor(boss));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, alreadyEnabled: true });
    expect((await stateOf(target.id)).failed_login_count).toBe(2); // untouched
    expect(await auditRows('admin_user.enable', target.id)).toHaveLength(0);
  });
});

describe('GET /api/admin/users exposes disabled_at', () => {
  it('shows a timestamp for a disabled account and null for an active one', async () => {
    const app = buildApp();
    const boss = await insertAdmin('superadmin');
    const disabled = await insertAdmin('admin', { disabled: true });
    const active = await insertAdmin('admin');

    const res = await request(app)
      .get('/api/admin/users?limit=100')
      .set(as(tokenFor(boss)));
    expect(res.status).toBe(200);
    expect(res.body.users.find((u) => u.id === disabled.id).disabled_at).toBeTruthy();
    expect(res.body.users.find((u) => u.id === active.id).disabled_at).toBeNull();
  });
});
