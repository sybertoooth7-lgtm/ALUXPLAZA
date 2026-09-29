# CLAUDE.md

Guidance for Claude Code working in this repository.

## Project

Alux Plaza is a cybersecurity consultancy platform for SMEs in East Africa,
built against NIST SP 800-61, PCI DSS, and the Kenya Data Protection Act 2019.
It has a client portal (compliance checklist, risk score, session management)
and an admin dashboard (client management, security operations, triage).

## Read these before you touch anything

| File                                    | Covers                                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `.claude/rules/aluxplaza-guardrails.md` | Repository-wide invariants: security posture, commit style, architecture, CI gates. **Start here.** |
| `.claude/rules/backend-node.md`         | `backend/` — Node 20, Express 5, ESM, PostgreSQL, vitest                                            |
| `.claude/rules/frontend-react.md`       | `frontend/` — React 19, Vite, TypeScript, Tailwind                                                  |
| `.claude/enterprise/controls.md`        | Approval expectations, data handling, escalation                                                    |

## Stack

- **Backend** (`backend/`): Node 20, Express 5, ESM (`"type": "module"`),
  PostgreSQL via `pg`, JWT auth with separate `adminToken` / `clientToken`
  cookies, CSRF double-submit, Postgres-backed rate limiting, in-house request
  scanner in `src/shield/`, `pg-boss` for background jobs, `pino` logging,
  Sentry, `vitest` with a freshly migrated database per test file.
- **Frontend** (`frontend/`): React 19, Vite 7, TypeScript 5.9, Tailwind 3.4,
  `react-router` 7, Sentry, PWA.
- **Tooling** (`tools/`): standalone Python and Node scripts backing the
  consultancy services.
- **Deploy**: frontend on Vercel, backend on Render with Neon Postgres.
- **API reference**: `backend/openapi.yaml` — treat it as the contract.

## Commands

```bash
# backend
npm run lint    --prefix backend
npm test        --prefix backend
npm run test:coverage --prefix backend
npm run test:nodb --prefix backend     # tests that need no database
npm run migrate --prefix backend

# frontend
npm run lint    --prefix frontend
npm run build   --prefix frontend      # runs tsc -b && vite build

# repo-wide
npm run format          # prettier --write .
npm run format:check
npm run dev             # backend + frontend via concurrently
```

A pre-commit hook runs `lint-staged`, which invokes each package's own ESLint
from its own directory. Do not run the root ESLint across both packages.

## The things most likely to go wrong

1. **Commit style.** This repo does _not_ use conventional-commit prefixes.
   Subjects are plain descriptive sentences that lead with a verb:
   `Close two SSRF bypasses in the auth-audit target check`. Do not add
   `fix:`.
2. **Auth contexts.** Admin and client sessions are separate cookies and
   separate middleware. A guard that accepts one context's token in the other's
   routes is a vulnerability, not a shortcut.
3. **Layer completeness.** Changing a route means `backend/openapi.yaml` and
   the tests change too. Changing the schema means a new numbered file in
   `backend/migrations/`, never an edited query or an amended shipped
   migration.
4. **Two ESLint installs.** `backend/eslint.config.js` and
   `frontend/eslint.config.js` are different configs with different plugin
   sets. Never run one across the other's files.
5. **Postgres-backed rate limiting is deliberate.** There is no Redis, by
   design, so the deploy has no external cache dependency. Do not introduce
   one, and do not raise a limit without reading what it defends.
6. **The product sells security.** Sloppy input handling in a feature is a
   worse outcome than a smaller feature. Run the security checklist in
   `.claude/commands/feature-development.md` before declaring work done.

## Workflows

Slash commands in `.claude/commands/`:

- `/database-migration` — add a numbered SQL migration under
  `backend/migrations/`
- `/feature-development` — full-stack feature implementation
- `/add-language-rules` — add or extend a ruleset under `.claude/rules/`

## Other AI surfaces

`.opencode/` is a parallel OpenCode surface carrying the same ECC-derived
workflow (agents, commands, skills, hooks). If repository conventions change,
update both surfaces.

## Security baseline

- No secrets in source. Everything sensitive comes from the environment.
- `gitleaks` and CodeQL gate merges; do not weaken their configuration to
  unblock a commit.
- Parameterised SQL only, including in `src/shield/`.
- Never log credentials, tokens, MFA codes, or request bodies containing them.
- No real client data in the repo, in fixtures, or in `docs/`.
