import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

const sentryEnabled = Boolean(process.env.SENTRY_DSN);

// Request URLs routinely carry verification/reset tokens, and error contexts
// can carry customer emails. Sentry is a third-party service, so scrub those
// before the event leaves the process. Queries, request bodies and breadcrumb
// URLs are all covered; credential-bearing headers are dropped outright.
const REDACT_KEY_RE =
  /^(password|passwd|token|mfaToken|resetToken|verificationToken|secret|authorization|cookie|set-cookie|email|apiKey|api_key)$/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SECRET_QUERY_RE =
  /([?&](?:token|mfaToken|resetToken|verificationToken|backupCode|code|password|secret|key|signature)=)[^&#\s"']+/gi;
// Tokens also travel in the path, not only the query string: the public
// risk-score link is /api/verify/<share token>, a revoked client session is
// DELETE /api/client/sessions/<jti>, and the frontend's email links are
// /client/verify-email/<token> and /client/reset-password/<token> (which can
// appear in backend error text about those emails). sendDefaultPii:false does
// not remove request URLs, so these would otherwise reach Sentry as working
// credentials.
const SECRET_PATH_RE =
  /\/(api\/verify|api\/client\/sessions|client\/verify-email|client\/reset-password|verify)\/[^/?#\s"']+/gi;
const AUTH_HEADER_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g;
const MAX_SCRUB_DEPTH = 8;

function scrubString(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(EMAIL_RE, '[email]')
    .replace(SECRET_QUERY_RE, '$1[redacted]')
    .replace(SECRET_PATH_RE, '/$1/[redacted]')
    .replace(AUTH_HEADER_RE, '$1 [redacted]')
    .replace(JWT_RE, '[token]');
}

export function scrubValue(value, depth = 0) {
  if (depth > MAX_SCRUB_DEPTH) return '[truncated]';
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = REDACT_KEY_RE.test(key) ? '[redacted]' : scrubValue(item, depth + 1);
    }
    return out;
  }
  return value;
}

function scrubEvent(event) {
  if (!event) return event;
  event.message = scrubString(event.message);
  event.transaction = scrubString(event.transaction);
  if (event.request) {
    event.request.url = scrubString(event.request.url);
    event.request.query_string = scrubValue(event.request.query_string);
    event.request.data = scrubValue(event.request.data);
    if (event.request.headers) {
      delete event.request.headers.cookie;
      delete event.request.headers.authorization;
      delete event.request.headers['set-cookie'];
    }
  }
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
  }
  event.extra = scrubValue(event.extra);
  event.contexts = scrubValue(event.contexts);
  event.tags = scrubValue(event.tags);
  event.fingerprint = scrubValue(event.fingerprint);
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((b) => scrubValue(b));
  }
  if (event.exception?.values) {
    event.exception.values = scrubValue(event.exception.values);
  }
  return event;
}

export function initErrorTracking() {
  if (!sentryEnabled) {
    logger.info(
      'SENTRY_DSN not set — error tracking to Sentry is disabled (this is fine for local dev).'
    );
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
    // Never attach cookies, request bodies or user identifiers automatically.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: (breadcrumb) => scrubValue(breadcrumb),
  });
  logger.info('Sentry error tracking initialized.');
}

export function captureError(err, context = {}) {
  logger.error({ err, ...context }, err.message);
  if (sentryEnabled) {
    Sentry.captureException(err, { extra: scrubValue(context) });
  }
}

const ALERT_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes
const ALERT_THROTTLE_MAX_ENTRIES = 500; // hard cap so this can't grow unbounded
const ALERT_BATCH_INTERVAL_MS = 30 * 1000; // aggregate similar alerts before posting to the webhook
const ALERT_BATCH_MAX_ITEMS = 20; // avoid giant webhook payloads during a burst

const alertThrottle = new Map(); // key -> { lastSentAt, count, firstSeenAt, lastSeenAt, message, severity }
let alertFlushTimer = null;

function pruneAlertThrottle() {
  const cutoff = Date.now() - ALERT_THROTTLE_MS;
  for (const [key, record] of alertThrottle) {
    if (record.lastSentAt < cutoff) alertThrottle.delete(key);
  }

  if (alertThrottle.size > ALERT_THROTTLE_MAX_ENTRIES) {
    const excess = alertThrottle.size - ALERT_THROTTLE_MAX_ENTRIES;
    const oldestKeys = [...alertThrottle.entries()]
      .sort((a, b) => a[1].lastSentAt - b[1].lastSentAt)
      .slice(0, excess)
      .map(([key]) => key);
    for (const key of oldestKeys) alertThrottle.delete(key);
  }
}

function scheduleAlertFlush() {
  if (alertFlushTimer) return;
  alertFlushTimer = setTimeout(() => {
    alertFlushTimer = null;
    void flushAlertQueue();
  }, ALERT_BATCH_INTERVAL_MS);
}

function buildAlertSummary(record) {
  const elapsedSeconds = Math.max(1, Math.round((record.lastSeenAt - record.firstSeenAt) / 1000));

  if (record.count <= 1) {
    return record.message;
  }

  const suffix =
    record.count > 1 ? ` [aggregated ${record.count} alerts in ${elapsedSeconds}s]` : '';
  return `${record.message}${suffix}`;
}

async function flushAlertQueue() {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url || alertThrottle.size === 0) return;

  pruneAlertThrottle();

  const entries = [...alertThrottle.entries()];
  const toFlush = entries.slice(0, ALERT_BATCH_MAX_ITEMS);
  const remaining = entries.slice(ALERT_BATCH_MAX_ITEMS);

  alertThrottle.clear();
  for (const [key, record] of remaining) {
    alertThrottle.set(key, record);
  }

  for (const [, record] of toFlush) {
    const summary = buildAlertSummary(record);
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: summary, content: summary }),
        // A hung webhook must not stall the alert queue indefinitely.
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      logger.warn({ err }, 'Failed to send alert webhook');
    }
  }

  if (alertThrottle.size > 0) {
    scheduleAlertFlush();
  }
}

/**
 * Sends a one-line alert to a Slack or Discord incoming webhook, if configured.
 * Similar alerts sharing the same key are coalesced and emitted in a batched
 * digest to reduce alert spam during attack bursts or repeated errors.
 *
 * @param {string} message
 * @param {string} [throttleKey] - alerts sharing a key are rate-limited together
 * @param {object} [options]
 * @param {'low'|'medium'|'high'|'critical'} [options.severity]
 */
export async function sendAlert(message, throttleKey = message, options = {}) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  const key = String(throttleKey || message);
  const now = Date.now();
  const existing = alertThrottle.get(key);

  if (existing) {
    const lastSentAt = existing.lastSentAt;
    const elapsed = now - lastSentAt;

    if (elapsed < ALERT_THROTTLE_MS) {
      existing.count += 1;
      existing.lastSeenAt = now;
      existing.message = message;
      existing.severity = options.severity ?? existing.severity ?? 'medium';
      return;
    }
  }

  alertThrottle.set(key, {
    lastSentAt: now,
    count: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    message,
    severity: options.severity ?? 'medium',
  });

  scheduleAlertFlush();
}

export async function flushAlertsNow() {
  await flushAlertQueue();
}
