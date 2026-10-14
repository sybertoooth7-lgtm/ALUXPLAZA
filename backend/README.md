# Alux Plaza — Backend

Node.js/Express (ESM) + PostgreSQL API for Alux Plaza. It handles:

- **Contact form submissions** (`POST /api/contact`) — validated,
  honeypot-guarded, rate-limited per IP, stored in PostgreSQL
- **Admin auth & dashboard data** (`/api/admin/*`) — JWT in an
  httpOnly cookie, per-account lockout after repeated failed logins
- **Client portal** (`/api/client/*`, `/api/verify`) — client login,
  compliance tracker, risk-score sharing with verification codes
- **Shield middleware** — request scanning for attack signatures, IP
  blocklisting, and volume abuse detection (see `src/shield/`)
- **Admin dashboard UI** at `/admin` — plain HTML/JS (no build step).
  Legacy panel; the maintained admin UI lives in the React frontend
- **Durable email queue** (`src/lib/email-queue.js`) — pg-boss backed;
  retries with backoff, deletes finished jobs after 24 hours



PostgreSQL is required — there is no SQLite fallback.

## 1. Install

```bash
cd backend
npm install
```

## 2. Configure

```bash
cp .env.example .env
```

Open `.env` and set:

- `DATABASE_URL` — Postgres connection string
- `JWT_SECRET` — long random string:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
  (config.js refuses to boot on weak secrets)
- `CORS_ORIGIN` — the frontend's URL, scheme included

## 3. Migrate & create your admin account

```bash
npm run migrate         # applies migrations/*.sql in filename order
npm run create-admin    # interactive prompt; rerun to reset a password
```

## 4. Run

```bash
npm start        # production
npm run dev      # auto-restarts on file changes
```

The API is live at `http://localhost:3001`. The admin dashboard is the
React app in `frontend/` (routes under `/admin/*` — login, dashboard,
submissions, security, users), served separately in dev via
`cd frontend && npm run dev`.

A legacy static admin panel also still exists at
`http://localhost:3001/admin` (`backend/public/admin/`). It's being
phased out in favor of the React dashboard above, which now covers
everything it did (submissions, IP blocks, security events) plus client
management and compliance reporting that the static panel never had.
Don't build new admin features there — add them to the React app instead.

## Tests

```bash
npm test
```

Vitest suite (`test/`) runs against a real disposable Postgres database
(see `test/setup.js`; override via `TEST_DATABASE_URL`). The role needs
CREATEDB — a fresh uniquely-named DB is created per test file.

## Deploying

Production deploys to Render automatically: pushes to `main` under
`backend/**` run Backend CI, then Render's GitHub integration
auto-deploys the commit. The service is defined by the root-level
`render.yaml` blueprint; full walkthrough (including the free Neon
Postgres setup) is in [RENDER_SETUP.md](../RENDER_SETUP.md).

### Railway

`backend/railway.json` pins the build (Dockerfile), start command
(`node src/index.js`), and healthcheck path (`/api/health`) so Railway
doesn't have to guess. One thing that file can't set for you: Railway's
**Root Directory** must be pointed at `backend` in the service settings
dashboard, or it won't find this config, the `Dockerfile`, or
`package.json` at all. Set your service variables from
`backend/.env.example` — `JWT_SECRET` and `DATABASE_URL` at minimum.

Migrations apply themselves on every boot (`src/db.js`), and the first
admin account can be created without shell access by setting
`ADMIN_BOOTSTRAP_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD` before booting —
the bootstrap fires only while `admin_users` is empty, so remove both
vars after the first login (in production the server refuses to start
while they linger once an admin already exists).

## Security notes

- Passwords bcrypt-hashed (12 rounds); plaintext never stored.
- Sessions are stateless JWTs (default expiry 2h, configurable via
  `JWT_EXPIRES_IN`) delivered as httpOnly cookies; separate cookies for
  admins (`token`) and clients (`clientToken`). Per-account lockout on
  repeated failures for both.
- CSRF double-submit cookie enforced globally on non-GET requests.
- Contact endpoint rate-limited (default 5 / 15 min / IP) plus hidden
  honeypot field; login endpoints have their own stricter limiter.
- Helmet sets a real Content-Security-Policy; CORS restricted to
  `CORS_ORIGIN`.
- Malformed bodies return plain `400` and skip error-tracking noise.

## Monitoring, logging & alerts

- **Logs**: structured JSON via pino/pino-http to stdout; health-check
  pings excluded. Verbosity via `LOG_LEVEL`.
- **Error tracking**: optional Sentry (`SENTRY_DSN`); blank = no-op.
- **Alerts**: optional Slack/Discord webhook (`ALERT_WEBHOOK_URL`) on
  unhandled errors and Shield high-severity blocks; throttled per type.
- **Uptime monitoring**: point external checkers at
  `GET /api/health/deep` (queries the database), not `/api/health`.
- **Durable email queue** (`src/lib/email-queue.js`) — pg-boss backed;
  retries with backoff, deletes finished jobs after 24 hours

