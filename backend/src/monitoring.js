import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

const sentryEnabled = Boolean(process.env.SENTRY_DSN);

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
  });
  logger.info('Sentry error tracking initialized.');
}

export function captureError(err, context = {}) {
  logger.error({ err, ...context }, err.message);
  if (sentryEnabled) {
    Sentry.captureException(err, { extra: context });
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
