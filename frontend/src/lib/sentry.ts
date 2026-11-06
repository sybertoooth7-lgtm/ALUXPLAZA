// frontend/src/lib/sentry.ts
// Mirrors backend/src/monitoring.js's pattern: gate on the DSN's
// presence, log a friendly message when it's absent (this is the
// expected, fine state for local dev), same 0.1 trace sample rate.
import * as Sentry from '@sentry/react';
import type { Breadcrumb, Event } from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;
const sentryEnabled = Boolean(dsn);

// Verification and password-reset links carry tokens in the URL, and form
// errors can carry email addresses. Sentry is a third party, so redact both
// before the event leaves the browser.
const REDACT_KEY_RE =
  /^(password|passwd|token|mfaToken|resetToken|verificationToken|secret|authorization|cookie|set-cookie|email|apiKey|api_key)$/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SECRET_QUERY_RE =
  /([?&](?:token|mfaToken|resetToken|verificationToken|backupCode|code|password|secret|key|signature)=)[^&#\s"']+/gi;
const AUTH_HEADER_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g;
const MAX_SCRUB_DEPTH = 8;

function scrubString(value: string): string {
  return value
    .replace(EMAIL_RE, '[email]')
    .replace(SECRET_QUERY_RE, '$1[redacted]')
    .replace(AUTH_HEADER_RE, '$1 [redacted]')
    .replace(JWT_RE, '[token]');
}

export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_SCRUB_DEPTH) return '[truncated]';
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = REDACT_KEY_RE.test(key) ? '[redacted]' : scrubValue(item, depth + 1);
    }
    return out;
  }
  return value;
}

function scrubEvent<T extends Event>(event: T): T {
  if (event.message) event.message = scrubString(event.message);
  if (event.transaction) event.transaction = scrubString(event.transaction);
  if (event.request) {
    if (event.request.url) event.request.url = scrubString(event.request.url);
    if (event.request.query_string) {
      event.request.query_string = scrubValue(event.request.query_string) as string;
    }
    if (event.request.data !== undefined) event.request.data = scrubValue(event.request.data);
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
  event.extra = scrubValue(event.extra) as Record<string, unknown>;
  event.contexts = scrubValue(event.contexts) as Event['contexts'];
  event.tags = scrubValue(event.tags) as Record<string, string>;
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((b) => scrubValue(b) as Breadcrumb);
  }
  if (event.exception?.values) {
    event.exception.values = scrubValue(
      event.exception.values
    ) as NonNullable<Event['exception']>['values'];
  }
  return event;
}

export function initErrorTracking() {
  if (!sentryEnabled) {
    console.info(
      'VITE_SENTRY_DSN not set — error tracking to Sentry is disabled (this is fine for local dev).'
    );
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeBreadcrumb(breadcrumb) {
      return scrubValue(breadcrumb) as Breadcrumb;
    },
    // Defense-in-depth: even if someone pastes a real DSN into their
    // local .env (easy mistake — .env.example doesn't discourage it),
    // don't let localhost noise reach the production Sentry project.
    beforeSend(event) {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1' || host === '') {
        return null;
      }
      return scrubEvent(event);
    },
    // Don't let a misconfigured DSN or a Sentry outage break the app —
    // Sentry's own SDK already fails closed on network errors, this
    // just makes that contract explicit.
  });
}

/**
 * Manually report an error with extra context — e.g. from a catch block
 * that already has a specific fallback UI and doesn't want to rely on
 * the ErrorBoundary catching it.
 */
export function captureError(err: unknown, context: Record<string, unknown> = {}) {
  console.error(err);
  if (sentryEnabled) {
    Sentry.captureException(err, { extra: scrubValue(context) as Record<string, unknown> });
  }
}
