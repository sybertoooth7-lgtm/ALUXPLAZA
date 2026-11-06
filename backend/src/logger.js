// backend/src/logger.js
import pino from 'pino';

// pino-pretty makes local dev logs readable, but it's a dev convenience
// only — it should never be a hard requirement for booting the app. If
// it's not installed (or NODE_ENV ever ends up unset/misconfigured on a
// host, instead of explicitly "production"), fall back to plain JSON
// lines rather than crashing. Plain JSON is also exactly what you want in
// production anyway, so this fails safe in both directions.
function resolveTransport() {
  if (process.env.NODE_ENV === 'production') return undefined;
  try {
    import.meta.resolve('pino-pretty');
    return { target: 'pino-pretty', options: { colorize: true } };
  } catch {
    return undefined;
  }
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: resolveTransport(),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      'password',
      'passwordHash',
      '*.password',
    ],
    censor: '[REDACTED]',
  },
});

// ── Access-log URL scrubbing ──────────────────────────────────────────────
// pino-http logs req.originalUrl verbatim, and a few bearer credentials are
// carried in the path rather than in headers:
//
//   GET /api/verify/<risk-score share token>   (readable by anyone with the link)
//   DELETE /api/client/sessions/<session jti>  (identifies a live session)
//
// Header redaction above cannot help with those — they are part of the URL —
// so log files, log drains and anything tailing stdout would otherwise hold
// working credentials. Query parameters are covered too, since a token in a
// query string is just as usable as one in a path.
const SENSITIVE_PATH_RES = [
  [/^(\/api\/verify\/)[^/?#]+/i, '$1[redacted]'],
  [/^(\/api\/client\/sessions\/)[^/?#]+/i, '$1[redacted]'],
];
const SENSITIVE_QUERY_RE =
  /([?&](?:token|mfaToken|resetToken|verificationToken|backupCode|code|password|secret|apiKey|key|signature|jti)=)[^&#\s]*/gi;
const SENSITIVE_QUERY_KEY_RE =
  /^(?:token|mfaToken|resetToken|verificationToken|backupCode|code|password|secret|apiKey|key|signature|jti)$/i;

export function scrubUrlForLogging(url) {
  if (typeof url !== 'string') return url;
  let out = url;
  for (const [pattern, replacement] of SENSITIVE_PATH_RES) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(SENSITIVE_QUERY_RE, '$1[redacted]');
}

function scrubQueryForLogging(query) {
  if (!query || typeof query !== 'object') return query;
  const out = {};
  for (const [key, value] of Object.entries(query)) {
    out[key] = SENSITIVE_QUERY_KEY_RE.test(key) ? '[redacted]' : value;
  }
  return out;
}

// pino-http replaces its default `req` serializer with this one, so the URL
// and query it logs are the scrubbed versions while everything else (method,
// timing, status) stays useful.
export const logSerializers = {
  req(req) {
    const serialized = pino.stdSerializers.req(req);
    serialized.url = scrubUrlForLogging(serialized.url);
    if (serialized.query) serialized.query = scrubQueryForLogging(serialized.query);
    return serialized;
  },
};
