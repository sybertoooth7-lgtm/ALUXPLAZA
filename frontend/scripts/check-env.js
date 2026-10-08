#!/usr/bin/env node
const YELLOW = '\x1b[93m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const RED = '\x1b[91m';

const apiBase = process.env.VITE_API_BASE_URL;
const isProduction = process.env.NODE_ENV === 'production';

if (!apiBase) {
  console.error(`
${YELLOW}${BOLD}⚠ WARNING: VITE_API_BASE_URL is not set for this build.${RESET}
${YELLOW}
If your frontend and backend are deployed to DIFFERENT hosts (e.g. Vercel +
Railway), this build will have NO way to reach the backend. The contact form
and the "live" Defense Matrix metrics will silently fail with 404s in production.

Set VITE_API_BASE_URL to your deployed backend's URL before building, e.g.:
  VITE_API_BASE_URL=https://your-backend.up.railway.app npm run build
${RESET}`);

  if (isProduction) {
    console.error(
      `${RED}${BOLD}Failing build because NODE_ENV=production and VITE_API_BASE_URL is required.${RESET}`
    );
    process.exit(1);
  }
}
