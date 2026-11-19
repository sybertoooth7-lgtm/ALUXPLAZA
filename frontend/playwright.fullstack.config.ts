import { defineConfig, devices } from '@playwright/test';
import { ADMIN, API_URL, BACKEND_LOG, FRONTEND_URL } from './e2e-fullstack/support/stack';

/**
 * Full-stack E2E: real browser -> real frontend -> real Express backend ->
 * real PostgreSQL. Nothing is mocked.
 *
 * The frontend is the production build served by `vite preview`, i.e. what
 * actually ships. (The dev server runs React in StrictMode, which double-fires
 * mount effects; a one-time email verification link is then consumed by the
 * first request and the second shows "already used".)
 *
 * Needs a reachable PostgreSQL server and a database whose name ends in "_e2e"
 * (it is wiped at the start of every run). Defaults match backend/.env.example's
 * credentials; override with E2E_DATABASE_URL.
 *
 * Run: npm run test:e2e:fullstack   (from frontend/, after `npm ci` in both
 * frontend/ and backend/).
 *
 * The suite runs serially with no retries on purpose. All requests come from one
 * IP, and the backend rate limits per IP (5 signups/hour, 10 logins/15 min, 100
 * API calls/15 min), so a retried test would spend budget the later tests need.
 */
const databaseUrl =
  process.env.E2E_DATABASE_URL ?? 'postgresql://alux:password@127.0.0.1:5432/alux_plaza_e2e';

export default defineConfig({
  testDir: './e2e-fullstack',
  // Inside folders the frontend's .gitignore already covers.
  outputDir: './test-results/fullstack',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/fullstack' }]]
    : 'list',
  use: {
    baseURL: FRONTEND_URL,
    // The production build registers a PWA service worker; keep it out of the way.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // Reset first (guarded: only a *_e2e database), then boot the real
      // backend with its output captured so specs can read the emailed links.
      command: `node src/scripts/e2e-reset-db.js && node src/index.js > "${BACKEND_LOG}" 2>&1`,
      cwd: '../backend',
      url: `${API_URL}/api/health`,
      // Never attach to a server that is already running: it would have stale
      // data and its output would not be captured.
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        PORT: '3001',
        JWT_SECRET: 'e2e-only-jwt-secret-0123456789abcdef0123456789',
        DATABASE_URL: databaseUrl,
        DB_SSL: 'false',
        CORS_ORIGIN: FRONTEND_URL,
        FRONTEND_URL,
        // Explicitly blank so a developer's own backend/.env can never make
        // the E2E run send real email or report to real monitoring.
        RESEND_API_KEY: '',
        ADMIN_EMAIL: '',
        SENTRY_DSN: '',
        ALERT_WEBHOOK_URL: '',
        ADMIN_MFA_REQUIRED: 'true',
        ADMIN_BOOTSTRAP_EMAIL: ADMIN.email,
        ADMIN_BOOTSTRAP_PASSWORD: ADMIN.password,
        RETENTION_MODE: 'off',
        CLUSTER_MODE: 'false',
      },
    },
    {
      // `npm run build` type-checks (including these e2e files) and bakes the
      // API URL into the bundle; `preview` then serves that exact build.
      command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
      cwd: '.',
      url: FRONTEND_URL,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        ...process.env,
        VITE_API_BASE_URL: API_URL,
        // Keep source-map upload (a release step) out of E2E builds.
        SENTRY_AUTH_TOKEN: '',
      },
    },
  ],
});
