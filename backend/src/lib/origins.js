// backend/src/lib/origins.js
// Single source of truth for "which browser origins may talk to this API".
// Used by BOTH the CORS layer (index.js) and the CSRF origin check
// (middleware/csrf.js) so the two can never drift apart again.
import { config } from '../config.js';

// Vercel gives every preview deployment a unique, unpredictable hostname
// (project-<hash>-team.vercel.app), so previews can never be fully enumerated
// in a static allowlist. Matching a pattern is the only way to allow them —
// but the pattern is inherently a wildcard on a *hostname suffix*, and these
// origins are allowed to send the session cookie (CORS `credentials: true`),
// so it may only ever come from the environment.
//
// This used to be hardcoded to a team slug that did not match the repository
// owner's actual Vercel scope. Vercel team slugs are globally unique and any
// unclaimed name can be registered by someone else, who would then be able to
// serve a page from an origin this API treats as trusted — read the CSRF token
// from GET /api/csrf-token (the response body is readable cross-origin) and
// make state-changing requests with the victim's cookies. Unset now means no
// preview origins at all; see VERCEL_PREVIEW_ORIGIN_REGEX in .env.example.
const previewOriginRegex = config.vercelPreviewOriginRegex;

// Normalise any URL-ish string to a bare origin ("https://host[:port]"),
// or null if it cannot be parsed (e.g. the literal string "null").
function toOrigin(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

// Explicit allowlist: CORS_ORIGIN entries plus FRONTEND_URL (if set).
export function getAllowedOrigins() {
  const list = config.corsOrigins.length > 0 ? config.corsOrigins : ['http://localhost:3000'];
  const all = [...list, config.frontendUrl].map(toOrigin).filter(Boolean);
  return [...new Set(all)];
}

export function isAllowedOrigin(value) {
  const origin = toOrigin(value);
  if (!origin) return false;
  if (getAllowedOrigins().includes(origin)) return true;
  // The regex is anchored by whoever configures it; it is intentionally not
  // wrapped in try/catch here because it is compiled and validated once at
  // startup (config.js drops an invalid pattern with a warning).
  return previewOriginRegex ? previewOriginRegex.test(origin) : false;
}
