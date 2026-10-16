// Disabling a staff account: POST /api/admin/users/:id/disable.
// This is the missing half of the 4.8 work — middleware/auth.js already
// rejects every request from a disabled account, but nothing could set
// admin_users.disabled_at.
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

// ── app, mounted the way src/index.js mounts the router ──────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin/users', requireAuth, requireSuperAdmin, adminUsersRoutes);
  app.get('/protected/admin', requireAuth, (_req, res) => res.json({ ok: true }));
  return app;
}

// ── seed helpers ──────────────────────────────────────────────────────────
async function insertAdmin(role) {
  const email = `disable-${role}-${crypto.randomUUID().slice(0, 8)}@staff.example.com`;
  const hash = bcrypt.hashSync('irrelevant', 4); // low rounds: speed, not security, in tests
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

const disable = (app, id, token) =>
  request(app)
    .post(`/api/admin/users/${id}/disable`)
    .set('Cookie', [`adminToken=${token}`]);

const getAs = (app, path, token) =>
  request(app)
    .get(path)
    .set('Cookie', [`adminToken=${token}`]);

const disabledAtOf = async (id) =>
  (await db.query('SELECT disabled_at FROM admin_users WHERE id = $1', [id])).rows[0].disabled_at;

// ── 1. authorisation ──────────────────────────────────────────────────────
describe('POST /api/admin/users/:id/disable — authorisation', () => {
  it('rejects an unauthenticated request with 401 and disables nobody', async () => {
    const app = buildApp();
    const target = await insertAdmin('admin');

    const res = await request(app).post(`/api/admin/users/${target.id}/disable`);

    expect(res.status).toBe(401);
    expect(await disabledAtOf(target.id)).toBeNull();
  });

  it.each(['admin', 'readonly'])('a %s account gets 403 and disables nobody', async (role) => {
    const app = buildApp();
    const actor = await insertAdmin(role);
    const target = await insertAdmin('admin');

    const res = await disable(app, target.id, adminToken(actor));

    expect(res.status).toBe(403);
    expect(await disabledAtOf(target.id)).toBeNull();
  });

  it('returns 400 for a non-numeric id and 404 for one that does not exist, writing no audit entry', async () => {
    const app = buildApp();
    const actor = await insertAdmin('superadmin');

    expect((await disable(app, 'abc', adminToken(actor))).status).toBe(400);
    expect((await disable(app, 99999999, adminToken(actor))).status).toBe(404);

    const { rowCount } = await db.query(
      `SELECT 1 FROM audit_logs WHERE action = 'admin_user.disable' AND target_id = 99999999`
    );
    expect(rowCount).toBe(0);
  });
});

// ── 2. the action itself ──────────────────────────────────────────────────
describe('POST /api/admin/users/:id/disable', () => {
  it('disables the account and writes one audit entry recording the actor, target email and role', async () => {
    const app = buildApp();
    const actor = await insertAdmin('superadmin');
    const target = await insertAdmin('admin');

    const res = await disable(app, target.id, adminToken(actor));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.alreadyDisabled).toBe(false);
    expect(new Date(res.body.disabledAt).getTime()).toBeGreaterThan(Date.now() - 60_000);

    const stored = await disabledAtOf(target.id);
    expect(stored).toBeTruthy();
    expect(new Date(stored).getTime()).toBe(new Date(res.body.disabledAt).getTime());

    const audit = await db.query(
      `SELECT * FROM audit_logs WHERE action = 'admin_user.disable' AND target_id = $1`,
      [target.id]
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].admin_email).toBe(actor.email);
    expect(audit.rows[0].target_table).toBe('admin_users');
    expect(audit.rows[0].old_value).toEqual({ email: target.email, role: 'admin' });
    expect(audit.rows[0].new_value).toEqual({ email: target.email, role: 'admin', disabled: true });
  });

  it('cannot be aimed at the caller: a superadmin disabling their own account gets 403', async () => {
    const app = buildApp();
    const actor = await insertAdmin('superadmin');

    const res = await disable(app, actor.id, adminToken(actor));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/your own/i);
    expect(await disabledAtOf(actor.id)).toBeNull();
    const audit = await db.query(
      `SELECT 1 FROM audit_logs WHERE action = 'admin_user.disable' AND target_id = $1`,
      [actor.id]
    );
    expect(audit.rowCount).toBe(0);
  });

  it('can disable a superadmin as long as they are not the last active one', async () => {
    const app = buildApp();
    const actor = await insertAdmin('superadmin');
    const peer = await insertAdmin('superadmin');

    const res = await disable(app, peer.id, adminToken(actor));

    expect(res.status).toBe(200);
    expect(await disabledAtOf(peer.id)).toBeTruthy();
  });

  it('is idempotent: a second disable changes nothing and writes no second audit entry', async () => {
    const app = buildApp();
    const actor = await insertAdmin('superadmin');
    const target = await insertAdmin('admin');

    const first = await disable(app, target.id, adminToken(actor));
    const stored = await disabledAtOf(target.id);
    const second = await disable(app, target.id, adminToken(actor));

    expect(second.status).toBe(200);
    expect(second.body.success).toBe(true);
    expect(second.body.alreadyDisabled).toBe(true);
    expect(new Date(second.body.disabledAt).getTime()).toBe(
      new Date(first.body.disabledAt).getTime()
    );
    const after = await disabledAtOf(target.id);
    expect(after.getTime()).toBe(stored.getTime());
    const audit = await db.query(
      `SELECT 1 FROM audit_logs WHERE action = 'admin_user.disable' AND target_id = $1`,
      [target.id]
    );
    expect(audit.rowCount).toBe(1);
  });

  it('after disabling, the account can no longer use a token, whether it was issued before or after', async () => {
    const app = buildApp();
    const actor = await insertAdmin('superadmin');
    const target = await insertAdmin('admin');
    const oldToken = adminToken(target, { issuedSecondsAgo: 600 });

    // Control: the same token works while the account is active.
    expect((await getAs(app, '/protected/admin', oldToken)).status).toBe(200);

    await disable(app, target.id, adminToken(actor));

    const refusedOld = await getAs(app, '/protected/admin', oldToken);
    expect(refusedOld.status).toBe(401);
    expect(refusedOld.body.error).toMatch(/disabled/i);

    // A token issued after the disabling (what a fresh login would get) is refused too.
    const refusedNew = await getAs(app, '/protected/admin', adminToken(target));
    expect(refusedNew.status).toBe(401);
    expect(refusedNew.body.error).toMatch(/disabled/i);
  });
});
