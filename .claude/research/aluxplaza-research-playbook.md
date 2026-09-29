# Alux Plaza Research Playbook

Use this when the task is documentation-heavy, source-sensitive, or requires
broad repository context — for example writing one of the methodologies in
`docs/`, reviewing an advisory, or answering a question that spans the backend,
the frontend, and the deploy configuration.

## Defaults

- Prefer primary documentation and direct source links. For this repo that
  means `backend/openapi.yaml`, the schema in `migrations-runner.js`, and the
  live endpoint — not a blog post.
- Include concrete dates when facts may change over time. Dependency versions,
  framework behaviour, and regulatory references (NIST SP 800-61, PCI DSS,
  the Kenya Data Protection Act 2019) all drift.
- Keep a short evidence trail for each recommendation or conclusion: the file
  path, the command you ran, or the link you followed.

## Suggested Flow

1. Inspect local code and docs first. `README.md`, `docs/*-methodology.md`,
   `CONTRIBUTING.md`, and the existing methodology files set the house style
   and the scope of what this product actually does.
2. Browse only for unstable or external facts — current CVEs, framework
   releases, standards revisions.
3. Be precise about what is verified versus assumed. A methodology document
   that reads as authoritative while resting on an unverified claim is a
   liability, given what this platform sells.
4. Summarise findings with file paths, commands, or links.

## Writing a Methodology

Most of `docs/` follows a recognisable shape. Before starting a new one, read
an existing sibling and match its structure — scope, methodology, evidence
collection, findings, remediation, and the standards it maps to.

- Write for a client audience that is an SME in East Africa, not for a
  regulator. Practical and specific beats exhaustive.
- Never invent findings, client names, or scan output. The one screenshot in
  `docs/` is explicitly labelled as rendered from a mockup with sample data;
  follow that precedent.
- Keep real client data out of the repository entirely. `gitleaks` and the
  repo's own secret-scanning posture assume nothing sensitive lands here.

## Repo Signals

- Primary languages: JavaScript (ESM) and TypeScript
- Backend: Node 20, Express 5, PostgreSQL (`pg`), vitest, pino, Sentry, pg-boss
- Frontend: React 19, Vite, TypeScript, Tailwind, react-router
- Tooling: Python scripts in `tools/`, Node scripts in `tools/`
- Frameworks: Express (backend), React Router (frontend)
- Workflows detected: database-migration, feature-development, add-language-rules
- Deploy: Vercel (frontend), Render (backend) with Neon Postgres
