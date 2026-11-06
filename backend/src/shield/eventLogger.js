// backend/src/shield/eventLogger.js
import db from '../db.js';

// Widths from migration 011. `path` is the full request URL, which the client
// controls: a URL longer than 500 characters used to make this INSERT throw,
// so the row describing the blocked request was lost precisely when the
// request was most interesting. The snippet column is TEXT and is not clipped.
const LIMITS = {
  ip: 45,
  eventType: 50,
  severity: 20,
  path: 500,
  method: 10,
  matchedPattern: 255,
};

function clip(value, max) {
  if (value == null) return null;
  const text = String(value);
  return text.length <= max ? text : text.slice(0, max);
}

export async function logSecurityEvent({
  ip,
  eventType,
  severity = 'medium',
  path = null,
  method = null,
  matchedPattern = null,
  snippet = null,
  blocked = false,
}) {
  try {
    await db.query(
      `INSERT INTO security_events
         (ip_address, event_type, severity, request_path, request_method, matched_pattern, payload_snippet, blocked)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        clip(ip, LIMITS.ip),
        clip(eventType, LIMITS.eventType),
        clip(severity, LIMITS.severity),
        clip(path, LIMITS.path),
        clip(method, LIMITS.method),
        clip(matchedPattern, LIMITS.matchedPattern),
        snippet,
        blocked,
      ]
    );
  } catch (err) {
    console.error('[eventLogger] Failed to log security event:', err.message);
  }
}
