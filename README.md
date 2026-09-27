# Alux Plaza

[![CI](https://github.com/sybertoooth7-lgtm/jinarous/actions/workflows/ci.yml/badge.svg)](https://github.com/sybertoooth7-lgtm/jinarous/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/sybertoooth7-lgtm/jinarous/branch/main/graph/badge.svg)](https://codecov.io/gh/sybertoooth7-lgtm/jinarous)
[![CodeQL](https://github.com/sybertoooth7-lgtm/jinarous/actions/workflows/codeql.yml/badge.svg)](https://github.com/sybertoooth7-lgtm/jinarous/actions/workflows/codeql.yml)
[![Secret scanning](https://github.com/sybertoooth7-lgtm/jinarous/actions/workflows/gitleaks.yml/badge.svg)](https://github.com/sybertoooth7-lgtm/jinarous/actions/workflows/gitleaks.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A standards-based cybersecurity consultancy platform for SMEs in East
Africa, grounded in NIST SP 800-61, PCI DSS, and the Kenya Data
Protection Act 2019.

![Admin dashboard](docs/screenshots/admin-dashboard.png)
*Admin dashboard — compliance overview, client list, and security events. (Rendered from `docs/admin-dashboard-mockup.html` with sample data; not a live client's real data.)*

- **Backend:** Node.js/Express (ESM), PostgreSQL, JWT auth (double
  cookie: separate `adminToken` for admins, `clientToken` for clients),
  CSRF via double-submit cookie, Postgres-backed rate limiting (no
  Redis dependency).
- **Frontend:** React 19 / Vite / TypeScript / Tailwind.
- **Repo:** `github.com/sybertoooth7-lgtm/jinarous`
- **Deploy:** frontend on Vercel (`jinarous.vercel.app`), backend on
  Render (free) with a Neon Postgres — see [RENDER_SETUP.md](RENDER_SETUP.md).
- **API reference:** [backend/openapi.yaml](backend/openapi.yaml) —
  every public and client-authenticated endpoint, with request/response
  schemas. Paste it into [editor.swagger.io](https://editor.swagger.io)
  for an interactive view.

## Features

**Client portal** — signup with email verification, password reset,
session management, a live compliance checklist against multiple
frameworks, a computed risk score with a shareable verification link,
and a masked login-history view.

**Admin dashboard** — platform-wide compliance overview, client
management with per-client risk scores, contact-submission triage,
and security operations (active IP blocks with one-click unblock,
a filterable security-events feed).

**Security posture** — the platform practices what it sells: separate
JWT cookies per auth context, CSRF double-submit, account lockout with
escalating timeouts, enumeration-resistant auth responses, an
in-house request scanner (`backend/src/shield/`) that detects and logs
SQLi/XSS/path-traversal attempts, and Postgres-backed rate limiting
with no external cache dependency.

**Service methodology library** (`docs/`) — written methodologies for
ten consultancy offerings (incident response, vulnerability assessment,
compliance readiness, network hardening, backup/encryption review,
access-control audits, threat intelligence, honeypot monitoring, LLM
security review, post-quantum-crypto readiness), plus client-facing
deliverable templates.

**Audit tooling** (`tools/`) — standalone Python/Node scripts backing
several of the above services: authentication audits, backup audits,
network audits, a secrets scanner, an LLM security reviewer, and a
lightweight honeypot/reporting pair.

## Local setup

```bash
# Backend
cd backend
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET (random, ≥32
                       # chars, no dictionary words — config.js checks
                       # this at boot), CORS_ORIGIN
npm install
npm run migrate        # applies backend/migrations/*.sql in order
                       # (also auto-runs on every server boot)
npm run create-admin    # interactive prompt; or set ADMIN_BOOTSTRAP_EMAIL
                        # + ADMIN_BOOTSTRAP_PASSWORD and skip this
npm run dev

# Frontend
cd frontend
npm install
VITE_API_BASE_URL=http://localhost:3001 npm run dev
```

`VITE_API_BASE_URL` is required for any production build
(`npm run build` fails fast without it — see `scripts/check-env.js`) so
the deployed frontend can reach a backend on a different host.

Use Node **20.x** for both packages (see the root `.nvmrc` and each
package's `engines` field) — it's what CI and the production Docker
images run.

## Architecture

![Architecture diagram](docs/architecture-diagram.svg)

## Structure

```
.
├── backend/          Express API (ESM). See backend/README.md.
│   ├── src/
│   │   ├── routes/       Route handlers, grouped by area (client*, admin*)
│   │   ├── shield/       Request scanning, IP blocking, brute-force guard, risk scoring
│   │   ├── middleware/   Auth, RBAC, audit logging, login auditing
│   │   └── lib/          Email, expiry parsing, rate-limit store
│   ├── migrations/       Sequential, idempotent SQL migrations
│   ├── test/             Vitest + supertest, against a real Postgres instance
│   ├── public/admin/     Legacy static admin panel — being phased out,
│   │                     see backend/README.md
│   └── openapi.yaml      API reference for public/client-facing endpoints
├── frontend/          React 19 + Vite + TypeScript + Tailwind
│   ├── src/pages/        One file per route
│   ├── src/components/   Shared UI, including shadcn/ui primitives
│   └── public/           Static assets, robots.txt, sitemap.xml
├── docs/              Service methodology docs + client deliverable templates
├── tools/             Standalone audit/security scripts backing docs/ methodologies
└── .github/workflows/ CI, CodeQL, secret scanning, Vercel status reporting
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local dev conventions, what
CI checks for, and migration guidelines.

## Security

Found a vulnerability? Please see [SECURITY.md](SECURITY.md) rather
than opening a public issue.
