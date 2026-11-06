// backend/src/lib/pagination.js
//
// Query strings are attacker-controlled. parseInt() turns a 40-digit "page"
// into a finite float that Postgres cannot represent as a bigint OFFSET, so
// the request fails with a 500 — noise in the logs and in whatever watches
// 5xx responses, triggered by one unauthenticated-looking query parameter.
// Clamping here keeps the arithmetic representable.

export const MAX_PAGE = 100000;

export function parsePage(value, max = MAX_PAGE) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, max);
}

export function parseLimit(value, fallback, max) {
  const n = parseInt(value, 10);
  // 0 and NaN mean "not supplied" here, matching the `|| fallback` idiom this
  // replaced; a negative number is supplied but invalid, so it becomes 1.
  if (!Number.isFinite(n) || n === 0) return fallback;
  return Math.min(Math.max(n, 1), max);
}
