import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import cluster from 'cluster';
import os from 'os';
import * as bcrypt from './lib/bcrypt-pool.js';
import { JSON_BODY_LIMIT } from './lib/body-limit.js';
import pinoHttp from 'pino-http';

import { config } from './config.js';
import db, { initDb } from './db.js';
import { logger } from './logger.js';
import { initErrorTracking, captureError, sendAlert } from './monitoring.js';
import { recordRequest, loadPersistedValues, persistStats } from './stats.js';
import { startCleanupScheduler } from './jobs/cleanup.js';
import { startEmailQueue, registerEmailWorker, stopEmailQueue } from './lib/email-queue.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendContactNotification,
  sendNewDeviceAlert,
} from './lib/email.js';

import { attachCspNonce, helmetMiddleware } from './middleware/helmetConfig.js';
import { setCsrfCookie, verifyCsrfToken } from './middleware/csrf.js';
import { shield } from './middleware/shieldMiddleware.js';
import { limiter, statusLimiter, authLimiter, signupLimiter } from './middleware/rate-limit.js';
import { verifyLimiter } from './middleware/verify-rate-limit.js';
import { requireAuth } from './middleware/auth.js';
import { requireClientAuth } from './middleware/clientAuth.js';
import { requireAdmin, requireSuperAdmin } from './middleware/rbac.js';

import healthRoutes from './routes/health.js';
import contactRoutes from './routes/contact.js';
import statusRoutes from './routes/status.js';
import toolsRoutes from './routes/tools.js';
import adminRoutes from './routes/admin.js';
import adminMfaRoutes from './routes/adminMfa.js';
import adminUsersRoutes from './routes/adminUsers.js';
import adminSecurityRoutes from './routes/adminSecurity.js';
import adminClientsRoutes from './routes/adminClients.js';
import adminRiskScoreRoutes from './routes/adminRiskScore.js';
import clientAuthRoutes from './routes/clientAuth.js';
import complianceRoutes from './routes/compliance.js';
import clientRiskScoreRoutes from './routes/clientRiskScore.js';
import clientSecurityEventsRoutes from './routes/clientSecurityEvents.js';
import clientSessionRoutes from './routes/clientSessions.js';
import verifyScoreRoutes from './routes/verifyScore.js';

async function startServer() {
  const app = express();

  // Railway's edge is typically 1 hop and strips/normalizes X-Forwarded-For
  // at their proxy — confirmed via Railway support docs, Aug 2026. If you
  // ever add Cloudflare or another proxy in front of Railway, re-verify and
  // likely bump this to 2.
  app.set('trust proxy', 1);

  // attachCspNonce must run BEFORE helmetMiddleware — helmet's scriptSrc/
  // styleSrc directives read res.locals.cspNonce when building the CSP
  // header for this response, so the nonce has to exist first.
  app.use(attachCspNonce);
  app.use(helmetMiddleware);

  const allowedOrigins =
    config.corsOrigins.length > 0 ? config.corsOrigins : ['http://localhost:3000'];

  // Vercel gives every preview deployment a unique, unpredictable hostname
  // (jinarous-<hash>-sybertoooth7-lgtms-projects.vercel.app), so it can
  // never be fully enumerated in a static CORS_ORIGIN allowlist. Match the
  // pattern instead, scoped to this exact Vercel project/org so it can't
  // accidentally allow someone else's Vercel-hosted site.
  const VERCEL_PREVIEW_ORIGIN_RE =
    /^https:\/\/jinarous-[a-z0-9]+-sybertoooth7-lgtms-projects\.vercel\.app$/;

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header (curl, server-to-server, same-origin) — allow.
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || VERCEL_PREVIEW_ORIGIN_RE.test(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Not allowed by CORS: ${origin}`));
      },
      credentials: true,
    })
  );

  app.use(cookieParser());
  app.use(setCsrfCookie);
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(shield);

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const latencyMs = Date.now() - start;
      const isError = res.statusCode >= 500;
      recordRequest(latencyMs, isError);
    });
    next();
  });

  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === '/api/health',
      },
    })
  );

  app.use(verifyCsrfToken);

  // Frontend and backend are on different domains (Vercel + Render), so
  // the frontend's JS can never read the csrfToken cookie directly — a
  // cookie set for onrender.com is invisible to document.cookie running
  // on vercel.app, full stop, regardless of any cookie flags. This route
  // is how the frontend gets the current token instead: a GET request
  // (safe method, no CSRF check needed) that echoes back whatever
  // setCsCookie already put on req.csrfToken above.
  app.get('/api/csrf-token', (req, res) => {
    res.json({ csrfToken: req.csrfToken });
  });

  // Health checks — unauthenticated, unrated, cached to avoid DB exhaustion.
  app.use('/api', healthRoutes);

  app.use('/api', limiter);
  // Must come after `limiter` so status still gets its own budget on top of
  // being skipped by the general one. See middleware/rate-limit.js.
  app.use('/api/status', statusLimiter);
  app.use('/api/admin/login', authLimiter);
  app.use('/api/client/login', authLimiter);
  app.use('/api/verify', verifyLimiter);

  app.use('/api/client/signup', signupLimiter);
  app.use('/api/client/resend-verification', signupLimiter);
  app.use('/api/client/password-reset/request', signupLimiter);

  // Public / readonly-safe admin routes
  app.use('/api/admin', adminRoutes);
  app.use('/api/admin/mfa', requireAuth, adminMfaRoutes);

  // Admin-only routes (readonly blocked)
  app.use('/api/admin/security', requireAuth, requireAdmin, adminSecurityRoutes);
  app.use('/api/admin/clients', requireAuth, requireAdmin, adminClientsRoutes);
  app.use(
    '/api/admin/clients/:id/risk-score-shares',
    requireAuth,
    requireAdmin,
    adminRiskScoreRoutes
  );
  app.use('/api/admin/tools', requireAuth, requireAdmin, toolsRoutes);

  // Superadmin-only routes
  app.use('/api/admin/users', requireAuth, requireSuperAdmin, adminUsersRoutes);

  // Client routes
  app.use('/api/client', clientAuthRoutes);
  app.use('/api/client/compliance', requireClientAuth, complianceRoutes);
  app.use('/api/client/risk-score', requireClientAuth, clientRiskScoreRoutes);
  app.use('/api/client/security-events', requireClientAuth, clientSecurityEventsRoutes);
  app.use('/api/client/sessions', requireClientAuth, clientSessionRoutes);

  // Public routes
  app.use('/api/contact', contactRoutes);
  app.use('/api/status', statusRoutes);
  app.use('/api/verify', verifyScoreRoutes);
  app.use('/admin', express.static('public/admin'));

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed request body' });
    }
    // Body over JSON_BODY_LIMIT. This is a client error, so it is answered
    // with 413 and deliberately kept out of captureError/sendAlert below.
    // Those were firing for every oversized body: an unauthenticated client
    // POSTing >1 MiB got a 500 *and* pushed an "Unhandled error" alert to the
    // monitoring channel, so request size was a lever for spamming alerts with
    // something that is entirely the caller's fault. Now that the limit is
    // enforced at 256 KiB this branch carries real traffic, so the distinction
    // matters rather than being cosmetic.
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large' });
    }
    captureError(err, { path: req.path, method: req.method });
    sendAlert(
      `Unhandled error on ${req.method} ${req.path}: ${err.message}`,
      `${req.method} ${req.path}`
    ).catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = app.listen(config.port, () => {
    logger.info(`Backend listening on port ${config.port}`);
  });

  const statsInterval = setInterval(persistStats, 10_000);
  const cleanupInterval = startCleanupScheduler();

  async function shutdown(signal) {
    logger.info(`${signal} received, shutting down gracefully`);
    clearInterval(statsInterval);
    clearInterval(cleanupInterval);
    await persistStats();
    server.close(async () => {
      // Let in-flight jobs finish before closing the pool, so a shutdown
      // doesn't strand a job mid-send. Bounded by the 10s force-exit below.
      await stopEmailQueue().catch(() => {});
      // Release bcrypt workers so they don't keep the event loop alive.
      await bcrypt.shutdown().catch(() => {});
      await db.end().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function main() {
  await initDb();
  initErrorTracking();
  await loadPersistedValues();

  // Deliberately NOT awaited, and deliberately after initDb() so the pgboss
  // schema from migration 023 exists. pg-boss's first start() installs its own
  // tables, which is slow enough on a cold database to delay the server
  // coming up. A queue problem must never delay or prevent the API serving,
  // so this runs in the background: until it finishes, enqueueEmail() finds no
  // queue and falls back to sending in-process, which is the old behaviour.
  startEmailQueue()
    .then(() =>
      registerEmailWorker({
        verification: (p) => sendVerificationEmail(p),
        'password-reset': (p) => sendPasswordResetEmail(p),
        'contact-notification': (p) => sendContactNotification(p),
        'new-device-alert': (p) => sendNewDeviceAlert(p),
      })
    )
    .catch((err) => console.error('[email-queue] startup failed:', err.message));

  try {
    const { rows } = await db.query('SELECT COUNT(*) AS count FROM admin_users');
    if (parseInt(rows[0].count, 10) === 0) {
      // Hosts without shell access (Render free tier, most PaaS free
      // plans) can't run `npm run create-admin` interactively. These
      // env vars let the very first boot create the initial admin.
      // The branch only ever fires while the table is empty, so the
      // vars become inert after the first login — remove them anyway.
      const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
      const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;

      if (bootstrapEmail && bootstrapPassword) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bootstrapEmail)) {
          logger.error(
            'ADMIN_BOOTSTRAP_EMAIL is not a valid email address — admin bootstrap skipped.'
          );
        } else if (bootstrapPassword.length < 8) {
          logger.error(
            'ADMIN_BOOTSTRAP_PASSWORD is shorter than 8 characters — admin bootstrap skipped.'
          );
        } else {
          const hash = await bcrypt.hash(bootstrapPassword, 12);
          await db.query(
            "INSERT INTO admin_users (email, password_hash, role) VALUES ($1, $2, 'superadmin') ON CONFLICT (email) DO NOTHING",
            [bootstrapEmail, hash]
          );
          logger.warn(`Bootstrapped initial admin account: ${bootstrapEmail}`);
          logger.warn(
            'Remove ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD from the host env vars now.'
          );
        }
      } else {
        logger.warn(
          'No admin users exist yet. Run `npm run create-admin` once, or set ADMIN_BOOTSTRAP_EMAIL + ADMIN_BOOTSTRAP_PASSWORD to create the first admin automatically on boot.'
        );
      }
    } else if (process.env.ADMIN_BOOTSTRAP_EMAIL || process.env.ADMIN_BOOTSTRAP_PASSWORD) {
      // Admin(s) already exist, so these vars have no further effect on
      // this boot — but leaving them set means anyone with read access to
      // your host's env vars (Railway dashboard, a leaked env dump, a
      // screen share) has a working admin email + plaintext password they
      // can try directly against /api/admin/login, independent of whether
      // this bootstrap branch ever runs again. Refuse to boot in
      // production until both are removed, so this can't be silently
      // forgotten past a warning log that scrolls out of view.
      const message =
        'ADMIN_BOOTSTRAP_EMAIL/ADMIN_BOOTSTRAP_PASSWORD are still set but an admin account already exists. Remove both from your host env vars and redeploy.';
      if (config.isProduction) {
        logger.error(message);
        process.exit(1);
      } else {
        logger.warn(message);
      }
    }
  } catch (err) {
    logger.error(`Failed to check for admin users: ${err.message}`);
  }

  await startServer();
}

const clusterModeEnabled = process.env.CLUSTER_MODE === 'true';

if (clusterModeEnabled && cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  logger.info(`Cluster mode: forking ${numCPUs} workers`);
  for (let i = 0; i < numCPUs; i++) cluster.fork();
  cluster.on('exit', (worker) => {
    logger.warn(`Worker ${worker.process.pid} died, forking a replacement`);
    cluster.fork();
  });
} else {
  main().catch((err) => {
    console.error('[index] FATAL: failed to start server:', err);
    process.exit(1);
  });
}
