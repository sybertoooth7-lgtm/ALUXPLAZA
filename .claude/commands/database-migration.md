---
name: database-migration
description: Add a numbered SQL migration under backend/migrations and verify it
allowed-tools: ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob']
---

# /database-migration

Use this workflow when changing the PostgreSQL schema in Alux Plaza.

## Goal

Apply a schema change safely, through the migration runner, with the API
contract and the test database kept in step.

## Common Files

- `backend/migrations/NNN_*.sql` — the migrations themselves, applied in
  filename order (currently through `025_add_shield_feedback.sql`)
- `backend/src/migrations-runner.js` — the runner: `_migrations` bookkeeping,
  the per-file transaction, and the boot-time advisory lock
- `backend/src/migrate.js` — CLI entry point (`npm run migrate --prefix backend`)
- `backend/src/db.js` — pg pool
- `backend/src/routes/*` — anything whose request/response shape changes
- `backend/openapi.yaml` — the API reference
- `backend/test/setup.js` — per-test-file database creation and migration

## How the Runner Works

Read `migrations-runner.js` before assuming anything else:

- Files are read from `backend/migrations/`, filtered to `.sql`, and applied in
  **filename sort order**. The numeric prefix is what determines order, so
  pick the next free number — do not reuse a number and do not assume
  `max + 1` (there is no `008`, for instance).
- Applied filenames are recorded in a `_migrations` table keyed by filename.
  A migration never re-runs, so **never edit a migration that has shipped**.
  Add a new file instead.
- Each file runs inside `BEGIN` … `COMMIT` with its `_migrations` insert. If
  the file throws, the whole thing rolls back and the error propagates — so a
  migration must be safe to retry.
- Migrations also run **on every boot**, not only via the CLI. Concurrent
  instances serialise on a Postgres advisory lock with a 30s `lock_timeout`.

## Before You Write the Migration

1. Read the existing `backend/migrations/*.sql` files for the table you are
   changing and confirm the real column types, constraints, and indexes. Do
   not assume.
2. Decide whether the change is additive (safe to deploy before the code that
   reads it), or destructive (requires the code to stop reading it first).
3. Check whether any code queries this table with a `SELECT *` or depends on
   column order — a dropped or reordered column breaks both.

## Suggested Sequence

1. Add `backend/migrations/NNN_<description>.sql`. Write it to be safe against a
   populated production database: `IF NOT EXISTS` / `IF EXISTS` guards, add
   columns with defaults or nullable, backfill, then tighten. Avoid anything
   that cannot run inside a single transaction.
2. Update the code that reads or writes the changed schema.
3. Update `backend/openapi.yaml` if the request or response contract moved.
4. Add or update tests. The test harness migrates a fresh database per file
   (`backend/test/setup.js`), so a migration that only works against seeded
   data will pass CI and fail in production — test the empty-database path.
5. Verify:

   ```bash
   npm run migrate --prefix backend   # apply
   npm test --prefix backend           # full suite
   ```

## Security Checks

- New columns holding credentials, tokens, MFA state, or PII need an
  encryption or masking decision, not a default. Check what the existing
  equivalents do (`authAudit.js`, `adminUsers` route) and match them.
- A new unique or lookup index on a user-supplied identifier is a rate-limit
  and enumeration surface. Confirm it is covered by the existing
  rate-limiting and lockout behaviour.

## Typical Commit Signals

- A new file added under `backend/migrations/`
- Route or repository code updated for the new column
- `openapi.yaml` updated
- Regression test added

Commit subjects in this repo are plain descriptive sentences with no type
prefix — see `.claude/rules/aluxplaza-guardrails.md`.

## Notes

- `fileParallelism` is `false` in `vitest.config.js` on purpose so two test
  files cannot race on database creation. Do not enable it to speed up a
  migration test.
- Do not amend a migration that has already been applied anywhere. Filenames are
  the primary key in `_migrations`, so an edit to a shipped file is silently
  ignored.
- If a migration must be irreversible, write the rollback path and say so in
  the commit body.
