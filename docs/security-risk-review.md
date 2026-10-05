# Security Risk Review

This document records the main technical risk areas identified during a review of the Alux Plaza backend architecture and security middleware.

## Scope reviewed

- `backend/src/index.js`
- `backend/src/config.js`
- `backend/src/middleware/csrf.js`
- `backend/src/middleware/auth.js`
- `backend/src/middleware/rate-limit.js`
- `backend/src/middleware/shieldMiddleware.js`

## Executive summary

The project has a strong security posture overall and appears to be intentionally hardened for a real-world SaaS product. The main risk is not a lack of security controls, but the fragility of a large defense-in-depth stack under real traffic, evolving domain layouts, and false-positive detection conditions.

## Main findings

### 1. Signature-based request shielding can create false positives

The shield middleware inspects the full request body/query and blocks IPs when a detection signature matches. This is a useful defense, but it carries a high operational cost because a legitimate request can be blocked for hours if it contains a string that resembles an attack pattern.

Relevant points:

- The code explicitly states that the detector scans the entire request as one blob.
- It only exempts a small number of endpoints such as login and contact endpoints.
- It blocks the IP and records the event as a severe security incident.

This is a strong defense but only when the detection patterns are highly precise. The biggest maintained risk is false positives on legitimate traffic or free-form input.

### 2. Cross-domain cookie assumptions are brittle

The CSRF cookie is set with `SameSite=None` and `secure: true`, which is correct for a frontend hosted on Vercel and backend on Render. That pattern is intentionally chosen to allow browsers to send cookies across domains.

The risk is operational: if the deployment topology changes, new preview domains are introduced, or cross-domain rules change, this can silently break auth or CSRF validation without a straightforward code fix on the frontend.

### 3. Auth flow is layered and powerful but complex

The backend uses multiple layers:

- JWT verification
- cookie parsing
- role lookup against the database
- token blocklist checks
- endpoint-level RBAC enforcement

This is a healthy architecture, but it increases the number of failure modes. A small change in cookie name, token expiry, role assignment, or revocation logic can cause confusing auth failures.

### 4. Boot-time operational complexity creates more moving parts

The app performs several actions during startup:

- database initialization
- migration checks
- background queue startup
- admin bootstrap checks
- monitoring setup
- stats persistence setup

This is generally a positive sign for deployment, but it increases the chance of partial startup failure or operational drift. Anything that fails early or in the wrong order can leave the app in a confusing state.

## Risk priority

1. False-positive security blocking
2. Cross-domain auth/CSRF brittleness
3. Complex authorization and revocation flow
4. Startup sequencing and partial boot issues

## Recommended mitigations

### A. Reduce false-positive exposure

- Keep attack signatures as narrow as possible.
- Add targeted tests for common legitimate patterns.
- Add a review process for new regex patterns.
- Log and monitor false-positive rates by endpoint and pattern.

### B. Harden deployment assumptions

- Document the exact production domains for all auth and CSRF cookies.
- Keep a single, auditable list of allowed origins.
- Add deployment checks that fail when expected auth cookies are not present.

### C. Keep auth logic simple and observable

- Preserve clear role checks and revoke flows.
- Log auth failures with consistent context.
- Test both happy-path and revoked-token scenarios.

### D. Reduce startup fragility

- Keep boot-time checks explicit and idempotent.
- Add startup health checks before app readiness is advertised.
- Ensure queue and migration failures are visible and clearly categorized.

## Conclusion

The repo is not weakly protected; it is intentionally hardened. The biggest technical risk is that the security stack is large and operationally sensitive. If maintained carefully, it is a strong foundation. If not, the defense-in-depth controls can become fragile and noisy under production conditions.

This review should be treated as a maintenance checklist, not as evidence of a broken application.
