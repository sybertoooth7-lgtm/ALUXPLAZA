// backend/test/auth-cookie.test.js
//
// Regression tests for the session cookie's Set-Cookie attributes.
//
// Both defects these cover were invisible to the suite as it stood. The
// existing assertions were `.some(c => c.startsWith('clientToken='))` -
// presence only, never attributes - and every other test attaches credentials
// with supertest's `.set('Cookie', ...)`, which carries no path semantics at
// all. A cookie with the wrong Path is indistinguishable from a correct one
// when you hand it straight to supertest, so these tests read the raw
// Set-Cookie header, which is the only place the browser's own rules appear.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');

const SECRET = 'kQ7mZx2Rp9LtVb4WnJf8CyU3HdEa6Ns1Mg5X';

// config.js calls process.exit(1) on an incomplete production config, which
// would kill the test runner if imported in-process - the same reason
// config.test.js shells out. So the helpers are exercised in a real child
// process with a real environment and the real serialized header comes back.
// This also means the assertions are on what a browser would actually parse,
// not on an object shape standing in for it.
function serializeCookie(nodeEnv) {
  // Built from concatenated parts so the JS parser never sees a backtick or a
  // ${...} inside a template literal, and so the child parses it as the
  // ESM it is.
  const script = [
    "import { authCookieOptions, authCookieClearOptions } from './src/lib/auth-cookie.js';",
    '// Serialise through the cookie package that Express itself uses, so the',
    '// output is byte-for-byte what res.cookie() puts on the wire.',
    "import { serialize } from 'cookie';",
    "const set = serialize('adminToken', 'a.jwt.value', authCookieOptions(3600000));",
    "const clear = serialize('adminToken', '', { ...authCookieClearOptions(), expires: new Date(0) });",
    'console.log(JSON.stringify({ set, clear }));',
  ].join('\n');
  const output = execFileSync('node', ['--input-type=module', '-e', script], {
    cwd: backendRoot,
    env: {
      ...process.env,
      NODE_ENV: nodeEnv,
      JWT_SECRET: SECRET,
      CORS_ORIGIN: 'https://jinarous.vercel.app',
      FRONTEND_URL: 'https://jinarous.vercel.app',
    },
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return JSON.parse(output.trim().split('\n').pop());
}

describe('session cookie Set-Cookie attributes (production)', () => {
  it('scopes the cookie to Path=/ instead of deriving it from the request URI', () => {
    const { set } = serializeCookie('production');
    // The assertion that matters most. Without an explicit Path the browser
    // computes one from the request URI (RFC 6265 5.1.4), which made
    // POST /api/admin/mfa/verify mint a cookie scoped to /api/admin/mfa - so a
    // freshly MFA-authenticated admin was locked out of every other route,
    // including logout.
    expect(set).toContain('Path=/');
    // A second Path would be ambiguous, and anything narrower is the bug.
    expect(set.match(/Path=/g)).toHaveLength(1);
  });

  it('sets SameSite=None with Secure, because Vercel and Render are cross-site', () => {
    const { set } = serializeCookie('production');
    // 'strict' is not sent on a cross-site request, so the browser withheld the
    // session cookie on every authenticated call and the API answered 401
    // forever. SameSite=None is only honoured alongside Secure.
    expect(set).toContain('SameSite=None');
    expect(set).toContain('Secure');
  });

  it('keeps the session cookie HttpOnly', () => {
    const { set } = serializeCookie('production');
    // The frontend never reads this cookie; it rides along on
    // credentials:'include'. Exposing it to JS would turn any XSS into a
    // stolen bearer credential.
    expect(set).toContain('HttpOnly');
  });

  it('sets no Domain, so a sibling subdomain cannot overwrite the cookie', () => {
    const { set } = serializeCookie('production');
    // Double-submit CSRF is defeated by an attacker who can seed both halves,
    // which needs write access to a cookie scoped to the API's domain.
    // Host-only keeps that closed; adding `domain` would silently reopen it.
    expect(set).not.toMatch(/Domain=/i);
  });

  it('clears on a path that actually matches the cookie it set', () => {
    const { clear } = serializeCookie('production');
    // A browser only honours a deletion when name, domain and path match, so
    // this is what makes logout work rather than silently leaving a live
    // credential in the browser.
    expect(clear).toContain('Path=/');
    expect(clear).toMatch(/Expires=Thu, 01 Jan 1970/i);
  });
});

describe('session cookie Set-Cookie attributes (development)', () => {
  it('uses SameSite=Lax off production, where both halves run on localhost', () => {
    const { set } = serializeCookie('development');
    // localhost is the same *site* despite the differing port, so Lax is
    // sufficient in dev, and it spares a LAN dev host from needing Secure on
    // plain HTTP. The failure mode here is a locked-out app, never a lax one.
    expect(set).toContain('SameSite=Lax');
    expect(set).not.toContain('SameSite=None');
  });

  it('still scopes to Path=/ in development', () => {
    const { set } = serializeCookie('development');
    // SameSite varies by environment; the path does not. It was never an
    // environment-dependent setting to begin with.
    expect(set).toContain('Path=/');
  });
});
