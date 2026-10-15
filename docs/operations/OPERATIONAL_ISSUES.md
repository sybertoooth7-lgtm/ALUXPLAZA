# Alux Plaza operational issues runbook

## Purpose

This read-only audit helps investigate three operational concerns:

1. Files that appear again after deletion.
2. Render backend deployment/health status.
3. Whether `VITE_API_BASE_URL` is listed for the linked Vercel project's **Production** environment.

It reports evidence and blockers. It does not delete files, deploy, edit settings, or automatically retry failed operations.

## Files included

- `scripts/ops-audit.sh` — read-only audit script.
- `docs/operations/OPERATIONAL_ISSUES.md` — this runbook.

## Run from Git Bash (Windows), WSL, macOS, or Linux

From the repository root:

```bash
bash scripts/ops-audit.sh
```

It creates `ops-audit-report.txt` in the repository root. Review the report before sharing it; it may include repository metadata and public health-endpoint response text. It does not intentionally print the Render API key or environment variable values.

## Git: investigate reappearing deletions

The audit checks these exact paths:

- `PATCH_GUIDE.pdf`
- `VERIFICATION_REPORT.docx`
- `env.example`
- `components/ui/carousel.tsx`
- `components/ui/sidebar.tsx`
- `hooks/use-mobile.ts`

The output includes tracked status, working-tree status, local branch information, remotes, and recent local history. If a file is tracked and its deletion is not committed, a checkout, reset, branch switch, or sync can restore it. If the deletion is committed but a merge or another branch reintroduces it, inspect the listed commit history and the branch that was merged. If it is untracked and reappears, inspect generators, scripts, editor sync, and other tooling.

The audit cannot prove which process recreated a file unless the relevant event is present in Git history or logs. Do not delete the files again until the cause is understood.

## Render checks

For a public health endpoint, set the URL for the current terminal session:

```bash
export RENDER_HEALTH_URL="https://YOUR-SERVICE.onrender.com/health"
```

Use the actual health route defined by the backend; `/health` is only an example.

To query Render service metadata, create/use a Render API key and obtain the service ID from the Render dashboard, then set:

```bash
export RENDER_API_KEY="your-key-in-your-terminal-only"
export RENDER_SERVICE_ID="srv-xxxxxxxx"
```

Then run the script. Do not commit credentials, add them to `.env.example`, or paste them into the report. The API metadata query does not replace checking the latest deploy in the Render dashboard or reviewing deploy logs.

## Vercel check

Install and authenticate the Vercel CLI, then link the local repository to the intended Vercel project using the CLI's normal project-link workflow. Ensure you are in the project's actual Vercel Root Directory before running the audit.

The script checks only whether `VITE_API_BASE_URL` appears in the Production environment listing. It deliberately does not print variable values. Confirm the value privately in Vercel Project Settings → Environment Variables. It should be the intended public Render API base URL and must match the API's expected path convention.

Vite embeds `VITE_*` values into the frontend bundle at build time. After changing the variable, trigger a new deployment; changing the setting alone does not update an already-built bundle. Also check Preview separately if preview deployments are expected to work.

## Manual verification checklist

- [ ] Review the report; note every `ERROR`, `WARNING`, `BLOCKED`, and `NOT CHECKED`.
- [ ] Confirm file deletion is committed on the intended branch before switching branches or syncing.
- [ ] Compare Render's latest deployment status and logs with the expected commit.
- [ ] Confirm the backend health endpoint returns the expected response.
- [ ] Verify `VITE_API_BASE_URL` in Vercel Production without exposing its value.
- [ ] Redeploy only after the configuration is corrected.
- [ ] Verify browser network requests target the expected API and that CORS/authentication work.

## Important

This runbook has not been validated against a fresh checkout of the repository because the execution environment could not resolve `codeload.github.com`. Before merging, confirm paths, shell conventions, the Vercel Root Directory, the actual Render health route, and the current CLI versions in a fresh repository checkout.
