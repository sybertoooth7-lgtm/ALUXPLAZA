// backend/src/middleware/loginAudit.js
// Logs every login attempt (success and failure) with IP and metadata.
// Detects new-device logins and can trigger alerts.
// Requires: Redis (for caching known fingerprints per user).

import db from '../db.js';
import { sendNewDeviceAlert } from '../lib/email.js';
import { enqueueEmail } from '../lib/email-queue.js';

const DUMMY_HASH = '$2b$12$c.ByGOhklqTXtY6UiWrCieVW3v1ZsI5tlBj/MfE9V92LjUYa9iuHu';

/**
 * Call this inside your login handler BEFORE sending the response.
 * Logs the attempt and returns whether this is a new device.
 *
 * @param {Object} params
 * @param {number|null} params.clientId
 * @param {string} params.email
 * @param {string} params.ip
 * @param {boolean} params.success
 * @param {string} params.userAgent
 * @returns {Promise<boolean>} true if this is a new device for this client
 */
export async function logLoginAttempt({ clientId, email, ip, success, userAgent }) {
  try {
    await db.query(
      `INSERT INTO client_login_attempts 
       (client_id, email_attempted, ip_address, success, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [clientId, email, ip, success, userAgent || null]
    );
  } catch (err) {
    console.error('[loginAudit] Failed to log attempt:', err.message);
  }
}

/**
 * Checks if this client has ever successfully logged in from this IP before.
 * Uses a simple DB check. For high-traffic apps, cache in Redis.
 *
 * @param {number} clientId
 * @param {string} ip
 * @returns {Promise<boolean>} true if this IP has never been seen
 */
export async function isNewIp(clientId, ip) {
  try {
    const result = await db.query(
      `SELECT 1 FROM client_login_attempts
       WHERE client_id = $1 AND ip_address = $2 AND success = TRUE
       LIMIT 1`,
      [clientId, ip]
    );
    return result.rows.length === 0;
  } catch (err) {
    console.error('[loginAudit] New-IP check failed:', err.message);
    return false;
  }
}

/**
 * Send email alert for a new-device login via Resend (see lib/email.js).
 * Logs regardless of whether the email actually sends, so this is always
 * visible in server logs even when RESEND_API_KEY/FROM_EMAIL aren't set.
 *
 * Enqueued rather than sent inline. This used to `await` a full Resend
 * round-trip directly on the client login request path, holding the
 * response open for the duration of a third-party API call; a Resend
 * slowdown turned into a login slowdown.
 */
export async function alertNewDevice({ clientId, email, ip, userAgent }) {
  console.log(
    `[SECURITY] New device login for client ${clientId} (${email}) from IP ${ip}, UA: ${userAgent}`
  );
  await enqueueEmail(
    'new-device-alert',
    { email, ip, userAgent },
    { fallback: () => sendNewDeviceAlert({ email, ip, userAgent }) }
  );
}

export { DUMMY_HASH };
