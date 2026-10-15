#!/usr/bin/env bash
# Alux Plaza operational audit. Read-only: it does not deploy, retry, edit, or delete.
# Run from anywhere inside the repository using Git Bash, WSL, or a Linux shell.

set -u

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "ERROR: Not inside a Git repository. Run this script from the repository."
  exit 2
}
cd "$ROOT"

REPORT="${OPS_AUDIT_REPORT:-$ROOT/ops-audit-report.txt}"
: > "$REPORT"

log() {
  printf '%s\n' "$*" | tee -a "$REPORT"
}

section() {
  log ""
  log "================================================================"
  log "$1"
  log "================================================================"
}

section "ALUX PLAZA OPERATIONAL AUDIT"
log "Timestamp (UTC): $(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date)"
log "Repository: $ROOT"
log "Mode: read-only; no deployment, retries, or configuration changes"
log "Report: $REPORT"

section "1. GIT: REAPPEARING FILES"
TARGETS=(
  "PATCH_GUIDE.pdf"
  "VERIFICATION_REPORT.docx"
  "env.example"
  "components/ui/carousel.tsx"
  "frontend/src/components/ui/carousel.tsx"
  "src/components/ui/carousel.tsx"
  "components/ui/sidebar.tsx"
  "frontend/src/components/ui/sidebar.tsx"
  "src/components/ui/sidebar.tsx"
  "hooks/use-mobile.ts"
  "frontend/src/hooks/use-mobile.ts"
  "src/hooks/use-mobile.ts"
)

for file in "${TARGETS[@]}"; do
  log ""
  log "--- $file ---"

  if git ls-files --error-unmatch -- "$file" >/dev/null 2>&1; then
    log "Tracked by Git: YES"
  else
    log "Tracked by Git: NO (at this exact repository-relative path)"
  fi

  if [ -e "$file" ]; then
    log "Present in working tree: YES"
  else
    log "Present in working tree: NO"
  fi

  if git status --short -- "$file" | grep -q .; then
    log "Working-tree/index status:"
    git status --short -- "$file" 2>&1 | tee -a "$REPORT"
  else
    log "Working-tree/index status: clean or not reported"
  fi

  log "Recent history across local branches (if available):"
  git log --all --date=short --format='%h %ad %d %s' --name-status -n 8 -- "$file" 2>&1 \
    | tee -a "$REPORT"
done

log ""
log "Git remotes:"
git remote -v 2>&1 | tee -a "$REPORT"
log "Local branches:"
git branch -vv 2>&1 | tee -a "$REPORT"
log "Recent commits:"
git log -5 --oneline --decorate 2>&1 | tee -a "$REPORT"

section "2. RENDER: SERVICE DEPLOYMENT STATUS"
if [ -n "${RENDER_API_KEY:-}" ] && [ -n "${RENDER_SERVICE_ID:-}" ]; then
  if command -v curl >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
    tmp="$(mktemp)"
    http_code="$(curl --silent --show-error --output "$tmp" --write-out '%{http_code}' \
      --connect-timeout 10 --max-time 25 \
      -H "Authorization: Bearer $RENDER_API_KEY" \
      -H "Accept: application/json" \
      "https://api.render.com/v1/services/$RENDER_SERVICE_ID" 2>&1)"
    curl_rc=$?
    if [ "$curl_rc" -ne 0 ]; then
      log "ERROR: Render API request failed (curl exit $curl_rc)."
      log "$http_code"
    elif [ "$http_code" != "200" ]; then
      log "ERROR: Render API returned HTTP $http_code."
      log "Response body (may contain service metadata):"
      cat "$tmp" | tee -a "$REPORT"
    else
      log "Render API HTTP status: 200"
      node - "$tmp" <<'NODE' 2>&1 | tee -a "$REPORT"
const fs = require("node:fs");
try {
  const data = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const service = data.service ?? data;
  console.log(`Service name: ${service.name ?? "not returned"}`);
  console.log(`Service type: ${service.type ?? "not returned"}`);
  console.log(`Service ID: ${service.id ?? "not returned"}`);
  console.log(`Service suspended: ${service.suspended ?? "not returned"}`);
  console.log("Note: service metadata alone does not prove the latest deploy succeeded.");
} catch (error) {
  console.log(`ERROR: Could not parse Render response: ${error.message}`);
}
NODE
    fi
    rm -f "$tmp"
  else
    log "BLOCKED: curl and node are required for the Render API check."
  fi
else
  log "NOT CHECKED: Set RENDER_API_KEY and RENDER_SERVICE_ID to inspect service metadata."
  log "Do not put the API key in this report or commit it to Git."
fi

if [ -n "${RENDER_HEALTH_URL:-}" ]; then
  if command -v curl >/dev/null 2>&1; then
    tmp="$(mktemp)"
    code="$(curl --silent --show-error --output "$tmp" --write-out '%{http_code}' \
      --connect-timeout 8 --max-time 20 "$RENDER_HEALTH_URL" 2>&1)"
    rc=$?
    if [ "$rc" -eq 0 ]; then
      log "Health URL HTTP status: $code"
      if [ "$code" = "200" ]; then
        log "Health URL result: HTTP 200 (inspect response semantics to confirm app readiness)."
      else
        log "WARNING: Health URL did not return HTTP 200."
      fi
      log "Response body (first 1000 bytes):"
      head -c 1000 "$tmp" | tee -a "$REPORT"
      log ""
    else
      log "ERROR: Health URL request failed (curl exit $rc): $code"
    fi
    rm -f "$tmp"
  else
    log "BLOCKED: curl is required for the health URL check."
  fi
else
  log "NOT CHECKED: Set RENDER_HEALTH_URL to the backend health endpoint."
fi

section "3. VERCEL: VITE_API_BASE_URL CONFIGURATION"
if command -v vercel >/dev/null 2>&1; then
  log "Vercel CLI: $(vercel --version 2>&1 | head -n 1)"
  log "Checking production environment variable names only; values are not printed."
  env_output="$(vercel env ls production 2>&1)"
  env_rc=$?
  if [ "$env_rc" -ne 0 ]; then
    log "ERROR: 'vercel env ls production' failed (exit $env_rc)."
    log "$env_output"
    log "Confirm the current directory is linked to the intended Vercel project and login is valid."
  elif printf '%s\n' "$env_output" | grep -q 'VITE_API_BASE_URL'; then
    log "VITE_API_BASE_URL: FOUND in the production environment listing."
    log "This confirms a variable name is listed, not that its value is correct or the latest build used it."
  else
    log "WARNING: VITE_API_BASE_URL was not found in the production environment listing."
    log "Review the output below for project/target context:"
    log "$env_output"
  fi
else
  log "NOT CHECKED: Vercel CLI is not installed or not on PATH."
  log "Install/login and link the correct project, then rerun. Do not paste secrets into chat."
fi

if [ -d "$ROOT/dist" ]; then
  log ""
  log "Frontend dist directory exists. Checking built assets for obvious localhost URLs."
  matches="$(grep -R -n -E 'http://localhost(:[0-9]+)?|http://127\.0\.0\.1(:[0-9]+)?' "$ROOT/dist" 2>/dev/null | head -n 20 || true)"
  if [ -n "$matches" ]; then
    printf '%s\n' "$matches" | tee -a "$REPORT"
    log "WARNING: Possible local API URLs found in built assets; inspect matches above."
  else
    log "No obvious localhost URL found in dist assets."
  fi
  log "This check does not prove the intended production API URL is embedded."
else
  log ""
  log "Built frontend directory '$ROOT/dist' not found at repository root."
  log "Build from the actual Vercel Root Directory before inspecting generated assets."
fi

section "4. SUMMARY AND LIMITATIONS"
log "This report is evidence for triage, not an automatic repair."
log "A Git history hit does not by itself prove what process restored a file."
log "A successful health request does not prove the latest Render deployment is current."
log "A listed Vercel variable does not prove its value matches the intended Render API."
log "No operation was automatically retried. Resolve failures explicitly and rerun the audit."
log ""
log "Audit finished."
echo ""
echo "Audit finished. Report saved to: $REPORT"
