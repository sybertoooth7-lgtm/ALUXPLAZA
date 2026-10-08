// backend/src/lib/parseExpiry.js

/**
 * Parses a JWT-style expiry string ("2h", "5m", "8h", a bare number of
 * seconds, etc.) into milliseconds. Shared by admin.js and clientAuth.js
 * so cookie/session lifetimes always match config.jwtExpiresIn — keeping
 * this in one place instead of two copies is what prevents them drifting
 * out of sync with each other again.
 */
export function parseExpiryToMs(value, fallbackMs) {
  if (!value) return fallbackMs;
  const match = String(value)
    .trim()
    .match(/^(\d+)\s*(ms|s|m|h|d)?$/i);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const multipliers = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * (multipliers[unit] || 1000);
}
