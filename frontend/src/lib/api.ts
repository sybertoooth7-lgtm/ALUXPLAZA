// Centralizes what was previously duplicated in both Contact.tsx and
// DefenseMatrix.tsx (`const API_BASE = import.meta.env.VITE_API_BASE_URL || ''`).
//
// The primary safeguard against a missing VITE_API_BASE_URL is the
// build-time check in scripts/check-env.js (npm's `prebuild` hook), which
// fires whenever someone runs `npm run build`. This runtime check is
// defense-in-depth for the case where the build was produced a different
// way (e.g. a CI/CD pipeline invoking `vite build` directly, bypassing
// npm's prebuild lifecycle hook) - it can't stop a broken build from being
// deployed, but at least it surfaces the problem loudly in the browser
// console rather than failing silently as unexplained 404s.
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

if (!API_BASE && typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
  console.warn(
    '[Alux Plaza] VITE_API_BASE_URL was not set for this build. The contact form and ' +
      'live Defense Matrix metrics will not be able to reach a backend unless this site is ' +
      'served from the exact same origin as the API. See DEPLOYMENT.md.'
  );
}
