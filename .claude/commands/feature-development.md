---
name: feature-development
description: Standard feature implementation workflow for backend routes, frontend pages, and their tests
allowed-tools: ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob']
---

# /feature-development

Use this workflow when implementing a feature in Alux Plaza.

## Goal

Ship a change that is complete across every layer it touches — route, schema,
API reference, UI, tests, and docs — rather than only the layer that was
obvious from the request.

## Common Files

- `backend/src/routes/*` — route modules, one per group
- `backend/src/middleware/*` — auth, rbac, csrf, rate-limit, audit, shield
- `backend/src/lib/*` — focused helpers
- `backend/openapi.yaml` — the API reference
- `frontend/src/pages/*`, `frontend/src/sections/*`, `frontend/src/components/*`
- `backend/test/*` — vitest, per-file database
- `docs/*-methodology.md` — the service methodology library

## Suggested Sequence

1. **Understand the current state first.** Read the existing route, the
   middleware chain it sits behind, and the tests that cover it. Most bugs in
   this repo came from changing one layer and not the others.
2. **Write the failing test.** For a security-relevant change, the test must
   fail without the fix — that is the convention several existing commits
   follow.
3. **Implement the smallest coherent change** that satisfies the goal, on the
   correct layer. Business logic goes in `lib/`, not in the route handler.
4. **Wire up the layers.** If the endpoint changed, update
   `backend/openapi.yaml` in the same change. If the schema changed, run
   `/database-migration` rather than editing queries by hand.
5. **Verify everything that gates merges:**

   ```bash
   npm run lint   --prefix backend
   npm test       --prefix backend
   npm run lint   --prefix frontend
   npm run build  --prefix frontend
   npm run format:check
   ```

6. Summarise what changed, what was verified, and what still needs review.

## Security Checklist

Run through this before calling the work done:

- [ ] No secrets introduced; nothing sensitive logged
- [ ] All request input validated with `express-validator`
- [ ] SQL is parameterised
- [ ] The endpoint has the correct auth guard **and** the correct context
      (`adminToken` vs `clientToken`)
- [ ] CSRF middleware is present on any state-changing route
- [ ] Rate limiting is in place, and no existing limit was raised
- [ ] Error messages do not leak internal detail
- [ ] The change does not weaken enumeration resistance in `lib/authAudit.js`
      without a matching test and an explicit decision

## Typical Commit Signals

- Route handler and/or lib helper added
- Middleware wired into the chain
- `openapi.yaml` updated
- Tests added alongside the fix
- Methodology or README updated if the feature is client-facing

## Notes

- This repository sells security services. A feature that is functionally
  correct but sloppy about input handling is a worse outcome than a smaller
  feature that is tight.
- Do not introduce a new runtime dependency casually — Dependabot, `npm audit`
  in both package CI workflows, and CodeQL all react to it.
- The bundle is split by route and by vendor; add new routes as lazy chunks
  rather than growing the main bundle.
