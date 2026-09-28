// backend/src/lib/auth-cookie.js
//
// Single source of truth for the session cookie's attributes.
//
// The attributes used to be written out by hand at each call site, and the
// copies had drifted in two ways that are both invisible locally and fatal in
// production. See setAuthCookie / clearAuthCookie below for the details.

import { config } from '../config.js';

function baseCookieFlags() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'none' : 'lax',
    path: '/',
  };
}

/**
 * Attributes for the httpOnly session cookie (adminToken / clientToken).
 *
 * `path` MUST be explicit and MUST be '/'. Set-Cookie without a Path
 * attribute makes the browser derive a default-path from the *request URI*
 * (RFC 6265 5.1.4: the request path minus its last segment). That made the
 * cookie's scope depend on which route happened to set it:
 *
 *   POST /api/admin/login       -> default-path /api/admin     (OK, covers all)
 *   POST /api/admin/mfa/verify  -> default-path /api/admin/mfa (only that subtree)
 *
 * So an admin who cleared MFA got a session cookie scoped to /api/admin/mfa:
 * /api/admin/me, /api/admin/logout and every other admin route did not match
 * that path, the browser withheld the cookie, and the account was locked out
 * of the very session it had just authenticated. Nothing in the test suite
 * could have caught this, because supertest's .set('Cookie', ...) attaches a
 * cookie with no path semantics at all - it only ever exercised the one
 * call site whose derived path happened to be correct.
 *
 * `sameSite` MUST be 'none' in production. The frontend (Vercel) and the API
 * (Render) are genuinely cross-site - see render.yaml's CORS_ORIGIN of
 * https://jinarous.vercel.app and the same reasoning already documented on
 * the csrfToken cookie in middleware/csrf.js. A Strict cookie is not sent on
 * cross-site requests, so 'strict' meant the browser silently withheld the
 * session cookie on every authenticated call and the API answered 401
 * forever. This is the identical bug that was already found and fixed for
 * csrfToken; it was never carried across to the session cookies.
 *
 * In development the two run on localhost, which is the same *site* even
 * though it is a different origin, so 'lax' is both sufficient and correct
 * there, and it avoids needing Secure on a plain-HTTP LAN dev host. The
 * production branch is the one that matters and it fails closed: no
 * isProduction, no http, means 'lax' - a locked-out app, never a lax one.
 *
 * SameSite=None requires Secure, so secure is tied to the same flag rather
 * than left independent.
 *
 * No `domain` is set on purpose, which keeps these cookies host-only. The
 * double-submit CSRF scheme in middleware/csrf.js compares a cookie against a
 * header; its known weakness is that an attacker who can write cookies for
 * the API's domain (i.e. controls a subdomain) can seed both halves. A
 * host-only cookie cannot be overwritten from a sibling subdomain, so leaving
 * `domain` unset is what keeps that attack closed. Do not add it.
 */
export function authCookieOptions(maxAgeMs) {
  return { ...baseCookieFlags(), maxAge: maxAgeMs };
}

/**
 * Attributes for clearing the session cookie.
 *
 * Express's clearCookie serialises an already-expired cookie, and a browser
 * only honours the deletion if the name, domain and path match the cookie
 * being removed. sameSite and secure are not part of that match, but they are
 * included anyway so the two option objects cannot drift apart visually -
 * the drift is what hid this bug. maxAge is deliberately absent: Express
 * treats a maxAge on clearCookie as ambiguous and warns about it.
 */
export function authCookieClearOptions() {
  return baseCookieFlags();
}
