import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import adminDataSubjectsRoutes from '../src/routes/adminDataSubjects.js';
import { requireAuth } from '../src/middleware/auth.js';
import { requireSuperAdmin } from '../src/middleware/rbac.js';
import { DATA_SUBJECT_TABLES } from '../src/lib/dataSubjectColumns.js';
import db from '../src/db.js';

// Mounted exactly as src/index.js mounts it.
function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin/data-subjects', requireAuth, requireSuperAdmin, adminDataSubjectsRoutes);
  return app;
}

async function makeAdmin(role) {
  const email = `ds-${role}-${crypto.randomUUID()}@staff.example.com`;
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

const asAdmin = (token) => ['Cookie', [`adminToken=${token}`]];

// Distinctive markers so a leak of any secret shows up as a plain string match.
function markers() {
  const id = crypto.randomUUID().slice(0, 8);
  return {
    passwordHash: `PWHASH_MARKER_${id}`,
    jti: `JTI_MARKER_${id}`,
    verificationHash: `VERIFYHASH_MARKER_${id}`,
    resetHash: `RESETHASH_MARKER_${id}`,
    shareToken: `SHARETOKEN_MARKER_${id}`,
    staffEmail: `staff-${id}@staff.example.com`,
  };
}

// Seeds one complete person: contacts, a client account with everything
// hanging off it, login attempts, an audit entry that mentions the email, and
// queued email jobs.
async function seedSubject(emailLocal) {
  const email = `${emailLocal}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const mixedCase = email.replace(/^./, (c) => c.toUpperCase()); // stored mixed-case on purpose
  const m = markers();

  await db.query(
    `INSERT INTO contacts (name, email, company, message, status, consented_at)
     VALUES ('Subject Person', $1, 'Subject Co', 'first message', 'new', NOW()),
            ('Subject Person', $2, 'Subject Co', 'second message', 'read', NULL)`,
    [email, mixedCase]
  );

  const client = (
    await db.query(
      `INSERT INTO clients (company_name, email, password_hash, email_verified, consented_at)
       VALUES ('Subject Co Ltd', $1, $2, TRUE, NOW()) RETURNING id`,
      [email, m.passwordHash]
    )
  ).rows[0];
  const clientId = client.id;

  await db.query(
    `INSERT INTO client_sessions (client_id, jti, ip_address, user_agent, expires_at)
     VALUES ($1, $2, '203.0.113.7', 'TestAgent/1.0', NOW() + interval '1 hour')`,
    [clientId, m.jti]
  );
  await db.query(
    `INSERT INTO client_email_verifications (client_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + interval '1 hour')`,
    [clientId, m.verificationHash]
  );
  await db.query(
    `INSERT INTO client_password_resets (client_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + interval '1 hour')`,
    [clientId, m.resetHash]
  );
  await db.query(
    `INSERT INTO risk_score_shares (client_id, token, created_by) VALUES ($1, $2, $3)`,
    [clientId, m.shareToken, m.staffEmail]
  );
  const item = (await db.query('SELECT id FROM compliance_items ORDER BY id LIMIT 1')).rows[0];
  await db.query(
    `INSERT INTO client_compliance_status (client_id, item_id, status, notes, updated_by)
     VALUES ($1, $2, 'passing', 'assessed on site', $3)`,
    [clientId, item.id, m.staffEmail]
  );

  // One attempt linked to the account, one that only knows the email (no client_id).
  await db.query(
    `INSERT INTO client_login_attempts (client_id, email_attempted, ip_address, user_agent, success)
     VALUES ($1, $2, '203.0.113.7', 'TestAgent/1.0', TRUE),
            (NULL, $2, '198.51.100.9', 'OtherAgent/2.0', FALSE)`,
    [clientId, email]
  );

  await db.query(
    `INSERT INTO audit_logs (admin_email, action, target_table, target_id, old_value, new_value)
     VALUES ($1, 'client.create', 'clients', $2, NULL, $3)`,
    [m.staffEmail, clientId, JSON.stringify({ company_name: 'Subject Co Ltd', email })]
  );

  await db.query(
    `INSERT INTO pgboss.job (name, data) VALUES
       ('email', $1), ('email', $2)`,
    [
      JSON.stringify({ kind: 'verification', payload: { email, link: 'https://x.test/a' } }),
      JSON.stringify({ kind: 'newDevice', payload: { email: mixedCase, ip: '203.0.113.7' } }),
    ]
  );

  return { email, clientId, ...m };
}

beforeAll(async () => {
  // pg-boss creates this table itself at runtime; tests don't start pg-boss, so
  // create a minimal stand-in with the two columns the route reads.
  await db.query(
    'CREATE TABLE IF NOT EXISTS pgboss.job (id SERIAL PRIMARY KEY, name TEXT NOT NULL, data JSONB)'
  );
});

afterAll(async () => {
  await db.query('DROP TABLE IF EXISTS pgboss.job');
});

describe('authorisation', () => {
  it.each(['/export', '/erase'])('%s rejects an unauthenticated request with 401', async (path) => {
    const res = await request(buildTestApp())
      .post(`/api/admin/data-subjects${path}`)
      .send({ email: 'someone@example.com' });
    expect(res.status).toBe(401);
  });

  it.each([
    ['admin', '/export'],
    ['admin', '/erase'],
    ['readonly', '/export'],
    ['readonly', '/erase'],
  ])('a %s account gets 403 on %s and nothing is touched', async (role, path) => {
    const { email } = await seedSubject('authz');
    const { token } = await makeAdmin(role);

    const res = await request(buildTestApp())
      .post(`/api/admin/data-subjects${path}`)
      .set(...asAdmin(token))
      .send({ email, confirm: true });

    expect(res.status).toBe(403);
    const contacts = await db.query('SELECT 1 FROM contacts WHERE lower(email) = lower($1)', [
      email,
    ]);
    expect(contacts.rowCount).toBe(2);
  });
});

describe('input validation', () => {
  it.each([
    ['a missing email', {}],
    ['an invalid email', { email: 'not-an-email' }],
    ['an email containing a double quote', { email: '"quoted"@example.com' }],
  ])('rejects %s with 400', async (_label, body) => {
    const { token } = await makeAdmin('superadmin');
    for (const path of ['/export', '/erase']) {
      const res = await request(buildTestApp())
        .post(`/api/admin/data-subjects${path}`)
        .set(...asAdmin(token))
        .send(body);
      expect(res.status).toBe(400);
    }
  });

  it('rejects confirm sent as a string, and erases nothing', async () => {
    const { email } = await seedSubject('strconfirm');
    const { token } = await makeAdmin('superadmin');

    const res = await request(buildTestApp())
      .post('/api/admin/data-subjects/erase')
      .set(...asAdmin(token))
      .send({ email, confirm: 'true' });

    expect(res.status).toBe(400);
    const contacts = await db.query('SELECT 1 FROM contacts WHERE lower(email) = lower($1)', [
      email,
    ]);
    expect(contacts.rowCount).toBe(2);
  });

  it('refuses an admin account email on both endpoints with 409 and leaves the account alone', async () => {
    const target = await makeAdmin('admin');
    const { token } = await makeAdmin('superadmin');

    for (const [path, body] of [
      ['/export', { email: target.email }],
      ['/erase', { email: target.email, confirm: true }],
    ]) {
      const res = await request(buildTestApp())
        .post(`/api/admin/data-subjects${path}`)
        .set(...asAdmin(token))
        .send(body);
      expect(res.status).toBe(409);
    }
    const still = await db.query('SELECT 1 FROM admin_users WHERE email = $1', [target.email]);
    expect(still.rowCount).toBe(1);
  });
});

describe('POST /export', () => {
  it("returns everything held about the person, matched case-insensitively, and none of anyone else's", async () => {
    const subject = await seedSubject('export');
    const other = await seedSubject('bystander');
    const { token } = await makeAdmin('superadmin');

    const res = await request(buildTestApp())
      .post('/api/admin/data-subjects/export')
      .set(...asAdmin(token))
      .send({ email: subject.email.toUpperCase() });

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.found).toBe(true);
    expect(res.body.contacts).toHaveLength(2);
    expect(res.body.contacts.map((c) => c.message).sort()).toEqual([
      'first message',
      'second message',
    ]);
    expect(res.body.client.id).toBe(subject.clientId);
    expect(res.body.client.company_name).toBe('Subject Co Ltd');
    expect(res.body.client.consented_at).toBeTruthy();
    expect(res.body.loginAttempts).toHaveLength(2);
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.riskScoreShares).toHaveLength(1);
    expect(res.body.complianceRecords).toHaveLength(1);
    expect(res.body.complianceRecords[0].status).toBe('passing');
    expect(res.body.complianceRecords[0].framework).toBeTruthy();
    expect(res.body.queuedEmailJobs).toBe(2);
    expect(res.body.auditLog.actionsOnAccount.map((a) => a.action)).toContain('client.create');
    expect(res.body.auditLog.entriesMentioningEmail).toBe(1);

    // Nothing belonging to the bystander appears anywhere.
    const serialised = JSON.stringify(res.body);
    expect(serialised.toLowerCase()).not.toContain(other.email.toLowerCase());
  });

  it('never includes password hashes, session ids, token hashes, share tokens, or staff emails', async () => {
    const subject = await seedSubject('secrets');
    const { token } = await makeAdmin('superadmin');

    const res = await request(buildTestApp())
      .post('/api/admin/data-subjects/export')
      .set(...asAdmin(token))
      .send({ email: subject.email });

    expect(res.status).toBe(200);
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain(subject.passwordHash);
    expect(serialised).not.toContain(subject.jti);
    expect(serialised).not.toContain(subject.verificationHash);
    expect(serialised).not.toContain(subject.resetHash);
    expect(serialised).not.toContain(subject.shareToken);
    expect(serialised).not.toContain(subject.staffEmail);
    expect(res.body.client).not.toHaveProperty('password_hash');
  });

  it('returns found: false with empty collections for an email we hold nothing about', async () => {
    const { token } = await makeAdmin('superadmin');
    const res = await request(buildTestApp())
      .post('/api/admin/data-subjects/export')
      .set(...asAdmin(token))
      .send({ email: `nobody-${crypto.randomUUID()}@example.com` });

    expect(res.status).toBe(200);
    expect(res.body.found).toBe(false);
    expect(res.body.contacts).toEqual([]);
    expect(res.body.client).toBeNull();
    expect(res.body.loginAttempts).toEqual([]);
  });

  it('is audit-logged with counts only, never the subject email', async () => {
    const subject = await seedSubject('exportaudit');
    const admin = await makeAdmin('superadmin');

    await request(buildTestApp())
      .post('/api/admin/data-subjects/export')
      .set(...asAdmin(admin.token))
      .send({ email: subject.email });

    const { rows } = await db.query(
      `SELECT * FROM audit_logs WHERE action = 'data_subject.export' AND admin_email = $1`,
      [admin.email]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].new_value.contacts).toBe(2);
    expect(rows[0].new_value.client_account).toBe(true);
    const text = JSON.stringify(rows[0]).toLowerCase();
    expect(text).not.toContain(subject.email.toLowerCase());
    expect(text).not.toContain(subject.email.split('@')[0].toLowerCase());
  });
});

describe('POST /erase', () => {
  it('without confirm is a dry run: reports what would go, changes nothing, writes no erase audit entry', async () => {
    const subject = await seedSubject('dryrun');
    const admin = await makeAdmin('superadmin');

    const res = await request(buildTestApp())
      .post('/api/admin/data-subjects/erase')
      .set(...asAdmin(admin.token))
      .send({ email: subject.email });

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.wouldErase).toMatchObject({
      contacts: 2,
      client_account: true,
      login_attempts: 2,
      sessions: 1,
      verification_and_reset_tokens: 2,
      risk_score_shares: 1,
      audit_entries_to_redact: 1,
      queued_email_jobs: 2,
    });

    const contacts = await db.query('SELECT 1 FROM contacts WHERE lower(email) = lower($1)', [
      subject.email,
    ]);
    expect(contacts.rowCount).toBe(2);
    const client = await db.query('SELECT email FROM clients WHERE id = $1', [subject.clientId]);
    expect(client.rows[0].email).toBe(subject.email);
    const audit = await db.query(
      `SELECT 1 FROM audit_logs WHERE action = 'data_subject.erase' AND admin_email = $1`,
      [admin.email]
    );
    expect(audit.rowCount).toBe(0);
  });

  it('with confirm: true erases the person everywhere and leaves a bystander completely untouched', async () => {
    const subject = await seedSubject('erase');
    const other = await seedSubject('bystander');
    const admin = await makeAdmin('superadmin');

    const res = await request(buildTestApp())
      .post('/api/admin/data-subjects/erase')
      .set(...asAdmin(admin.token))
      .send({ email: subject.email, confirm: true });

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(false);
    expect(res.body.warnings).toEqual([]);
    expect(res.body.erased).toMatchObject({
      contacts: 2,
      client_account_anonymised: true,
      login_attempts: 2,
      sessions: 1,
      verification_and_reset_tokens: 2,
      risk_score_shares: 1,
      audit_entries_redacted: 1,
      queued_email_jobs: 2,
    });

    // Contacts gone.
    const contacts = await db.query('SELECT 1 FROM contacts WHERE lower(email) = lower($1)', [
      subject.email,
    ]);
    expect(contacts.rowCount).toBe(0);

    // Client account anonymised and unusable, not deleted.
    const client = (await db.query('SELECT * FROM clients WHERE id = $1', [subject.clientId]))
      .rows[0];
    expect(client.email).toBe(`erased-${subject.clientId}@erased.invalid`);
    expect(client.company_name).toBe('[erased]');
    expect(client.password_hash).toBe('!');
    expect(client.email_verified).toBe(false);
    expect(client.consented_at).toBeNull();
    expect(client.disabled_at).toBeTruthy();

    // Everything hanging off the account is gone.
    for (const table of [
      'client_sessions',
      'client_email_verifications',
      'client_password_resets',
      'risk_score_shares',
    ]) {
      const r = await db.query(`SELECT 1 FROM ${table} WHERE client_id = $1`, [subject.clientId]);
      expect(r.rowCount).toBe(0);
    }
    const attempts = await db.query(
      'SELECT 1 FROM client_login_attempts WHERE client_id = $1 OR lower(email_attempted) = lower($2)',
      [subject.clientId, subject.email]
    );
    expect(attempts.rowCount).toBe(0);

    // Compliance assessment kept, now tied to an anonymous account.
    const compliance = await db.query(
      'SELECT status FROM client_compliance_status WHERE client_id = $1',
      [subject.clientId]
    );
    expect(compliance.rowCount).toBe(1);

    // The email is redacted out of the old audit entry; the entry itself stays.
    const old = await db.query(
      `SELECT new_value FROM audit_logs WHERE action = 'client.create' AND target_id = $1`,
      [subject.clientId]
    );
    expect(old.rowCount).toBe(1);
    expect(JSON.stringify(old.rows[0].new_value)).not.toContain(subject.email);
    expect(old.rows[0].new_value.email).toBe('[erased]');
    expect(old.rows[0].new_value.company_name).toBe('Subject Co Ltd');

    // Queued jobs for the address are gone.
    const jobs = await db.query(
      `SELECT 1 FROM pgboss.job WHERE lower(data->'payload'->>'email') = lower($1)`,
      [subject.email]
    );
    expect(jobs.rowCount).toBe(0);

    // The bystander is completely intact.
    expect(
      (await db.query('SELECT 1 FROM contacts WHERE lower(email) = lower($1)', [other.email]))
        .rowCount
    ).toBe(2);
    expect(
      (await db.query('SELECT email FROM clients WHERE id = $1', [other.clientId])).rows[0].email
    ).toBe(other.email);
    expect(
      (await db.query('SELECT 1 FROM client_sessions WHERE client_id = $1', [other.clientId]))
        .rowCount
    ).toBe(1);
    expect(
      (await db.query('SELECT 1 FROM client_login_attempts WHERE client_id = $1', [other.clientId]))
        .rowCount
    ).toBe(1);
    expect(
      (
        await db.query(
          `SELECT 1 FROM pgboss.job WHERE lower(data->'payload'->>'email') = lower($1)`,
          [other.email]
        )
      ).rowCount
    ).toBe(2);
    const otherAudit = await db.query(
      `SELECT new_value FROM audit_logs WHERE action = 'client.create' AND target_id = $1`,
      [other.clientId]
    );
    expect(otherAudit.rows[0].new_value.email).toBe(other.email);
  });

  it('writes an audit entry with counts only, never the subject email', async () => {
    const subject = await seedSubject('eraseaudit');
    const admin = await makeAdmin('superadmin');

    await request(buildTestApp())
      .post('/api/admin/data-subjects/erase')
      .set(...asAdmin(admin.token))
      .send({ email: subject.email, confirm: true });

    const { rows } = await db.query(
      `SELECT * FROM audit_logs WHERE action = 'data_subject.erase' AND admin_email = $1`,
      [admin.email]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].new_value.contacts).toBe(2);
    expect(rows[0].new_value.client_account_anonymised).toBe(true);
    const text = JSON.stringify(rows[0]).toLowerCase();
    expect(text).not.toContain(subject.email.toLowerCase());
    expect(text).not.toContain(subject.email.split('@')[0].toLowerCase());
  });

  it('is repeatable: erasing again changes nothing, and an export afterwards finds nothing', async () => {
    const subject = await seedSubject('twice');
    const { token } = await makeAdmin('superadmin');
    const app = buildTestApp();
    const send = (path, body) =>
      request(app)
        .post(`/api/admin/data-subjects${path}`)
        .set(...asAdmin(token))
        .send(body);

    await send('/erase', { email: subject.email, confirm: true });
    const second = await send('/erase', { email: subject.email, confirm: true });

    expect(second.status).toBe(200);
    expect(second.body.erased).toMatchObject({
      contacts: 0,
      client_account_anonymised: false,
      login_attempts: 0,
      sessions: 0,
      audit_entries_redacted: 0,
      queued_email_jobs: 0,
    });

    const exported = await send('/export', { email: subject.email });
    expect(exported.body.found).toBe(false);
    expect(exported.body.client).toBeNull();
  });

  it('does not touch other people whose email merely contains the same text', async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const subjectEmail = `ann-${tag}@example.com`;
    const lookalike = `joann-${tag}@example.com`; // contains "ann-<tag>@example.com" as a substring
    await db.query(
      `INSERT INTO contacts (name, email, message, status) VALUES
         ('Ann', $1, 'mine', 'new'), ('Joann', $2, 'not mine', 'new')`,
      [subjectEmail, lookalike]
    );
    await db.query(
      `INSERT INTO audit_logs (admin_email, action, target_table, new_value)
       VALUES ('staff@staff.example.com', 'note.add', 'x', $1)`,
      [JSON.stringify({ note: `spoke to ${lookalike} yesterday` })]
    );
    const { token } = await makeAdmin('superadmin');

    await request(buildTestApp())
      .post('/api/admin/data-subjects/erase')
      .set(...asAdmin(token))
      .send({ email: subjectEmail, confirm: true });

    const left = await db.query('SELECT email FROM contacts WHERE email IN ($1, $2)', [
      subjectEmail,
      lookalike,
    ]);
    expect(left.rows.map((r) => r.email)).toEqual([lookalike]);

    // The audit entry about the look-alike person must not be redacted.
    const note = await db.query(
      `SELECT new_value FROM audit_logs WHERE action = 'note.add' AND new_value::text LIKE $1`,
      [`%${lookalike}%`]
    );
    expect(note.rowCount).toBe(1);
    expect(note.rows[0].new_value.note).toBe(`spoke to ${lookalike} yesterday`);
  });
});

describe('schema drift guard', () => {
  it.each(Object.keys(DATA_SUBJECT_TABLES))(
    '%s: every real column is classified as exported or excluded, and nothing is listed that does not exist',
    async (table) => {
      const { rows } = await db.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table]
      );
      const actual = rows.map((r) => r.column_name).sort();
      const classified = [
        ...DATA_SUBJECT_TABLES[table].exported,
        ...DATA_SUBJECT_TABLES[table].excluded,
      ].sort();

      expect(actual.length).toBeGreaterThan(0);
      expect(classified).toEqual(actual);
      // No column may be both exported and excluded.
      const both = DATA_SUBJECT_TABLES[table].exported.filter((c) =>
        DATA_SUBJECT_TABLES[table].excluded.includes(c)
      );
      expect(both).toEqual([]);
    }
  );
});
