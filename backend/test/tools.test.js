import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import toolsRoutes from '../src/routes/tools.js';
import db from '../src/db.js';

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin/tools', toolsRoutes);
  return app;
}

async function makeAdminTokenAndUser() {
  const email = `test-${Date.now()}@example.com`;
  const hash = bcrypt.hashSync('irrelevant-for-this-test', 10);
  const result = await db.query(
    'INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) RETURNING id',
    [email, hash]
  );
  const token = jwt.sign(
    { sub: result.rows[0].id, email, jti: crypto.randomUUID() },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { email, token };
}

describe('POST /api/admin/tools/run', () => {
  it('rejects requests with no auth token', async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post('/api/admin/tools/run')
      .send({ target: 'https://example.com' });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid/missing target URL with 400', async () => {
    const { token } = await makeAdminTokenAndUser();
    const app = buildTestApp();
    const res = await request(app)
      .post('/api/admin/tools/run')
      .set('Cookie', [`adminToken=${token}`])
      .send({ target: 'not-a-real-url' });
    expect(res.status).toBe(400);
  });

  it('runs a real audit against a live target and persists the result', async () => {
    const { token, email } = await makeAdminTokenAndUser();
    const app = buildTestApp();

    const res = await request(app)
      .post('/api/admin/tools/run')
      .set('Cookie', [`adminToken=${token}`])
      .send({ target: 'https://github.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // runAuthAudit() returns { target, login_path, checks, summary } —
    // checks is a keyed object of individual pass/fail results, not a
    // findings array (that was the old Python tool's shape, before the
    // pure-Node.js rewrite of this route).
    expect(typeof res.body.result.checks).toBe('object');
    expect(Object.keys(res.body.result.checks).length).toBeGreaterThan(0);
    expect(res.body.result.summary).toBeTruthy();
    expect(typeof res.body.result.summary.score).toBe('number');

    const { rows } = await db.query(
      "SELECT * FROM tool_runs WHERE tool = 'auth_audit' AND target = $1 ORDER BY created_at DESC LIMIT 1",
      ['https://github.com']
    );
    expect(rows[0]).toBeTruthy();
    expect(rows[0].status).toBe('completed');
    expect(rows[0].run_by).toBe(email);
    // JSONB columns come back already parsed by the pg driver - no
    // JSON.parse() needed (and calling it would throw on an object).
    expect(Object.keys(rows[0].result_json.checks).length).toBe(
      Object.keys(res.body.result.checks).length
    );
    expect(rows[0].result_json.summary.score).toBe(res.body.result.summary.score);
  }, 30_000); // real network calls involved - needs a longer timeout than default
});

describe('GET /api/admin/tools/runs', () => {
  it('lists past runs, most recent first', async () => {
    const { token } = await makeAdminTokenAndUser();
    await db.query(
      `
      INSERT INTO tool_runs (tool, target, status, summary_json, run_by, created_at)
      VALUES ('auth_audit', 'https://old-example.com', 'completed', $1, 'someone@example.com', '2020-01-01 00:00:00')
    `,
      [JSON.stringify({ PASS: 1, WARN: 0, FAIL: 0, INFO: 0 })]
    );

    const app = buildTestApp();
    const res = await request(app)
      .get('/api/admin/tools/runs')
      .set('Cookie', [`adminToken=${token}`]);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.runs)).toBe(true);
    expect(res.body.runs.length).toBeGreaterThan(0);
  });
});
