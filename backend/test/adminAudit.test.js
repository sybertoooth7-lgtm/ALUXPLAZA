import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import fs from 'node:fs';
import path from 'node:path';
import adminRoutes from '../src/routes/admin.js';
import db from '../src/db.js';

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin', adminRoutes);
  return app;
}

async function makeAdmin(role = 'admin') {
  const email = `audit-${role}-${crypto.randomUUID()}@example.com`;
  const hash = bcrypt.hashSync('irrelevant-for-this-test', 10);
  const result = await db.query(
    'INSERT INTO admin_users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, hash, role]
  );
  const token = jwt.sign(
    { sub: result.rows[0].id, email, role, jti: crypto.randomUUID() },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { email, token };
}

async function makeContact(overrides = {}) {
  const row = {
    name: 'Wanjiru Kamau',
    email: 'wanjiru.kamau@example.co.ke',
    company: 'Kamau Logistics Ltd',
    message: 'We were breached last week and need help urgently.',
    ...overrides,
  };
  const { rows } = await db.query(
    `INSERT INTO contacts (name, email, company, message, status)
     VALUES ($1, $2, $3, $4, 'new') RETURNING id`,
    [row.name, row.email, row.company, row.message]
  );
  return { id: rows[0].id, ...row };
}

describe('DELETE /api/admin/submissions/:id — audit log must not retain the deleted personal data', () => {
  it('deletes the contact and writes an audit entry containing no name, email, company or message', async () => {
    const { email: adminEmail, token } = await makeAdmin('admin');
    const contact = await makeContact();
    const app = buildTestApp();

    const res = await request(app)
      .delete(`/api/admin/submissions/${contact.id}`)
      .set('Cookie', [`adminToken=${token}`]);

    expect(res.status).toBe(200);

    const gone = await db.query('SELECT 1 FROM contacts WHERE id = $1', [contact.id]);
    expect(gone.rowCount).toBe(0);

    const { rows } = await db.query(
      `SELECT * FROM audit_logs WHERE action = 'submission.delete' AND target_id = $1`,
      [contact.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].admin_email).toBe(adminEmail);
    expect(rows[0].target_table).toBe('contacts');

    // The whole audit row, serialised, must not contain any of the contact's personal data.
    const serialised = JSON.stringify(rows[0]);
    expect(serialised).not.toContain(contact.name);
    expect(serialised).not.toContain(contact.email);
    expect(serialised).not.toContain(contact.company);
    expect(serialised).not.toContain('breached');

    // It still records enough to be a useful audit trail.
    expect(rows[0].old_value.status).toBe('new');
    expect(rows[0].old_value.had_company).toBe(true);
    expect(rows[0].old_value.created_at).toBeTruthy();
    expect(rows[0].new_value).toBeNull();
  });

  it('records had_company = false when the submission had no company', async () => {
    const { token } = await makeAdmin('admin');
    const contact = await makeContact({ company: null, email: 'nocompany@example.com' });
    const app = buildTestApp();

    const res = await request(app)
      .delete(`/api/admin/submissions/${contact.id}`)
      .set('Cookie', [`adminToken=${token}`]);
    expect(res.status).toBe(200);

    const { rows } = await db.query(
      `SELECT old_value FROM audit_logs WHERE action = 'submission.delete' AND target_id = $1`,
      [contact.id]
    );
    expect(rows[0].old_value.had_company).toBe(false);
  });

  it('returns 404 and writes no audit entry for a submission that does not exist', async () => {
    const { token } = await makeAdmin('admin');
    const app = buildTestApp();

    const res = await request(app)
      .delete('/api/admin/submissions/99999999')
      .set('Cookie', [`adminToken=${token}`]);

    expect(res.status).toBe(404);
    const { rowCount } = await db.query(
      `SELECT 1 FROM audit_logs WHERE action = 'submission.delete' AND target_id = 99999999`
    );
    expect(rowCount).toBe(0);
  });

  it('rejects a read-only admin with 403 and leaves the contact in place', async () => {
    const { token } = await makeAdmin('readonly');
    const contact = await makeContact({ email: 'keepme@example.com' });
    const app = buildTestApp();

    const res = await request(app)
      .delete(`/api/admin/submissions/${contact.id}`)
      .set('Cookie', [`adminToken=${token}`]);

    expect(res.status).toBe(403);
    const still = await db.query('SELECT 1 FROM contacts WHERE id = $1', [contact.id]);
    expect(still.rowCount).toBe(1);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const app = buildTestApp();
    const res = await request(app).delete('/api/admin/submissions/1');
    expect(res.status).toBe(401);
  });
});

describe('migration 027 — scrubs personal data from legacy submission.delete audit rows', () => {
  const sql = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'migrations', '027_scrub_contact_pii_from_audit_logs.sql'),
    'utf8'
  );

  async function insertAudit(action, oldValue, targetId) {
    const { rows } = await db.query(
      `INSERT INTO audit_logs (admin_email, action, target_table, target_id, old_value)
       VALUES ('legacy-admin@example.com', $1, 'x', $2, $3) RETURNING id`,
      [action, targetId, JSON.stringify(oldValue)]
    );
    return rows[0].id;
  }

  it('rewrites legacy rows to the non-identifying summary, leaves other rows alone, and is idempotent', async () => {
    const legacyId = await insertAudit(
      'submission.delete',
      {
        id: 501,
        name: 'Legacy Person',
        email: 'legacy.person@example.com',
        company: 'Legacy Co',
        message: 'old message body',
        status: 'closed',
        created_at: '2026-01-02T03:04:05.000Z',
      },
      501
    );
    const legacyNoCompanyId = await insertAudit(
      'submission.delete',
      {
        id: 502,
        name: 'No Company',
        email: 'nocompany.legacy@example.com',
        company: null,
        message: 'another body',
        status: 'new',
        created_at: '2026-02-02T03:04:05.000Z',
      },
      502
    );
    // An unrelated audit row that legitimately contains an email key must not be touched.
    const adminDeleteId = await insertAudit(
      'admin_user.delete',
      { id: 7, email: 'former.admin@example.com', role: 'admin' },
      7
    );

    await db.query(sql);
    await db.query(sql); // second run must be a no-op

    const legacy = (await db.query('SELECT old_value FROM audit_logs WHERE id = $1', [legacyId]))
      .rows[0].old_value;
    expect(JSON.stringify(legacy)).not.toContain('Legacy Person');
    expect(JSON.stringify(legacy)).not.toContain('legacy.person@example.com');
    expect(JSON.stringify(legacy)).not.toContain('Legacy Co');
    expect(JSON.stringify(legacy)).not.toContain('old message body');
    expect(legacy).toEqual({
      status: 'closed',
      had_company: true,
      created_at: '2026-01-02T03:04:05.000Z',
    });

    const noCompany = (
      await db.query('SELECT old_value FROM audit_logs WHERE id = $1', [legacyNoCompanyId])
    ).rows[0].old_value;
    expect(noCompany.had_company).toBe(false);
    expect(noCompany.status).toBe('new');

    const adminDelete = (
      await db.query('SELECT old_value FROM audit_logs WHERE id = $1', [adminDeleteId])
    ).rows[0].old_value;
    expect(adminDelete).toEqual({ id: 7, email: 'former.admin@example.com', role: 'admin' });
  });
});
