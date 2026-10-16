import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');

// config.js is read once at import, so each scenario runs in a real child
// process with a real environment, exactly as in production.
const PROBE = `
const { verifyCsrfToken } = await import('./src/middleware/csrf.js');
const token = 'a'.repeat(43);
const out = {};
for (const origin of JSON.parse(process.env.PROBE_ORIGINS)) {
  out[origin] = await new Promise((resolve) => {
    const req = { method: 'POST', headers: { origin, 'x-csrf-token': token },
      cookies: { csrfToken: token }, ip: '127.0.0.1', path: '/api/x' };
    const res = { status(c) { this.c = c; return this; }, json() { resolve(this.c); } };
    verifyCsrfToken(req, res, () => resolve('pass'));
  });
}
console.log('RESULT:' + JSON.stringify(out));
`;

function probe(env, origins) {
  const stdout = execFileSync('node', ['--input-type=module', '-e', PROBE], {
    cwd: backendRoot,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      JWT_SECRET: 'x'.repeat(48),
      PROBE_ORIGINS: JSON.stringify(origins),
      ...env,
    },
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const line = stdout.split('\n').find((l) => l.startsWith('RESULT:'));
  return JSON.parse(line.slice('RESULT:'.length));
}

const PROD = 'https://jinarous.vercel.app';
const PREVIEW = 'https://jinarous-abc123-sybertoooth7-lgtms-projects.vercel.app';

describe('CSRF origin check uses the same allowlist as CORS', () => {
  it('accepts the CORS_ORIGIN origin even when FRONTEND_URL is unset (the production bug)', () => {
    const r = probe({ CORS_ORIGIN: PROD }, [PROD]);
    expect(r[PROD]).toBe('pass');
  });

  it('accepts Vercel preview origins that CORS already accepts', () => {
    const r = probe({ CORS_ORIGIN: PROD }, [PREVIEW]);
    expect(r[PREVIEW]).toBe('pass');
  });

  it('also accepts FRONTEND_URL when it differs from CORS_ORIGIN', () => {
    const other = 'https://aluxplaza.vercel.app';
    const r = probe({ CORS_ORIGIN: PROD, FRONTEND_URL: other }, [other]);
    expect(r[other]).toBe('pass');
  });

  it('rejects foreign origins with 403', () => {
    const evil = 'https://evil.example.com';
    const lookalike = 'https://jinarous.vercel.app.evil.com';
    const r = probe({ CORS_ORIGIN: PROD }, [evil, lookalike]);
    expect(r[evil]).toBe(403);
    expect(r[lookalike]).toBe(403);
  });

  it('rejects an unparseable Origin (e.g. "null") with 403 instead of throwing', () => {
    const r = probe({ CORS_ORIGIN: PROD }, ['null']);
    expect(r['null']).toBe(403);
  });
});
