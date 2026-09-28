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
 * Detects a distributed credential attack: many distinct IPs failing against
 * the SAME account, which is precisely the shape that defeats both of the
 * existing defences.
 *
 *   - recordFailedLogin() counts per IP, so a botnet sending 2 attempts from
 *     each of 200 addresses never reaches 5 on any single one.
 *   - The per-account failed_login_count is one shared counter, so it does
 *     eventually trip — but by then it has locked out a paying customer
 *     whose password was guessed correctly by someone else. The block is
 *     real; the signal that it was an attack rather than a fat-fingered user
 *     is not.
 *
 * This is the discriminator the attempts table can provide and the counters
 * cannot: the DISTINCT-IP count. Three attempts from three IPs is a typo
 * spree, a family, or an office. Twenty is a credential-stuffing list.
 *
 * Deliberately observe-only. It logs a security event and alerts, but does
 * NOT block, and does NOT touch failed_login_count — acting on a heuristic
 * here would lock out real customers on a signal that is a guess, and the
 * per-account counter already provides the enforcement. A human decides.
 *
 * Also checks the mirror case: one IP failing against many distinct emails is
 * address enumeration (harvesting which emails have accounts here), which the
 * per-IP counter cannot see at all because it never looks at the email.
 *
 * Fails open and never throws: this sits on the login path.
 */
const DISTINCT_IP_THRESHOLD = 20; // IPs against one account
const DISTINCT_IP_WINDOW_MIN = 30;
const DISTINCT_EMAIL_THRESHOLD = 20; // emails from one IP
const DISTINCT_EMAIL_WINDOW_MIN = 30;

export async function detectDistributedFailure(clientId, email, ip) {
  try {
    // ── Many IPs against one known account ──
    if (clientId) {
      const perAccount = await db.query(
        `SELECT COUNT(DISTINCT ip_address)::int AS ips
         FROM client_login_attempts
         WHERE client_id = $1
           AND success = FALSE
           AND created_at > NOW() - make_interval(mins => $2::int)`,
        [clientId, DISTINCT_IP_WINDOW_MIN]
      );
      const ips = perAccount.rows[0].ips;
      if (ips >= DISTINCT_IP_THRESHOLD) {
        await reportDistributedAttack({
          eventType: 'credential_stuffing',
          severity: 'high',
          detail: `${ips} distinct IPs failed against client account #${clientId} (${email}) in ${DISTINCT_IP_WINDOW_MIN}min`,
          ip,
          identity: `client:${clientId}`,
        });
      }
    }

    // ── One IP against many addresses: enumeration / spraying ──
    // client_id is unreliable here by design: an attacker probing for
    // accounts that don't exist produces client_id NULL rows, so this keys
    // off ip_address + email_attempted, which are recorded either way.
    const perIp = await db.query(
      `SELECT COUNT(DISTINCT email_attempted)::int AS emails
       FROM client_login_attempts
       WHERE ip_address = $1
         AND success = FALSE
         AND created_at > NOW() - make_interval(mins => $2::int)`,
      [ip, DISTINCT_EMAIL_WINDOW_MIN]
    );
    const emails = perIp.rows[0].emails;
    if (emails >= DISTINCT_EMAIL_THRESHOLD) {
      await reportDistributedAttack({
        eventType: 'account_enumeration',
        severity: 'medium',
        detail: `${emails} distinct email addresses attempted from ${ip} in ${DISTINCT_EMAIL_WINDOW_MIN}min`,
        ip,
        identity: `emails-from-${ip}`,
      });
    }
  } catch (err) {
    // Never let detection break a login.
    console.error('[loginAudit] distributed-attack detection failed:', err.message);
  }
}

async function reportDistributedAttack({ eventType, severity, detail, ip, identity }) {
  // Imported lazily to keep this module free of a cycle: eventLogger pulls in
  // db, and monitor.js is the alerting path. A static import would work today
  // but this way the dependency direction stays obvious if either moves.
  const { logSecurityEvent } = await import('../shield/eventLogger.js');
  const { sendAlert } = await import('../monitoring.js');

  await logSecurityEvent({
    ip,
    eventType,
    severity,
    matchedPattern: identity,
    snippet: detail,
    blocked: false,
  });
  await sendAlert(`🔐 ${eventType}: ${detail}`, `shield-${eventType}-${identity}`);
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
