// backend/src/lib/origins.js
// Single source of truth for "which browser origins may talk to this API".
// Used by BOTH the CORS layer (index.js) and the CSRF origin check
// (middleware/csrf.js) so the two can never drift apart again.
import { config } from '../config.js';

// Vercel gives every preview deployment a unique, unpredictable hostname
// (jinarous-<hash>-sybertoooth7-lgtms-projects.vercel.app), so it can never
// be fully enumerated in a static allowlist. Match the pattern instead,
// scoped to this exact Vercel project/org.
export const VERCEL_PREVIEW_ORIGIN_RE =
  /^https:\/\/jinarous-[a-z0-9]+-sybertoooth7-lgtms-projects\.vercel\.app$/;

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
  return getAllowedOrigins().includes(origin) || VERCEL_PREVIEW_ORIGIN_RE.test(origin);
}
