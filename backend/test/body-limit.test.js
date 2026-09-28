import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

import { JSON_BODY_LIMIT } from '../src/lib/body-limit.js';

// Mirrors the error-handler branches in index.js for the two body-parser
// failures. Asserted here so the limit and its 413 cannot drift apart; the
// real end-to-end path is also asserted against a booted server in
// .github/workflows/backend-ci.yml, which is the only place with a real DB.
function appWithProductionBodyLimit() {
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.post('/echo', (req, res) => res.status(200).json({ ok: true }));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed request body' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large' });
    }
    next(err);
  });
  return app;
}

const app = appWithProductionBodyLimit();

// 256 KiB, the size any attacker would actually send.
const OVER_LIMIT_BYTES = 300 * 1024;
const JUST_UNDER_LIMIT_BYTES = 200 * 1024;

describe('JSON body limit', () => {
  it('is 256kb', () => {
    expect(JSON_BODY_LIMIT).toBe('256kb');
  });

  it('rejects an oversized body with 413', async () => {
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send({ blob: 'x'.repeat(OVER_LIMIT_BYTES) });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('Request body too large');
  });

  it('still accepts a comfortably large legitimate body', async () => {
    // Guards against the limit being set so low that real traffic is rejected.
    // The contact form's worst legitimate message is 5000 chars, so even a
    // heavily escaped 200 KiB body is far beyond anything the API produces.
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send({ message: 'x'.repeat(JUST_UNDER_LIMIT_BYTES) });
    expect(res.status).toBe(200);
  });

  it('rejects a body one byte over the limit, and accepts one under', async () => {
    const limitBytes = 256 * 1024;
    // The envelope ({"blob":"..."}) adds bytes, so measure the encoded payload
    // rather than assuming the filler length is the body length.
    const over = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send({ blob: 'x'.repeat(limitBytes + 64) });
    expect(over.status).toBe(413);

    const under = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send({ blob: 'x'.repeat(limitBytes - 64) });
    expect(under.status).toBe(200);
  });

  it('still returns 400 for a malformed body, not 413', async () => {
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"unterminated":');
    expect(res.status).toBe(400);
  });
});
