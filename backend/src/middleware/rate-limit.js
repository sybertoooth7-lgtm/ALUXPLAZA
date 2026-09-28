import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { PostgresRateLimitStore } from '../lib/rate-limit-store.js';

// General API rate limiter — generous, just a backstop against abuse.
//
// `/api/status` is explicitly skipped (see STATUS_PATH below): the public
// landing page polls it on an interval, and at 15s that is 4 req/min, or 60
// per 15-minute window. Folded into this 100-request budget it would eat most
// of a visitor's allowance with purely passive browsing, and because this
// limiter is mounted on `/api` and is not scoped per endpoint, exhausting it
// locks that IP out of admin login, the contact form and the client portal
// alike. Status gets its own generous budget instead.
const STATUS_PATH = '/api/status';
export const isStatusPath = (req) => req.originalUrl.startsWith(STATUS_PATH);

export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PostgresRateLimitStore(),
  skip: isStatusPath,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests, please try again later.',
      retryAfter: 15 * 60,
    });
  },
});

// Read-only public stats. Per-minute window with room for ~16 concurrent
// polling tabs behind a single shared/NAT'd IP, so a busy office or a mobile
// carrier CGNAT still isn't punished for passive visitors. Still a real
// backstop rather than unlimited.
export const statusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.STATUS_RATE_LIMIT_MAX) || 120,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PostgresRateLimitStore(),
  keyGenerator: (req) => `status:${ipKeyGenerator(req.ip)}`,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many status requests, please try again later.' });
  },
});

// Stricter limiter specifically for admin login — separate key prefix so it
// doesn't share a budget with general API traffic, and a stricter cap since
// brute-forcing a login endpoint is the actual threat this defends against.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PostgresRateLimitStore(),
  keyGenerator: (req) => `auth:${ipKeyGenerator(req.ip)}`,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many login attempts, please try again later.',
      retryAfter: 15 * 60,
    });
  },
});

// Contact form gets its own budget, matching CONTACT_RATE_LIMIT_* env vars
// documented in the README.
export const contactLimiter = rateLimit({
  windowMs: (Number(process.env.CONTACT_RATE_LIMIT_WINDOW_MINUTES) || 15) * 60 * 1000,
  max: Number(process.env.CONTACT_RATE_LIMIT_MAX) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PostgresRateLimitStore(),
  keyGenerator: (req) => `contact:${ipKeyGenerator(req.ip)}`,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many submissions, please try again later.' });
  },
});

// Signup / password-reset / resend-verification — separate budget from login
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PostgresRateLimitStore(),
  keyGenerator: (req) => `signup:${ipKeyGenerator(req.ip)}`,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many signup attempts, please try again later.',
      retryAfter: 60 * 60,
    });
  },
});
