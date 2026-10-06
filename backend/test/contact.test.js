import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import contactRoutes from '../src/routes/contact.js';
import db from '../src/db.js';

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/contact', contactRoutes);
  return app;
}

describe('POST /api/contact', () => {
  it('accepts a valid submission and stores it in the database', async () => {
    const app = buildTestApp();
    const res = await request(app).post('/api/contact').send({
      name: 'Jane Doe',
      email: 'jane@example.com',
      company: 'Acme Ltd',
      message: 'Interested in an access control audit.',
      consent: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.id).toBe('number');

    const { rows } = await db.query('SELECT * FROM contacts WHERE id = $1', [res.body.id]);
    expect(rows[0]).toBeTruthy();
    expect(rows[0].email).toBe('jane@example.com');
    expect(rows[0].status).toBe('new');
  });

  it('stores special characters exactly as submitted, not double-escaped', async () => {
    // Regression test for the double-escaping bug: contact.js used to call
    // .escape() before storing, on top of dashboard.js already escaping at
    // render time - "AT&T" would end up permanently stored as "AT&amp;T".
    const app = buildTestApp();
    const res = await request(app).post('/api/contact').send({
      name: "O'Brien & Sons",
      email: 'obrien@example.com',
      company: 'AT&T "Ventures"',
      message: 'Quotes " and apostrophes \' and ampersands & should survive intact.',
      consent: true,
    });

    expect(res.status).toBe(201);
    const { rows } = await db.query('SELECT * FROM contacts WHERE id = $1', [res.body.id]);
    expect(rows[0].name).toBe("O'Brien & Sons");
    expect(rows[0].company).toBe('AT&T "Ventures"');
  });

  it('rejects a submission missing required fields with 400', async () => {
    const app = buildTestApp();
    const res = await request(app).post('/api/contact').send({ name: 'OnlyName' });

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it('rejects a submission with an invalid email with 400', async () => {
    const app = buildTestApp();
    const res = await request(app).post('/api/contact').send({
      name: 'Jane Doe',
      email: 'not-an-email',
      message: 'hello',
    });

    expect(res.status).toBe(400);
  });

  it('silently accepts (200, not stored) a bot-shaped submission that fills in the honeypot field', async () => {
    // Deliberately does NOT return 400 for a honeypot trip - telling the
    // bot "you got caught" via a distinct status code just teaches it to
    // avoid the honeypot field next time. A quiet 200 that looks identical
    // to a real success response is the correct behavior here.
    const app = buildTestApp();
    const res = await request(app).post('/api/contact').send({
      name: 'Bot Spam',
      email: 'bot@spam.com',
      message: 'buy now',
      honeypot: 'http://spam.example.com', // real users never fill this in
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('does not store a rejected/honeypot submission in the database', async () => {
    const app = buildTestApp();
    const countBefore = (await db.query('SELECT COUNT(*) AS c FROM contacts')).rows[0].c;

    await request(app).post('/api/contact').send({
      name: 'Bot Spam',
      email: 'bot2@spam.com',
      message: 'buy now',
      honeypot: 'http://spam.example.com',
    });

    const countAfter = (await db.query('SELECT COUNT(*) AS c FROM contacts')).rows[0].c;
    expect(countAfter).toBe(countBefore);
  });
});

describe('POST /api/contact — consent', () => {
  const validBody = {
    name: 'Consent Tester',
    email: 'consent.tester@example.com',
    company: 'Consent Co',
    message: 'Testing the consent requirement.',
  };

  async function contactCount() {
    return Number((await db.query('SELECT COUNT(*) AS c FROM contacts')).rows[0].c);
  }

  it('records consented_at when consent is given', async () => {
    const app = buildTestApp();
    const before = Date.now();
    const res = await request(app)
      .post('/api/contact')
      .send({ ...validBody, consent: true });
    expect(res.status).toBe(201);

    const { rows } = await db.query('SELECT consented_at FROM contacts WHERE id = $1', [
      res.body.id,
    ]);
    expect(rows[0].consented_at).toBeInstanceOf(Date);
    const ts = rows[0].consented_at.getTime();
    expect(ts).toBeGreaterThanOrEqual(before - 5000);
    expect(ts).toBeLessThanOrEqual(Date.now() + 5000);
  });

  it('rejects a submission with no consent field with 400, a consent error, and stores nothing', async () => {
    const app = buildTestApp();
    const countBefore = await contactCount();
    const res = await request(app).post('/api/contact').send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.path === 'consent')).toBe(true);
    expect(await contactCount()).toBe(countBefore);
  });

  it.each([
    ['false', false],
    ['the string "true"', 'true'],
    ['the number 1', 1],
    ['null', null],
  ])('rejects consent sent as %s (only boolean true counts)', async (_label, value) => {
    const app = buildTestApp();
    const countBefore = await contactCount();
    const res = await request(app)
      .post('/api/contact')
      .send({ ...validBody, consent: value });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.path === 'consent')).toBe(true);
    expect(await contactCount()).toBe(countBefore);
  });

  it('still returns the silent 200 for a honeypot hit that also omits consent, and stores nothing', async () => {
    const app = buildTestApp();
    const countBefore = await contactCount();
    const res = await request(app)
      .post('/api/contact')
      .send({ ...validBody, honeypot: 'http://spam.example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(await contactCount()).toBe(countBefore);
  });

  it('leaves consented_at NULL for rows that predate consent capture', async () => {
    const { rows } = await db.query(
      `INSERT INTO contacts (name, email, message, status)
       VALUES ('Legacy', 'legacy.row@example.com', 'old', 'new') RETURNING consented_at`
    );
    expect(rows[0].consented_at).toBeNull();
  });
});
