# Contributing to Alux Plaza

Thanks for taking a look at this project. This document covers how to
get set up locally and what's expected before a PR gets merged.

## Local setup

Follow the [README](README.md#local-setup) for both `backend/` and
`frontend/`. Use Node **20.x** — see the root `.nvmrc` and each
package's `engines` field. If you use `nvm`:

```bash
nvm use
```

## Before you commit

This repo runs Prettier + ESLint automatically via a Husky pre-commit
hook (set up once with `npm install` at the repo root — see the root
`package.json`). It will:

- Auto-fix formatting and lintable issues in whatever you've staged
- **Block the commit outright** if a file has a real lint error (e.g. a
  reference to an undefined variable) it can't auto-fix

If your commit is rejected, read the error — it's telling you about a
real problem, not being pedantic.

## Before you open a PR

Four CI workflows run on every push and PR against `main`:

- **`ci.yml`** — lint (both packages), TypeScript typecheck, backend
  test suite (against a real Postgres service container), `npm audit`
- **`backend-ci.yml`** / **`frontend-ci.yml`** — a full production
  build of each package. This catches things a typecheck alone won't —
  e.g. a broken static-asset pipeline wouldn't fail `tsc --noEmit`, but
  it would fail an actual `vite build`.
- **`vercel-checks.yml`** — reports lint status back to the Vercel
  deployment check

All of them need to pass before merging. You can run the same checks
locally:

```bash
# Backend
cd backend
npm run lint
npm test

# Frontend
cd frontend
npm run lint
npx tsc --noEmit
npm run build
```

## Database migrations

Migrations live in `backend/migrations/` and run automatically on
server boot, or manually via `npm run migrate`. A few conventions to
follow:

- Number them sequentially (`0NN_description.sql`) and never renumber
  or edit a migration that's already been applied anywhere — add a new
  one instead.
- Use `IF NOT EXISTS` / `IF EXISTS` guards so a migration is safe to
  re-run against a database that's already partway there.
- If you're changing a column that existing code reads, check
  `backend/test/` for coverage first — the test suite spins up a real
  Postgres instance and runs every migration against it, so a genuinely
  broken migration will fail CI, not just silently misbehave in prod.

## Security-sensitive changes

If your change touches authentication, session handling, CSRF, rate
limiting, or anything else with security implications, please read
[SECURITY.md](SECURITY.md) first — there's a short list of invariants
this codebase currently relies on (separate client/admin cookies, no
Redis dependency for rate limiting, enumeration-resistant auth
responses, etc.) that are easy to accidentally break while making an
unrelated change.

## Commit style

No strict format required, but a commit message that explains _why_
(not just _what_) is genuinely helpful for anyone debugging this
codebase in six months — including future you.

## Questions

Open an issue, or see [SECURITY.md](SECURITY.md) if it's something
that shouldn't be public yet.
