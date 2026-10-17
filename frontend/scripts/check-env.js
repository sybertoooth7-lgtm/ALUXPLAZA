#!/usr/bin/env node
const YELLOW = '\x1b[93m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const RED = '\x1b[91m';

const apiBase = process.env.VITE_API_BASE_URL;
// Vercel does not always set NODE_ENV=production for the build step, which is
// how a production build once shipped with no API URL and only printed the
// warning below. VERCEL_ENV is set by Vercel itself ('production', 'preview' or
// 'development'), so a production deployment is caught either way. Preview
// deployments still only warn.
const isProduction =
  process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';

if (!apiBase) {
  console.error(`
${YELLOW}${BOLD}⚠ WARNING: VITE_API_BASE_URL is not set for this build.${RESET}
${YELLOW}
If your frontend and backend are deployed to DIFFERENT hosts (e.g. Vercel +
Render), this build will have NO way to reach the backend. The contact form
and the "live" Defense Matrix metrics will silently fail with 404s in production.

Set VITE_API_BASE_URL to your deployed backend's URL before building, e.g.:
  VITE_API_BASE_URL=https://your-backend.onrender.com npm run build
${RESET}`);

  if (isProduction) {
    console.error(
      `${RED}${BOLD}Failing build because NODE_ENV=production and VITE_API_BASE_URL is required.${RESET}`
    );
    process.exit(1);
  }
}
