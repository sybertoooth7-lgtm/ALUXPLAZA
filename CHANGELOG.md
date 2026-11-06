# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Backend and frontend currently version independently
(`backend/package.json`, `frontend/package.json`) — this file tracks
the application as a whole, by date, rather than a single synchronized
version number.

## [Unreleased]

### Security

- Failed TOTP guesses now count toward the account's lockout: five wrong codes
  lock the account with the same escalating delay as five wrong passwords,
  instead of leaving the 6-digit space protected only by a per-IP limiter.
  A challenge issued before a disable or a lockout can no longer be completed.
- TOTP codes are single-use for MFA enrolment and backup-code regeneration as
  well as login and disable, closing the window where a code observed once
  could authorise a second sensitive action.
- Trusted browser origins no longer include a hardcoded Vercel preview
  wildcard: it named a team slug the project does not control, and any origin
  matching it was allowed to read the CSRF token and send the session cookie
  (CORS credentials). Preview deployments must now opt in with an explicit
  `VERCEL_PREVIEW_ORIGIN_REGEX`; unset rejects them.
- Access logs redact credentials carried in URLs — risk-score share tokens
  (`/api/verify/<token>`), client session ids
  (`/api/client/sessions/<jti>`) and token-like query parameters — instead of
  writing them verbatim to stdout.
- Sentry events (backend and frontend) now redact the same tokens when they
  appear in a URL path, not only in a query string.
- `/api` responses are sent with `Cache-Control: no-store`, so authenticated
  JSON (client records, sessions, MFA state) is not retained in a browser or
  shared cache after sign-out.
- `docker-compose.prod.yml` sets `TRUST_PROXY_HOPS=0`: it publishes the app
  port directly, so trusting a forwarded hop let visitors forge the IP used by
  rate limits and IP blocks.

### Changed

- Runtime moved to Node.js 24.x (Vercel discontinued 20.x): `engines` in root,
  `frontend/` and `backend/` `package.json`, `.nvmrc`, all GitHub Actions
  workflows, and both Dockerfiles (`node:24-alpine`). Docs updated to match.

### Added

- Staff accounts can be re-enabled (`POST /api/admin/users/:id/enable`, superadmin only, audited), and the Users page has Disable / Enable buttons and a "Disabled" label. `GET /api/admin/users` now includes `disabled_at`.
- React admin dashboard (`/admin/dashboard`, `/admin/submissions`,
  `/admin/security`, `/admin/users`) with client list + risk scores,
  contact submission management, IP block/unblock, and security event
  review — bringing full feature parity with (and superseding) the
  legacy static admin panel at `backend/public/admin/`.
- Platform-wide compliance overview endpoint
  (`GET /api/admin/compliance-overview`) and bulk risk-scoring for list
  views (`computeRiskScoreBulk`).
- Pagination on all previously-unbounded list endpoints (clients,
  security blocks/events, admin users, tool runs, risk-score shares).
- `backend/openapi.yaml` — OpenAPI 3.1 spec for all public and
  client-authenticated endpoints.
- React error boundary (route-keyed, so one caught error doesn't wedge
  the whole app) and a 404 page.
- Backend test coverage for `clientAuth.js` and the `shield/` modules
  (signup, login lockout escalation, email verification, password
  reset, request scanning, IP blocklisting, brute-force guarding).
- Prettier + Husky + lint-staged pre-commit hooks.
- Dependabot (`backend`, `frontend`, root tooling, GitHub Actions).
- CodeQL and gitleaks CI workflows.
- `SECURITY.md`, `CONTRIBUTING.md`, issue/PR templates.
- `robots.txt` and `sitemap.xml`.
- One-command local setup (`npm run setup`, `npm run dev` from the
  repo root).
- `engines` field + `.nvmrc` pinning Node 20.x, matching production.

### Fixed

- The frontend build failed because `src/lib/clientStatus.ts`, imported by the client pages, was missing from the repo; it is added.
- The built site used `base: './'`, so opening a nested route directly (including emailed `/client/verify-email/...` and `/client/reset-password/...` links) requested its scripts from the wrong path and showed a blank page. The base is now `/`.
- The client sign-in, sign-up, forgot-password, reset-password and verify-email pages now follow the light/dark theme.
- `react-refresh/only-export-components` lint error in `src/i18n/LanguageProvider.tsx`: the context and hook moved to `languageContext.ts`.
- `adminClients.js`: client creation had lost its `email_verified=TRUE`
  flag, and the compliance-status PATCH route had been overwritten
  with an unrelated `INSERT INTO clients` fragment referencing
  out-of-scope variables — both apparent casualties of a botched merge.
- `email.js`: `isSafeLink()` required `https:` unconditionally, so
  local dev (`http://localhost:3000`) silently swallowed verification
  and password-reset links before they ever reached the dev-mode
  fallback log.
- A stray 1-byte file at `frontend/public` (should have been a
  directory) was breaking every production frontend build outright.
- `express-validator@7` + Express 5 made `req.query` a read-only
  getter, silently breaking `.toInt()`/`.trim()` sanitizers on several
  paginated endpoints (including the pre-existing `/submissions`
  endpoint) — fixed via `matchedData(req)`.
- All GitHub Actions workflows were pinned to `actions/checkout@v4` /
  `actions/setup-node@v4` (Node 20 runtime, removed from GitHub-hosted
  runners in September 2026) — bumped to `@v6` throughout.
- `vercel-checks.yml` contained a genuinely invalid YAML value (an
  unquoted colon inside a string), unrelated to any other change.
- `backend/dockerignore` was missing its leading dot, so Docker was
  never actually reading it.
- Inconsistent Node versions across CI workflows (20 vs. 22) — now
  pinned to 20 everywhere, matching the production Docker images.

### Removed

- Stray AI-tool-generated documents (`VERIFICATION_REPORT.docx`,
  `PATCH_GUIDE.pdf`, `frontend/info.md`) and an orphaned duplicate
  `env.example` at the repo root.
- Unused shadcn/ui components (`carousel.tsx`, `sidebar.tsx`,
  `use-mobile.ts`) that were failing lint and weren't imported anywhere.

---

Entries above this line were reconstructed from recent work rather
than a commit-by-commit history. Going forward, add a dated entry here
for anything a user or contributor would want to know about.
